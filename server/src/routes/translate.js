import express from 'express';
import { query } from '../db/db.js';
import { aiEnabled, claude, firstText } from '../services/claude.js';
import { config } from '../config.js';

const router = express.Router();

// Index-based: the model returns a "translations" array in the SAME ORDER as
// the input, so we map by position (robust — no fragile source-text matching).
const SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
  additionalProperties: false,
};

async function translateBatch(strings) {
  const msg = await claude().messages.create({
    model: config.extractionModel,
    max_tokens: 16000,
    system: 'You translate English UI text, recipe titles/descriptions/cooking steps, and grocery ingredient names into natural South African Afrikaans for a family meal-planning app. You are given a JSON array of English strings. Return a "translations" array of the SAME LENGTH and SAME ORDER, each being the Afrikaans translation of the input at that position. Translate meaning faithfully and concisely; keep numbers, measurements/units and brand names unchanged.',
    messages: [{ role: 'user', content: JSON.stringify(strings) }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  return JSON.parse(firstText(msg)).translations || [];
}

// POST /api/translate  { texts: [string], lang: 'af' }  → { translations: { source: translated } }
// Cache-first: returns stored translations; AI-translates the rest in one batch
// and caches them. The English source is never altered — this is display-only.
router.post('/', async (req, res, next) => {
  try {
    const { texts, lang } = req.body;
    if (!Array.isArray(texts) || !texts.length) return res.json({ translations: {} });
    const uniq = [...new Set(texts.filter(t => typeof t === 'string' && t.trim()))];
    // We only translate to Afrikaans for now; anything else is identity.
    if (lang !== 'af') return res.json({ translations: Object.fromEntries(uniq.map(t => [t, t])) });

    const cached = {};
    const rows = (await query(
      `SELECT source, translated FROM translations WHERE lang = $1 AND source = ANY($2::text[])`,
      [lang, uniq])).rows;
    for (const r of rows) cached[r.source] = r.translated;

    const missing = uniq.filter(s => cached[s] === undefined);
    if (missing.length && aiEnabled()) {
      // Chunk so a single AI call never grows large enough to truncate. Kept
      // small because recipe method texts are long — a big batch of them could
      // overflow the output budget and fail, leaving those strings in English.
      const CHUNK = 12;
      for (let i = 0; i < missing.length; i += CHUNK) {
        const part = missing.slice(i, i + CHUNK);
        let arr = [];
        try { arr = await translateBatch(part); } catch { arr = []; }
        for (let j = 0; j < part.length; j++) {
          const t = arr[j];
          if (typeof t === 'string' && t.trim()) {
            cached[part[j]] = t;
            await query(
              `INSERT INTO translations (source, lang, translated) VALUES ($1,$2,$3)
               ON CONFLICT (source, lang) DO UPDATE SET translated = EXCLUDED.translated`,
              [part[j], lang, t]);
          }
        }
      }
    }

    // Return only the strings we actually translated; the client keeps the
    // English for the rest and will retry them later (we don't cache English).
    const translations = {};
    for (const s of uniq) if (cached[s] !== undefined) translations[s] = cached[s];
    res.json({ translations });
  } catch (e) { next(e); }
});

export default router;
