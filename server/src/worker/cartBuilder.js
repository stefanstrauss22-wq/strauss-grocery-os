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
import { selectors, parsePriceCents, nameFromTileText, externalIdFromHref } from './selectors.js';
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

let _brandPrefs;
async function brandPrefs() {
  if (_brandPrefs !== undefined) return _brandPrefs;
  const r = await query(`SELECT value FROM settings WHERE key = 'shopping_preferences'`);
  const v = r.rows.length
    ? (typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value)
    : null;
  _brandPrefs = v?.preferred_brands || null;
  return _brandPrefs;
}

const _norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

// Match an item to its preferred-brand entry by token overlap with the key.
function preferredBrandFor(itemName, prefs) {
  if (!prefs) return null;
  const itTok = new Set(_norm(itemName));
  let best = null, bestScore = 0;
  for (const [key, val] of Object.entries(prefs)) {
    const score = _norm(key.replace('/', ' ')).filter(t => itTok.has(t)).length;
    if (score > bestScore) { bestScore = score; best = val; }
  }
  return bestScore > 0 ? best : null;
}

// Turn a verbose brand note into a concise search query, e.g.
// "SASKO Low GI Wholewheat or Blue Ribbon... (buy 4-6)" -> "SASKO Low GI Wholewheat".
function brandSearchTerm(brandText, itemName) {
  if (!brandText) return itemName;
  let t = String(brandText).split(/\bor\b|;|\(|,/i)[0].trim();
  t = t.split(/\s+/).slice(0, 5).join(' ');
  return t || itemName;
}

async function aiPickProduct(itemName, quantity, unit, candidates) {
  if (!aiEnabled() || candidates.length === 0) return null;
  const prefs = await brandPrefs();
  const prefText = prefs
    ? `\n\nTHE FAMILY'S PREFERRED BRANDS (use these unless out of stock or a clearly better deal):\n${Object.entries(prefs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : '';
  const msg = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 500,
    system: `You pick the best supermarket product match for a shopping list item for a South African family of 6. Prefer the family's preferred brands when one matches; otherwise sensible pack sizes, normal (not premium) brands, and best value. Avoid "(sponsored)" listings unless they are genuinely the best match. Return null if nothing matches the item.${prefText}`,
    messages: [{
      role: 'user',
      content: `Item: ${quantity || 1} ${unit || ''} ${itemName}\n\nCandidates:\n${candidates.map((c, i) => `${i}. ${c.name} — ${c.price || 'price unknown'}`).join('\n')}`,
    }],
    output_config: { format: { type: 'json_schema', schema: PICK_SCHEMA } },
  });
  const { pick_index } = JSON.parse(firstText(msg));
  return pick_index === null ? null : candidates[pick_index] || null;
}

/** After the first add the tile shows a +/- stepper; click + to reach the
 *  wanted count. Only for countable units (4 loaves), never amounts (3 L).
 *  Soft: returns how many we actually managed. */
const COUNTABLE = new Set([null, '', 'each', 'pack', 'loaf', 'loaves', 'x']);
async function bumpQuantity(scope, page, item) {
  const want = Math.round(Number(item.quantity) || 1);
  const unit = (item.unit || '').toLowerCase();
  if (want <= 1 || !COUNTABLE.has(unit || null)) return { got: 1, want: COUNTABLE.has(unit || null) ? want : 1 };
  let got = 1;
  for (; got < want; got++) {
    try {
      await scope.locator('button:has-text("+")').first().click({ timeout: 4000 });
      await page.waitForTimeout(700);
    } catch { break; }
  }
  return { got, want };
}

async function scrapeSearchResults(page, itemName, limit = 8) {
  await page.goto(selectors.searchUrl(itemName), { waitUntil: 'domcontentloaded', timeout: 30000 });
  // SPA renders results client-side — wait for real tiles, not a fixed pause.
  await page.waitForSelector(selectors.productTile, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const tiles = page.locator(selectors.productTile);
  const count = Math.min(await tiles.count(), limit);
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const tile = tiles.nth(i);
    const text = (await tile.innerText().catch(() => '')) || '';
    const href = await tile.locator(selectors.productLink).first().getAttribute('href').catch(() => null);
    const name = nameFromTileText(text, href);
    if (!name) continue;
    const sponsored = /sponsored/i.test(text) || /sponsored=true/.test(href || '');
    const priceCents = parsePriceCents(text);
    candidates.push({
      index: i,
      name: sponsored ? `${name} (sponsored)` : name,
      price: priceCents !== null ? `R${(priceCents / 100).toFixed(2)}` : null,
      priceCents,
      url: href ? new URL(href, 'https://www.checkers.co.za').href : null,
      externalId: externalIdFromHref(href),
      tile,
    });
  }
  return candidates;
}

