import { query } from '../db/db.js';
import { aiEnabled, claude, firstText } from './claude.js';
import { config } from '../config.js';

// Index-based: the model returns a "translations" array in the SAME ORDER as
// the input, so we map by position (robust — no fragile source-text matching).
const SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
  additionalProperties: false,
};

// Glossary of food terms the model tends to get wrong — extend as needed.
const GLOSSARY = 'GLOSSARY (use these Afrikaans forms exactly): meatball = frikkadel, plural frikkadelle (NEVER "frikkadels"); leek = prei, plural preie.';

const SYSTEM = `You translate English UI text, recipe titles/descriptions/cooking steps, and grocery ingredient names into natural South African Afrikaans for a family meal-planning app. You are given a JSON array of English strings. Return a "translations" array of the SAME LENGTH and SAME ORDER, each being the Afrikaans translation of the input at that position. Translate meaning faithfully and concisely; keep numbers, measurements/units and brand names unchanged.\n\n${GLOSSARY}`;

async function translateBatch(strings) {
  const msg = await claude().messages.create({
    model: config.translateModel,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(strings) }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  return JSON.parse(firstText(msg)).translations || [];
}

/**
 * Ensure Afrikaans translations exist for the given English strings and return
 * a { source: translated } map for everything we have. Cache-first: stored rows
 * are reused; the rest are translated in parallel chunks and cached. The English
 * source is never altered — this is display-only. Never throws; on any failure a
 * string is simply omitted (the caller falls back to showing English).
 */
export async function ensureAfTranslations(texts) {
  const uniq = [...new Set((texts || []).filter(t => typeof t === 'string' && t.trim()))];
  if (!uniq.length) return {};

  const cached = {};
  const rows = (await query(
    `SELECT source, translated FROM translations WHERE lang = 'af' AND source = ANY($1::text[])`,
    [uniq])).rows;
  for (const r of rows) cached[r.source] = r.translated;

  const missing = uniq.filter(s => cached[s] === undefined);
  if (missing.length && aiEnabled()) {
    // Keep chunks small (recipe method texts are long) and run them in PARALLEL
    // so the whole pass is one slow call's worth of time, not the sum of all.
    const CHUNK = 12;
    const chunks = [];
    for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK));
    const results = await Promise.all(chunks.map(part =>
      translateBatch(part).catch(() => [])));
    for (let c = 0; c < chunks.length; c++) {
      const part = chunks[c], arr = results[c] || [];
      for (let j = 0; j < part.length; j++) {
        const t = arr[j];
        if (typeof t === 'string' && t.trim()) {
          cached[part[j]] = t;
          await query(
            `INSERT INTO translations (source, lang, translated) VALUES ($1,'af',$2)
             ON CONFLICT (source, lang) DO UPDATE SET translated = EXCLUDED.translated`,
            [part[j], t]);
        }
      }
    }
  }

  const out = {};
  for (const s of uniq) if (cached[s] !== undefined) out[s] = cached[s];
  return out;
}

// Generic "count" units we drop so the phrase reads naturally ("3 onion" → "3 ui").
// MUST match the frontend's ingredientEnglish() in web/src/i18n.jsx so the strings
// we pre-translate here are exactly the ones the client later looks up.
const COUNT_UNITS = new Set(['unit', 'units', 'each', 'ea', 'x', '']);

/** English ingredient phrase the client will render/translate, e.g. "3 chicken thighs". */
export function ingredientPhrase(ing) {
  const qn = Number(ing.quantity);
  const q = Number.isFinite(qn) ? (Math.round(qn * 100) / 100) : ing.quantity;
  const unit = (ing.unit || '').toString().toLowerCase().trim();
  if (!unit || COUNT_UNITS.has(unit)) return `${q} ${ing.name}`;
  return `${q} ${ing.unit} ${ing.name}`;
}

/** Every Afrikaans-translatable display string in a generated plan's meals. */
export function planDisplayStrings(generated) {
  const out = [];
  for (const m of (generated?.meals || [])) {
    out.push(m.title, m.description, m.instructions, m.cuisine, ...((m.tags) || []));
    for (const ing of (m.ingredients || [])) out.push(ingredientPhrase(ing));
  }
  return out.filter(s => typeof s === 'string' && s.trim());
}
