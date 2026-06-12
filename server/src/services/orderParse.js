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

const SYSTEM = `You extract the purchased line items from a South African Checkers Sixty60 order confirmation or invoice (plain text or HTML).
For each real product line return: the exact product name, a short generic "ingredient" word a family would write on a shopping list, the quantity bought, and the PER-ITEM price in cents.
Ignore: delivery/service fees, tips, subtotals/totals, VAT lines, promo/discount lines (e.g. "Buy 2 For R110", "-R19.98"), loyalty messaging, and any non-product text.
If a price or quantity is genuinely missing, use 0.`;

export async function parseOrder(text) {
  const message = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Order content:\n"""${String(text).slice(0, 120000)}"""` }],
    output_config: { format: { type: 'json_schema', schema: ORDER_SCHEMA } },
  });
  return JSON.parse(firstText(message));
}
