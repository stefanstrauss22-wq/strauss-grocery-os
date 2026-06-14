import express from 'express';
import { ensureAfTranslations } from '../services/translateService.js';

const router = express.Router();

// POST /api/translate  { texts: [string], lang: 'af' }  → { translations: { source: translated } }
// Cache-first: returns stored translations; AI-translates the rest in parallel
// and caches them. The English source is never altered — this is display-only.
router.post('/', async (req, res, next) => {
  try {
    const { texts, lang } = req.body;
    if (!Array.isArray(texts) || !texts.length) return res.json({ translations: {} });
    const uniq = [...new Set(texts.filter(t => typeof t === 'string' && t.trim()))];
    // We only translate to Afrikaans for now; anything else is identity.
    if (lang !== 'af') return res.json({ translations: Object.fromEntries(uniq.map(t => [t, t])) });

    const translations = await ensureAfTranslations(uniq);
    res.json({ translations });
  } catch (e) { next(e); }
});

export default router;
