// All checkers.co.za selectors live here so a site redesign is a one-file fix.
// These are best-effort defaults — expect to tune them on the first real run
// (see SETUP.md "Tuning the cart worker"). The worker treats every selector
// failure as a soft failure: the item is flagged needs_review, never a crash.
export const selectors = {
  searchUrl: q => `https://www.checkers.co.za/search?q=${encodeURIComponent(q)}`,
  // product tiles on a search results page
  productTile: '[data-product-id], .product-frame, .item-product',
  productName: '.item-product__name, .product-frame__name, h3, a[title]',
  productPrice: '.special-price, .price, [class*="price"]',
  productLink: 'a',
  // add-to-cart on tile or product page
  addToCart: 'button[title*="Add"], button[class*="add-to-cart"], button:has-text("Add to Cart"), button:has-text("Add")',
  // signs that we are logged in / location is set
  loggedIn: '[class*="account"], [href*="account"]',
};