// Verify the saved session is still valid BEFORE shopping. Sixty60 tokens are
// short-lived (hours) and a logged-out build silently adds nothing — search
// still renders, but "Add To Basket" never sticks — so the run used to finish
// as "done, 0 added". We detect a logged-out storefront up front and fail loud.
// Conservative: only report logged-out when we clearly see a sign-in affordance
// and NO account link, so a valid session is never false-failed.
async function isLoggedIn(page) {
  try {
    await page.goto('https://www.checkers.co.za/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    return await page.evaluate(() => {
      const accountLink = !!document.querySelector('a[href*="/account"], a[href*="my-account"], a[href*="logout"], a[href*="sign-out"]');
      if (accountLink) return true; // a profile/logout link only exists when signed in
      const signIn = [...document.querySelectorAll('a,button')].some(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === 'sign in' || t === 'log in' || t === 'login' || t.startsWith('sign in') || t.startsWith('log in');
      });
      return !signIn; // sign-in prompt + no account link => logged out
    });
  } catch {
    return true; // render/network hiccup — don't false-fail a possibly-valid session
  }
}

// Best-effort read of the running cart total shown in the header (e.g. "R104.99").
async function cartTotalCents(page) {
  try {
    return await page.evaluate(() => {
      const re = /R\s?(\d[\d\s]*)[.,](\d{2})/;
      let found = null;
      for (const el of document.querySelectorAll('a,span,div,button,p,strong')) {
        if (el.children.length) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.top > 170) continue; // header band only
        const m = (el.textContent || '').match(re);
        if (m) found = Number(m[1].replace(/\D/g, '')) * 100 + Number(m[2]);
      }
      return found;
    });
  } catch { return null; }
}

// Click "Add To Basket" and VERIFY the cart total rose before moving on.
// Returns 'added' (confirmed), 'failed' (total did not change), or
// 'unverified' (couldn't read the total — assume added but flag for a look).
// The wait also prevents navigating away and cancelling the in-flight add.
async function addToCart(scope, page) {
  const before = await cartTotalCents(page);
  const btn = scope.locator(selectors.addToCart).first();
  await btn.click({ timeout: 8000 });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(800);
    const after = await cartTotalCents(page);
    if (before != null && after != null && after > before) return { result: 'added', afterCents: after };
  }
  const finalAfter = await cartTotalCents(page);
  if (before != null && finalAfter != null) {
    return finalAfter > before ? { result: 'added', afterCents: finalAfter } : { result: 'failed', afterCents: finalAfter };
  }
  await page.waitForTimeout(1200); // couldn't read — still give the add time to land
  return { result: 'unverified', afterCents: finalAfter };
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

