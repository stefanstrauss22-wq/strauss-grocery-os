// Weekly meal plan generation: household profile + weekly wizard context -> 7 dinners
// with recipes and ingredient lists, as a structured object.
import { claude, firstText } from './claude.js';
import { config } from '../config.js';

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
          title: { type: 'string' },
          description: { type: 'string', description: '1-2 sentences selling the meal to the family' },
          cuisine: { type: 'string' },
          prep_minutes: { type: 'integer' },
          cook_minutes: { type: 'integer' },
          servings: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          est_cost_rand: { type: 'integer', description: 'Estimated ingredient cost in South African Rand for the whole meal' },
          instructions: { type: 'string', description: 'Numbered cooking steps, concise' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'lowercase singular English, shoppable form, e.g. "chicken thighs", "basmati rice"' },
                quantity: { type: 'number' },
                unit: { type: ['string', 'null'] },
                category: { type: 'string', enum: ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'household', 'other'] }
              },
              required: ['name', 'quantity', 'unit', 'category'],
              additionalProperties: false
            }
          }
        },
        required: ['day', 'title', 'description', 'cuisine', 'prep_minutes', 'cook_minutes', 'servings', 'tags', 'est_cost_rand', 'instructions', 'ingredients'],
        additionalProperties: false
      }
    },
    week_summary: { type: 'string', description: 'One short paragraph: theme of the week, total estimated cost, how it fits the constraints' }
  },
  required: ['meals', 'week_summary'],
  additionalProperties: false
};

const SYSTEM = `You are the meal planner for a South African family of 6 (2 parents, 3 active teens, plus a domestic worker who sometimes joins lunch). You plan a rolling 7-day run of dinners. The run can start on ANY weekday — plan exactly the days you are given, in order, using their weekday names.

Principles:
- South African context: realistic Checkers/local supermarket ingredients and prices in Rand. Mix of SA classics (bobotie, potjie, braai, boerewors) and international meals.
- Respect the schedule: on nights marked "quick" the meal must need <= 20 min active time; on nights marked "not cooking" plan a no-cook fallback (leftovers, toasted sandwiches, takeaway note) with an empty ingredient list.
- Respect the budget: keep the week's total estimated ingredient cost within the stated budget. Use cheaper cuts and seasonal produce when budget is tight.
- Honour the mood chips exactly (braai night, fish night, vegetarian night, one-pot, air fryer, use-up-the-freezer, leftover night, old favourites vs try-something-new).
- Avoid the listed dislikes and allergies absolutely.
- Ingredients must be shoppable: name them the way a supermarket product is named, with realistic pack-relevant quantities. Exclude pantry staples the family always has (salt, pepper, cooking oil) unless the recipe needs an unusual amount.
- If some days are already locked, those meals are fixed: do NOT plan or duplicate them — only fill the open days, and avoid repeating the locked meals.
- The weekend / Sunday is the big family meal unless told otherwise.`;

export async function generatePlan(context) {
  const stream = claude().messages.stream({
    model: config.plannerModel,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Plan dinners for this 7-day run. Plan ONLY the days listed in "days_to_plan" (each with its date + weekday); copy nothing for the "locked_days" — those are already fixed and must not be repeated. Return one meal object per day you plan, keyed by its weekday name.\n\nHousehold profile:\n${JSON.stringify(context.profile || {}, null, 2)}\n\nThis run's context (the 7 dates, which days to plan vs locked, budget in Rand, schedule per weekday, mood chips, items already at home, recent meals to avoid repeating, favourites to consider):\n${JSON.stringify(context.week || {}, null, 2)}`
    }],
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
  });
  const message = await stream.finalMessage();
  return JSON.parse(firstText(message));
}

/** Regenerate a single meal slot, keeping the rest of the week fixed. */
export async function swapMeal(context, currentPlan, day, reason) {
  const stream = claude().messages.stream({
    model: config.plannerModel,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Here is the current week plan:\n${JSON.stringify(currentPlan, null, 2)}\n\nReplace ONLY the meal for ${day}. Reason for the swap: "${reason || 'family wants something different'}".\nThe replacement must not duplicate any other meal this week and must satisfy the same constraints:\n${JSON.stringify(context, null, 2)}\n\nReturn a full plan object but change only the ${day} entry; copy the other days through unchanged.`
    }],
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
  });
  const message = await stream.finalMessage();
  return JSON.parse(firstText(message));
}
