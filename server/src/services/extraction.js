// Free text (English or Afrikaans, typed or transcribed voice note) -> structured
// grocery items AND to-do tasks. The bot triages a message and routes each thing
// to the shopping list or the family to-do list.
import { claude, firstText } from './claude.js';
import { config } from '../config.js';

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Grocery/household things to BUY',
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
    tasks: {
      type: 'array',
      description: 'To-do tasks / reminders — things to DO, not buy',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative English title, e.g. "Book car service", "Fetch Liam at 3pm". Keep any time/detail in the title since only a title is stored.' },
          original_text: { type: 'string', description: 'The words the sender actually used' }
        },
        required: ['title', 'original_text'],
        additionalProperties: false
      }
    },
    is_grocery_message: { type: 'boolean', description: 'true if at least one grocery item OR task was captured' },
    reply: { type: 'string', description: 'Short friendly confirmation in the language of the sender, listing what was captured (groceries and/or to-dos). Max 1 sentence.' }
  },
  required: ['items', 'tasks', 'is_grocery_message', 'reply'],
  additionalProperties: false
};

const SYSTEM = `You triage short family WhatsApp messages into two kinds of things:
1. Grocery/household SHOPPING items to BUY (milk, loo rolls, dog food, washing powder).
2. TO-DO tasks / reminders — things to DO, not buy (book the car service, fetch Liam at 3, pay the school fees, call the plumber, water the plants).
The family is South African; messages may be in English, Afrikaans, or a mix ("ons is uit melk uit", "onthou om die hond se kos te kry", "need loo rolls asb").
Rules:
- A single message may contain BOTH — split them. "get milk and remind me to book the car" -> 1 item (milk) + 1 task (Book car service).
- Items: normalize to a canonical English name ("loo rolls" -> "toilet paper", "melk" -> "milk"). Default quantity 1 and unit null unless stated. Mark urgency "urgent" only if urgently needed (dringend, asap, vandag nog).
- Tasks: a short imperative English title; keep any time/person/detail in the title (only a title is stored for now).
- If something is genuinely ambiguous, prefer the shopping list for buyable nouns and the to-do list for actions/reminders.
- Greetings, chatter, or questions with neither: items=[], tasks=[], is_grocery_message=false.
- The reply must be short, warm, in the sender's language, and say what was captured (e.g. "✅ Melk bygevoeg + onthou om Liam te kry 👍").`;

export async function triageMessage(text, { senderName = 'someone' } = {}) {
  const message = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Message from ${senderName}:\n"""${text}"""` }],
    output_config: { format: { type: 'json_schema', schema: TRIAGE_SCHEMA } },
  });
  return JSON.parse(firstText(message));
}
