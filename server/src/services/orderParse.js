// Parse a pasted/emailed Checkers Sixty60 order into structured line items.
import { claude, firstText } from './claude.js';
import { config } from '../config.js';

const ORDER_SCHEMA = {
  type: 'object',
  properties: {
    order_ref: { type: ['string', 'null'], description: 'Order number if present' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product: { type: 'string', description: 'Exact product name as shown, e.g. "Clover Butro Full Cream Modified Butter Spread 500g"' },
          ingredient: { type: 'string', description: 'Short generic grocery word for the shopping list, lowercase singular: "bread", "butter", "eggs", "yoghurt", "curry powder", "cheese grillers"' },
          quantity: { type: 'number' },
          price_cents: { type: 'integer', description: 'PER-ITEM price in cents (e.g. R109.99 -> 10999), not the line total' },
          category: { type: 'string', enum: ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'household', 'toiletries', 'pet', 'other'] },
        },
        required: ['product', 'ingredient', 'quantity', 'price_cents', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['order_ref', 'items'],
  additionalProperties: false,
};

const SYSTEM = `You extract the purchased line items from a South African Checkers Sixty60 order confirmation or invoice. The input may be clean text, messy text, or HTML-stripped text — the layout varies. A typical line gives a product name, a quantity ("Qty 2" / "x2" / "2 x"), a per-item price ("R 64.99"), and sometimes a line total. Product names are full retail names like "Clover Butro Full Cream Modified Butter Spread 500g" or "Blue Ribbon Wholewheat Brown Bread 800g".

For EVERY real product return: the exact product name, a short generic "ingredient" word a family would write on a shopping list (lowercase, e.g. "bread", "butter", "eggs", "yoghurt", "curry powder", "cheese grillers"), the quantity bought, and the PER-ITEM price in cents (R109.99 -> 10999, NOT the line total).

Be thorough — capture all products even if formatting is irregular. Ignore only: delivery/service fees, driver tips, subtotals/totals, VAT lines, promo/discount lines (e.g. "Buy 2 For R110", "-R19.98"), loyalty/marketing text, addresses, and order metadata. If a price or quantity is genuinely missing, use 0. Never return an empty list if any product names are present.`;

// Collapse HTML email bodies to readable text so the item lines survive and the
// payload stays small (Sixty60 invoice HTML can be >200KB of boilerplate).
function htmlToText(s) {
  if (!/<[a-z][\s\S]*>/i.test(s)) return s; // already plain text
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(tr|div|p|li|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export async function parseOrder(text) {
  const clean = htmlToText(String(text)).slice(0, 60000);
  const message = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Order content:\n"""${clean}"""` }],
    output_config: { format: { type: 'json_schema', schema: ORDER_SCHEMA } },
  });
  return JSON.parse(firstText(message));
}
