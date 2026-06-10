// Free text (English or Afrikaans, typed or transcribed voice note) -> structured grocery items.
import { claude, firstText } from './claude.js';
import { config } from '../config.js';

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Canonical English item name, singular, lowercase, e.g. "milk", "toilet paper", "dog food"' },
          original_text: { type: 'string', description: 'The words the sender actually used' },
          quantity: { type: 'number' },
          unit: { type: ['string', 'null'], description: 'kg, g, L, ml, each, pack, or null' },
          category: { type: 'string', enum: ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'household', 'toiletries', 'pet', 'other'] },
          urgency: { type: 'string', enum: ['normal', 'urgent'] }
        },
        required: ['name', 'original_text', 'quantity', 'unit', 'category', 'urgency'],
        additionalProperties: false
      }
    },
    is_grocery_message: { type: 'boolean', description: 'false if the message contains no grocery items at all' },
    reply: { type: 'string', description: 'Short friendly confirmation in the language of the sender, e.g. "✅ Melk en brood bygevoeg!" Max 1 sentence.' }
  },
  required: ['items', 'is_grocery_message', 'reply'],
  additionalProperties: false
};

const SYSTEM = `You extract grocery/household shopping items from short family WhatsApp messages.
The family is South African; messages may be in English, Afrikaans, or a mix ("ons is uit melk uit", "need loo rolls asb").
Rules:
- Extract every distinct purchasable item. Normalize to a canonical English name ("loo rolls" -> "toilet paper", "melk" -> "milk").
- Default quantity 1 and unit null unless stated.
- Mark urgency "urgent" only if the message says it is urgently needed (dringend, asap, vandag nog).
- Greetings, chatter, or questions with no items: is_grocery_message=false, items=[].
- The reply must be short, warm, in the sender's language, and list what was captured.`;

export async function extractGroceryItems(text, { senderName = 'someone' } = {}) {
  const message = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Message from ${senderName}:\n"""${text}"""` }],
    output_config: { format: { type: 'json_schema', schema: ITEM_SCHEMA } },
  });
  return JSON.parse(firstText(message));
}
