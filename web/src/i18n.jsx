import React, { createContext, useContext, useState, useRef, useReducer, useCallback, useEffect } from 'react';
import { api } from './api.js';

// Bilingual support (English ⇄ Afrikaans). Two layers:
//  1. tr('English','Afrikaans') — fixed UI strings written in both languages.
//  2. useAutoTranslate(texts) — DYNAMIC content (recipe text, ingredient/item
//     names) translated to Afrikaans on the fly via /api/translate and cached.
//     The stored English is never changed — the Sixty60 cart needs English names.

const LangContext = createContext({
  lang: 'en', setLang: () => {}, version: 0,
  ensureTranslations: () => {}, lookup: (s) => s,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; }
  });
  const setLang = l => {
    try { localStorage.setItem('lang', l); } catch { /* ignore */ }
    setLangState(l);
  };

  // cache key: `${lang}::${source}` → translated string (null = request in flight)
  const cacheRef = useRef({});
  const [version, bump] = useReducer(x => x + 1, 0);

  const ensureTranslations = useCallback(async (texts, targetLang) => {
    if (targetLang !== 'af') return;
    const want = [...new Set((texts || []).filter(s => typeof s === 'string' && s.trim()))];
    const missing = want.filter(s => cacheRef.current[`${targetLang}::${s}`] === undefined);
    if (!missing.length) return;
    missing.forEach(s => { cacheRef.current[`${targetLang}::${s}`] = null; }); // mark in-flight
    try {
      const r = await api.post('/translate', { texts: missing, lang: targetLang });
      const map = r?.translations || {};
      // Cache what came back; leave the rest unset so they retry on a later pass
      // (rather than getting stuck showing English forever).
      for (const s of missing) {
        cacheRef.current[`${targetLang}::${s}`] = (map[s] !== undefined ? map[s] : undefined);
      }
    } catch {
      for (const s of missing) cacheRef.current[`${targetLang}::${s}`] = undefined; // retry later
    }
    bump();
  }, []);

  // Read a cached translation for the current language (null/in-flight → English).
  const lookup = useCallback((s) => {
    if (lang !== 'af' || !s) return s;
    const v = cacheRef.current[`af::${s}`];
    return v == null ? s : v;
  }, [lang, version]);

  return (
    <LangContext.Provider value={{ lang, setLang, version, ensureTranslations, lookup }}>
      {children}
    </LangContext.Provider>
  );
}

// Weekday names are stored in English (day_of_week) — localise for display.
const DAY_LONG_AF = { Monday: 'Maandag', Tuesday: 'Dinsdag', Wednesday: 'Woensdag', Thursday: 'Donderdag', Friday: 'Vrydag', Saturday: 'Saterdag', Sunday: 'Sondag' };
const DAY_SHORT_AF = { Monday: 'Ma', Tuesday: 'Di', Wednesday: 'Wo', Thursday: 'Do', Friday: 'Vr', Saturday: 'Sa', Sunday: 'So' };
const DAY_SHORT_EN = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

export function useLang() {
  const ctx = useContext(LangContext);
  const af = ctx.lang === 'af';
  const tr = (en, afText) => (af && afText != null ? afText : en);
  const locale = af ? 'af-ZA' : 'en-ZA';
  const dayLong = en => (af ? (DAY_LONG_AF[en] || en) : en);
  const dayShort = en => (af ? (DAY_SHORT_AF[en] || en) : (DAY_SHORT_EN[en] || en));
  return { ...ctx, tr, locale, dayLong, dayShort };
}

/**
 * Translate dynamic content for display. Pass every English string the component
 * will render; returns tx(s) → the Afrikaans version (once fetched) or the
 * English in the meantime / in English mode. Stored data is never modified.
 */
export function useAutoTranslate(texts) {
  const { lang, ensureTranslations, lookup } = useContext(LangContext);
  const list = (texts || []).filter(s => typeof s === 'string' && s.trim());
  const key = list.join(''); // stable dependency for the effect
  useEffect(() => {
    if (lang === 'af' && list.length) ensureTranslations(list, 'af');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, key, ensureTranslations]);
  return lookup;
}
