// All checkers.co.za selectors live here so a site redesign is a one-file fix.
// Verified against the live Sixty60 site on 2026-06-10 via src/worker/diagnose.js:
//   - search URL param is `Search` (capital S), NOT `q`
//   - tiles:  <div class="product-card_card__XXXX ...">
//   - links:  /product/<slug>-<externalId>   e.g. /product/clover-fresh-full-cream-milk-2l-10136729EA
//   - price rendered as two nodes: "R37" + ".99"
//   - button text: "Add To Basket"
// Class hashes (e.g. __DsB3_) change on their redeploys — we match on the stable
// "product-card_card__" prefix and otherwise parse tile text, not classes.
export const selectors = {
  searchUrl: q => `https://www.checkers.co.za/search?Search=${encodeURIComponent(q)}`,
  productTile: '[class*="product-card_card__"]',
  productLink: 'a[href*="/product/"]',
  addToCart: 'button:has-text("To Basket"), button:has-text("Add")',
  loggedIn: '[class*="account"], [href*="account"]',
};

/** "R37\n.99" / "R37 .99" / "R104,99" -> cents. Null if no price found. */
export function parsePriceCents(text) {
  const m = String(text || '').match(/R\s*(\d+)\s*[\r\n|.,]+\s*(\d{2})\b/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  const whole = String(text || '').match(/R\s*(\d+)\b/);
  return whole ? Number(whole[1]) * 100 : null;
}

/** Pull a human product name out of a tile's innerText lines. */
export function nameFromTileText(text, fallbackHref) {
  const junk = /^(add|to basket|sponsored|deal|save|r\s*\d|\.\d{2}|\d{1,2}\s*[-–]\s*\d{1,2}\s*(am|pm)|mon|tue|wed|thu|fri|sat|sun)/i;
  const lines = String(text || '').split(/[\r\n|]+/).map(s => s.trim()).filter(Boolean);
  const candidates = lines.filter(l => l.length > 8 && !junk.test(l));
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0];
  // fallback: derive from the URL slug, e.g. clover-fresh-full-cream-milk-2l-10136729EA
  if (fallbackHref) {
    const slug = fallbackHref.split('/product/')[1] || '';
    return slug.replace(/-\d+[A-Z0-9]*(\?.*)?$/, '').replace(/-/g, ' ');
  }
  return null;
}

/** /product/clover-...-10136729EA -> "10136729EA" (retailer product id). */
export function externalIdFromHref(href) {
  const m = String(href || '').match(/-(\d{6,}[A-Z0-9]*)(\?.*)?$/);
  return m ? m[1] : null;
}