export async function buildCart(runId, { keepOpen = false } = {}) {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error('No Sixty60 session found. Run: npm run sixty60:login');
  }
  let failed = false;
  const items = (await query(`SELECT * FROM shopping_items WHERE status = 'pending' ORDER BY category, name`)).rows;
  // Visible browser by default: the Sixty60 site's bot protection is kinder to
  // headed browsers, and watching the robot shop is half the fun. Set
  // CART_HEADLESS=1 to hide it once everything is proven stable.
  const browser = await launchBrowser({ headless: process.env.CART_HEADLESS === '1' });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();
  const counts = { added: 0, needs_review: 0, error: 0, tier1: 0, tier2: 0 };
  let totalCents = 0;

  try {
    // Stale-session guard: bail before shopping if the saved login has expired,
    // rather than dutifully "adding" items to a guest cart that never persists.
    if (!(await isLoggedIn(page))) {
      throw new Error('Checkers session expired — run "Checkers Login" (npm run sixty60:login) on the home PC, then build again.');
    }
    for (const item of items) {
      try {
        const match = await matchCatalog(item.name);
        // ---- Tier 1: confirmed mapping with a direct product URL ----
        if (match && match.entry.confidence === 'confirmed' && match.entry.product_url) {
          try {
            await page.goto(match.entry.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(1500);
            const add = await addToCart(page, page);
            if (add.result === 'failed') throw new Error('add did not register'); // fall through to search
            const q = await bumpQuantity(page, page, item);
            counts.added++; counts.tier1++;
            totalCents += (match.entry.last_price_cents || 0) * q.got;
            const notes = [];
            if (q.got < q.want) notes.push(`wanted ${q.want}, set ${q.got} — adjust qty in the app`);
            else if (q.want > 1) notes.push(`qty ${q.got}`);
            if (add.result === 'unverified') notes.push('could not confirm — check the trolley');
            await recordResult(runId, item, { tier: 1, status: 'added', productName: match.entry.product_name, productUrl: match.entry.product_url, priceCents: match.entry.last_price_cents, note: notes.join('; ') || null });
            continue;
          } catch (err) {
            // fall through to tier 2 — product page may have changed or item out of stock
            console.warn(`tier1 failed for ${item.name}: ${err.message}`);
          }
        }
        // ---- Tier 2: search + (AI) pick ----
        // If we know the family's preferred brand, search for it directly so the
        // right product is actually among the results (not buried past the top few).
        const prefs = await brandPrefs();
        const preferred = preferredBrandFor(item.name, prefs);
        let candidates = [];
        if (preferred) candidates = await scrapeSearchResults(page, brandSearchTerm(preferred, item.name));
        if (!candidates.length) candidates = await scrapeSearchResults(page, item.name);
        let picked = null;
        if (match && match.entry) {
          // we know the product name — find it in results without AI
          picked = candidates.find(c => c.name.toLowerCase().includes(match.entry.product_name.toLowerCase().slice(0, 15))) || null;
        }
        if (!picked) picked = await aiPickProduct(item.name, item.quantity, item.unit, candidates);
        if (picked) {
          try {
            const add = await addToCart(picked.tile, page);
            if (add.result === 'failed') {
              // genuinely didn't go into the cart — flag rather than lie
              counts.needs_review++;
              await recordResult(runId, item, { tier: 3, status: 'needs_review', productName: picked.name, productUrl: picked.url, note: 'found it but the add did not register — add it manually' });
              continue;
            }
            const q = await bumpQuantity(picked.tile, page, item);
            const priceCents = picked.priceCents ?? null;
            counts.added++; counts.tier2++;
            totalCents += (priceCents || 0) * q.got;
            await saveMapping({ itemName: item.name, productName: picked.name, productUrl: picked.url, externalProductId: picked.externalId, priceCents, confidence: 'suggested' });
            const notes = [];
            if (q.got < q.want) notes.push(`wanted ${q.want}, set ${q.got} — adjust qty in the app`);
            else if (q.want > 1) notes.push(`qty ${q.got}`);
            if (add.result === 'unverified') notes.push('could not confirm — check the trolley');
            await recordResult(runId, item, { tier: 2, status: 'added', productName: picked.name, productUrl: picked.url, priceCents, note: notes.join('; ') || null });
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
    // est_total = sum of the picked item prices (reliable). The on-page header
    // read is kept only as a secondary signal — it's easily fooled by other
    // "Rxx" text near the top, so we don't display it as the grand total.
    const headerRead = await cartTotalCents(page);
    // Backstop: if there were items to buy but NONE went in, treat it as a
    // failure (most often an expired login the up-front check didn't catch, or
    // site-wide breakage) instead of reporting a misleading "done, 0 added".
    const noneAdded = items.length > 0 && counts.added === 0;
    const summary = { ...counts, total_items: items.length, est_total_cents: totalCents, header_total_cents: headerRead };
    if (noneAdded) summary.error = `Added 0 of ${items.length} items — your Checkers login has likely expired. Run "Checkers Login", then build again.`;
    await query(
      `UPDATE cart_runs SET status = $3, finished_at = now(), summary = $1 WHERE id = $2`,
      [JSON.stringify(summary), runId, noneAdded ? 'failed' : 'done']);
    console.log('cart run complete:', counts, 'est total:', `R${(totalCents / 100).toFixed(2)}`);
  } catch (err) {
    failed = true;
    await query(`UPDATE cart_runs SET status = 'failed', finished_at = now(), summary = $1 WHERE id = $2`,
      [JSON.stringify({ error: err.message, ...counts }), runId]);
    throw err;
  } finally {
    if (keepOpen && !failed) {
      // Leave the window open on the storefront so the human can review the
      // trolley and check out. The cart lives on the Checkers account, so the
      // items are already there — they just click the trolley icon (top-right).
      try { await page.goto('https://www.checkers.co.za/', { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch { /* stay put */ }
      console.log('\n────────────────────────────────────────────────────────');
      console.log('🛒  Cart filled — the browser is staying OPEN for you.');
      console.log('    Click the trolley icon (top-right) to review your basket,');
      console.log('    choose a delivery slot, and check out & pay in this window.');
      console.log('    When you are done, just CLOSE the browser window.');
      console.log('────────────────────────────────────────────────────────\n');
      await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
    }
    await browser.close().catch(() => {});
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
    await buildCart(runId, { keepOpen: true });
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
