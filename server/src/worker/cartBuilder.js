// Tiered Sixty60 cart builder.
//   Tier 1: confirmed catalog mapping with a product URL -> direct add (no AI)
//   Tier 2: search the site, scrape candidates, Claude picks the best -> add + save mapping
//   Tier 3: nothing usable -> flag needs_review with a search link
// The run NEVER checks out — it fills the cart and writes a summary for human approval.
import fs from 'node:fs';
import { query } from '../db/db.js';
import { matchCatalog, saveMapping, searchLink } from '../services/catalogMatch.js';
import { claude, firstText, aiEnabled } from '../services/claude.js';
import { config } from '../config.js';
import { selectors } from './selectors.js';
import { launchBrowser, STATE_PATH } from './sixty60Login.js';

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    pick_index: { type: ['integer', 'null'], description: 'Index of the best product, or null if none is a sensible match' },
    reason: { type: 'string' },
  },
  required: ['pick_index', 'reason'],
  additionalProperties: false,
};

async function aiPickProduct(itemName, quantity, unit, candidates) {
  if (!aiEnabled() || candidates.length === 0) return null;
  const msg = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 500,
    system: 'You pick the best supermarket product match for a shopping list item for a South African family of 6. Prefer sensible pack sizes, normal (not premium) brands, and best value. Return null if nothing matches the item.',
    messages: [{
      role: 'user',
      content: `Item: ${quantity || 1} ${unit || ''} ${itemName}\n\nCandidates:\n${candidates.map((c, i) => `${i}. ${c.name} — ${c.price || 'price unknown'}`).join('\n')}`,
    }],
    output_config: { format: { type: 'json_schema', schema: PICK_SCHEMA } },
  });
  const { pick_index } = JSON.parse(firstText(msg));
  return pick_index === null ? null : candidates[pick_index] || null;
}

function parsePriceCents(text) {
  const m = String(text || '').replace(/\s/g, '').match(/R?(\d+)[.,](\d{2})/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

async function scrapeSearchResults(page, itemName, limit = 6) {
  await page.goto(selectors.searchUrl(itemName), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500); // let client-side rendering settle
  const tiles = page.locator(selectors.productTile);
  const count = Math.min(await tiles.count(), limit);
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const tile = tiles.nth(i);
    const name = (await tile.locator(selectors.productName).first().textContent().catch(() => null))?.trim();
    const price = (await tile.locator(selectors.productPrice).first().textContent().catch(() => null))?.trim();
    const href = await tile.locator(selectors.productLink).first().getAttribute('href').catch(() => null);
    if (name) candidates.push({ index: i, name, price, url: href ? new URL(href, 'https://www.checkers.co.za').href : null, tile });
  }
  return candidates;
}

async function addToCart(scope) {
  const btn = scope.locator(selectors.addToCart).first();
  await btn.click({ timeout: 8000 });
  return true;
}

async function recordResult(runId, item, { tier, status, productName = null, productUrl = null, priceCents = null, note = null }) {
  await query(
    `INSERT INTO cart_run_items (run_id, shopping_item_id, tier, status, product_name, product_url, price_cents, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [runId, item.id, tier, status, productName, productUrl, priceCents, note]);
  if (status === 'added' || status === 'substituted') {
    await query(`UPDATE shopping_items SET status = 'in_cart', updated_at = now() WHERE id = $1`, [item.id]);
  }
}

export async function buildCart(runId) {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error('No Sixty60 session found. Run: npm run sixty60:login');
  }
  const items = (await query(`SELECT * FROM shopping_items WHERE status = 'pending' ORDER BY category, name`)).rows;
  const browser = await launchBrowser({ headless: true });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();
  const counts = { added: 0, needs_review: 0, error: 0, tier1: 0, tier2: 0 };
  let totalCents = 0;

  try {
    for (const item of items) {
      try {
        const match = await matchCatalog(item.name);
        // ---- Tier 1: confirmed mapping with a direct product URL ----
        if (match && match.entry.confidence === 'confirmed' && match.entry.product_url) {
          try {
            await page.goto(match.entry.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(1500);
            await addToCart(page);
            counts.added++; counts.tier1++;
            totalCents += match.entry.last_price_cents || 0;
            await recordResult(runId, item, { tier: 1, status: 'added', productName: match.entry.product_name, productUrl: match.entry.product_url, priceCents: match.entry.last_price_cents });
            continue;
          } catch (err) {
            // fall through to tier 2 — product page may have changed or item out of stock
            console.warn(`tier1 failed for ${item.name}: ${err.message}`);
          }
        }
        // ---- Tier 2: search + (AI) pick ----
        const candidates = await scrapeSearchResults(page, item.name);
        let picked = null;
        if (match && match.entry) {
          // we know the product name — find it in results without AI
          picked = candidates.find(c => c.name.toLowerCase().includes(match.entry.product_name.toLowerCase().slice(0, 15))) || null;
        }
        if (!picked) picked = await aiPickProduct(item.name, item.quantity, item.unit, candidates);
        if (picked) {
          try {
            await addToCart(picked.tile);
            const priceCents = parsePriceCents(picked.price);
            counts.added++; counts.tier2++;
            totalCents += priceCents || 0;
            await saveMapping({ itemName: item.name, productName: picked.name, productUrl: picked.url, priceCents, confidence: 'suggested' });
            await recordResult(runId, item, { tier: 2, status: 'added', productName: picked.name, productUrl: picked.url, priceCents });
            continue;
          } catch (err) {
            console.warn(`tier2 add failed for ${item.name}: ${err.message}`);
          }
        }
        // ---- Tier 3: flag for the human ----
        counts.needs_review++;
        await recordResult(runId, item, { tier: 3, status: 'needs_review', note: candidates.length ? 'no confident match' : 'no search results', productUrl: searchLink(item.name) });
      } catch (err) {
        counts.error++;
        await recordResult(runId, item, { tier: 3, status: 'error', note: err.message, productUrl: searchLink(item.name) });
      }
    }
    await query(
      `UPDATE cart_runs SET status = 'done', finished_at = now(), summary = $1 WHERE id = $2`,
      [JSON.stringify({ ...counts, total_items: items.length, est_total_cents: totalCents }), runId]);
    console.log('cart run complete:', counts);
  } catch (err) {
    await query(`UPDATE cart_runs SET status = 'failed', finished_at = now(), summary = $1 WHERE id = $2`,
      [JSON.stringify({ error: err.message, ...counts }), runId]);
    throw err;
  } finally {
    await browser.close();
  }
}

// CLI: node cartBuilder.js [--run-id N]
if (process.argv[1] && process.argv[1].endsWith('cartBuilder.js')) {
  (async () => {
    let runId;
    const idx = process.argv.indexOf('--run-id');
    if (idx > -1) {
      runId = Number(process.argv[idx + 1]);
    } else {
      const { rows } = await query(`INSERT INTO cart_runs (status) VALUES ('running') RETURNING id`);
      runId = rows[0].id;
    }
    await buildCart(runId);
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
