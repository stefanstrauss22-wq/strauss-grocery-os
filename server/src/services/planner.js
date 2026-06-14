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
          meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
          title: { type: 'string' },
          description: { type: 'string', description: '1-2 sentences selling the meal to the family' },
          cuisine: { type: 'string' },
          prep_minutes: { type: 'integer' },
          cook_minutes: { type: 'integer' },
          servings: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          est_cost_rand: { type: 'integer', description: 'Estimated ingredient cost in South African Rand for the whole meal' },
          nutrition: {
            type: 'object',
            description: 'Approximate nutrition PER SERVING (one plate, not the whole pot). Honest estimates for a typical portion at the stated servings.',
            properties: {
              calories_kcal: { type: 'integer', description: 'kilocalories per serving' },
              protein_g: { type: 'integer', description: 'grams of protein per serving' },
              carbs_g: { type: 'integer', description: 'grams of carbohydrate per serving' },
              fat_g: { type: 'integer', description: 'grams of fat per serving' },
              fibre_g: { type: 'integer', description: 'grams of fibre per serving' }
            },
            required: ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'],
            additionalProperties: false
          },
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
        required: ['day', 'meal_type', 'title', 'description', 'cuisine', 'prep_minutes', 'cook_minutes', 'servings', 'tags', 'est_cost_rand', 'nutrition', 'instructions', 'ingredients'],
        additionalProperties: false
      }
    },
    week_summary: { type: 'string', description: 'One short paragraph: theme of the week, total estimated cost, how it fits the constraints' }
  },
  required: ['meals', 'week_summary'],
  additionalProperties: false
};

const SYSTEM = `You are the meal planner for a South African family of 6 (2 parents, 3 active teens, plus a domestic worker who sometimes joins lunch). You plan meals for a rolling run of days (3 to 7 days), starting on ANY weekday. For each day you may be asked for breakfast, lunch and/or dinner. Plan EXACTLY the meals listed in "to_plan" — one meal object per item, each carrying its weekday ("day") and its "meal_type".

Principles:
- South African context: realistic Checkers/local supermarket ingredients and prices in Rand. Mix of SA classics (bobotie, potjie, braai, boerewors, pap) and international meals.
- Make each meal fit its meal_type:
  - "breakfast" — a morning meal (eggs, oats, yoghurt & granola, toast, breakfast wraps, smoothies). Usually quick and lighter; smaller portions and lower cost than dinner.
  - "lunch" — a lighter midday meal: sandwiches, salads, wraps, soups, leftovers, lunchbox-friendly options.
  - "dinner" — the main meal of the day.
- Respect each meal's "style" exactly:
  - "normal" — a standard meal for that meal_type.
  - "quick" — must need <= 20 min active time (<= 10 min for breakfast).
  - "braai" — a South African braai / grill meal (boerewors, sosaties, lamb chops, steak, braai broodjies). [dinner]
  - "fish" — a fish or seafood main. [dinner/lunch]
  - "air_fryer" — a meal built around the air fryer.
  - "leftover" — use up leftovers, minimal effort; keep the ingredient list empty or very small.
  - "off" — not eating in / skipping: a no-cook fallback with an empty ingredient list.
- Respect the budget: keep the week's total estimated ingredient cost within the stated budget. Use cheaper cuts and seasonal produce when budget is tight.
- Honour the mood chips exactly (cheaper week, one-pot, use up the freezer, old favourites vs try-something-new, kid-friendly, no spicy food).
- Avoid the listed dislikes and allergies absolutely.
- Ingredients must be shoppable: name them the way a supermarket product is named, with realistic pack-relevant quantities. Exclude pantry staples the family always has (salt, pepper, cooking oil) unless the recipe needs an unusual amount.
- Give honest per-serving nutrition (calories, protein, carbs, fat, fibre) for a single plated portion at the stated servings — not the whole pot. For a no-cook / "off" night with no real meal, use small or zero values.
- Some meals may already be locked ("locked_meals", each a day + meal_type): those are fixed — do NOT plan or duplicate them, and avoid repeating them.
- Vary meals across the run: do not repeat the same dish, and avoid clashing a heavy lunch with a heavy dinner on the same day.
- The weekend / Sunday is the big family dinner unless told otherwise.`;

// Recipes are ALWAYS authored and stored in English (canonical). Afrikaans is
// produced at display time by the /api/translate layer and cached, so both
// languages stay consistent and Sixty60 always has English ingredient names.
// We must force English EXPLICITLY: the context (mood chips, the recent-meals
// list) often arrives in Afrikaans, and the model otherwise mirrors that and
// replies in Afrikaans — which would then round-trip back to English through
// the display translator.
function languageInstruction() {
  return `\n\nLANGUAGE — IMPORTANT: Write ALL recipe text in ENGLISH — every "title", "description", "instructions", "tags", "cuisine" and "week_summary" — even though some context above (mood chips, recent meal names) may be in Afrikaans. Ingredient "name" fields must be lowercase English shoppable supermarket form (e.g. "chicken thighs", "basmati rice"). Do NOT output any Afrikaans; the app translates to Afrikaans for display on its own.`;
}

export async function generatePlan(context) {
  const toPlan = context.week?.to_plan || [];
  // Headroom for up to 7 days x 3 meals; scale with the work list.
  const maxTokens = Math.min(64000, 12000 + toPlan.length * 2200);
  const stream = claude().messages.stream({
    model: config.plannerModel,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Plan exactly the ${toPlan.length} meals in "to_plan" — each item gives a date, weekday, meal_type and style. Return one meal object per item, carrying its weekday ("day") and "meal_type". Do NOT plan anything in "locked_meals"; those are fixed and must not be repeated.\n\nHousehold profile:\n${JSON.stringify(context.profile || {}, null, 2)}\n\nThis run's context (the meals to plan, locked meals, budget in Rand, mood chips, items already at home, recent meals to avoid repeating, favourites to consider):\n${JSON.stringify(context.week || {}, null, 2)}${languageInstruction(context)}`
    }],
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
  });
  const message = await stream.finalMessage();
  return JSON.parse(firstText(message));
}

/** Regenerate a single meal slot (one day + meal_type), keeping the rest fixed.
 *  Returns a plan object whose `meals` array holds just the one replacement. */
export async function swapMeal(context, currentPlan, day, mealType, reason) {
  const stream = claude().messages.stream({
    model: config.plannerModel,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Here is the current plan (for context — do not repeat any of these dishes):\n${JSON.stringify(currentPlan, null, 2)}\n\nReplace ONLY the ${mealType} for ${day}. Reason for the swap: "${reason || 'family wants something different'}".\nThe replacement must not duplicate any other meal in the plan and must satisfy the same constraints:\n${JSON.stringify(context, null, 2)}\n\nReturn a plan object whose "meals" array contains EXACTLY ONE meal object — the new ${mealType} for ${day} (with day="${day}" and meal_type="${mealType}").${languageInstruction(context)}`
    }],
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
  });
  const message = await stream.finalMessage();
  return JSON.parse(firstText(message));
}
