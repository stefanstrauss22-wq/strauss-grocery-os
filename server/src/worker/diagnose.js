// Diagnostic v2: do a REAL search via the site's search box, capture the
// resulting URL, and auto-detect product tile structure.
// Run: node src/worker/diagnose.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, STATE_PATH } from './sixty60Login.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');

const browser = await launchBrowser({ headless: false });
const ctx = await browser.newContext({ storageState: STATE_PATH });
const page = await ctx.newPage();

console.log('opening home page...');
await page.goto('https://www.checkers.co.za/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(5000);

console.log('typing into the search box...');
// The header has TWO inputs: the address bar ("Enter your address", readonly)
// and the product search ("Search products and brands"). Target the latter only,
// and type via keyboard — clicking it may open a search overlay with its own input.
const searchBox = page.getByPlaceholder(/search products/i).first();
await searchBox.click({ timeout: 15000 });
await page.waitForTimeout(1500);
await page.keyboard.type('milk', { delay: 60 });
await page.keyboard.press('Enter');
await page.waitForTimeout(8000); // let results render

console.log('\n=== REAL SEARCH URL ===');
console.log(page.url());

// Auto-detect product tiles: find leaf-ish elements containing a Rand price,
// then report the class names of their likely tile containers.
const analysis = await page.evaluate(() => {
  const priceRe = /R\s?\d+([.,]\d{2})?/;
  const all = [...document.querySelectorAll('body *')];
  const priceEls = all.filter(el =>
    el.children.length === 0 && priceRe.test(el.textContent || '') && (el.textContent || '').length < 30);
  const tally = {};
  const samples = [];
  for (const el of priceEls.slice(0, 60)) {
    // climb to a container that also holds a link (a product tile usually wraps an <a>)
    let node = el;
    for (let i = 0; i < 8 && node.parentElement; i++) {
      node = node.parentElement;
      if (node.querySelector('a[href]') && (node.innerText || '').length > 20) break;
    }
    const cls = (node.className && typeof node.className === 'string')
      ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.')
      : node.tagName.toLowerCase();
    tally[cls] = (tally[cls] || 0) + 1;
    if (samples.length < 4) {
      const a = node.querySelector('a[href]');
      samples.push({
        containerClass: cls,
        text: (node.innerText || '').replace(/\n+/g, ' | ').slice(0, 160),
        href: a ? a.getAttribute('href') : null,
        buttons: [...node.querySelectorAll('button')].map(b => (b.innerText || b.title || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 4),
      });
    }
  }
  return { priceCount: priceEls.length, containerTally: tally, samples };
});

console.log('\n=== PRICE ELEMENTS FOUND ===', analysis.priceCount);
console.log('\n=== LIKELY TILE CONTAINERS (class -> count) ===');
console.log(JSON.stringify(analysis.containerTally, null, 2));
console.log('\n=== SAMPLE TILES ===');
console.log(JSON.stringify(analysis.samples, null, 2));

console.log('\n=== PRODUCT-LIKE LINKS (first 10) ===');
const hrefs = await page.locator('a').evaluateAll(els =>
  [...new Set(els.map(e => e.getAttribute('href'))
    .filter(h => h && (h.includes('/p/') || h.includes('product'))))].slice(0, 10));
console.log(JSON.stringify(hrefs, null, 2));

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'diag.html'), await page.content());
await page.screenshot({ path: path.join(dataDir, 'diag.png'), fullPage: false }).catch(() => {});
console.log('\nSaved data/diag.html + data/diag.png. Browser closes in 15s.');
await page.waitForTimeout(15000);
await browser.close();
process.exit(0);
