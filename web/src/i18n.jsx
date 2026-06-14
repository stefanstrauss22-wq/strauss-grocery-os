import React, { createContext, useContext, useState } from 'react';

// Lightweight bilingual support (English ⇄ Afrikaans). No external library:
// components call tr('English text', 'Afrikaanse teks') and the current
// language picks which to show. Language is remembered on the device.
// Dynamic data (meal titles, shopping-item/product names) is intentionally
// left untranslated — the Sixty60 cart matches English product names.

const LangContext = createContext({ lang: 'en', setLang: () => {}, tr: (en) => en });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; }
  });
  const setLang = l => {
    try { localStorage.setItem('lang', l); } catch { /* ignore */ }
    setLangState(l);
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

// Weekday names are stored in English (day_of_week) — localise for display.
const DAY_LONG_AF = { Monday: 'Maandag', Tuesday: 'Dinsdag', Wednesday: 'Woensdag', Thursday: 'Donderdag', Friday: 'Vrydag', Saturday: 'Saterdag', Sunday: 'Sondag' };
const DAY_SHORT_AF = { Monday: 'Ma', Tuesday: 'Di', Wednesday: 'Wo', Thursday: 'Do', Friday: 'Vr', Saturday: 'Sa', Sunday: 'So' };
const DAY_SHORT_EN = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

export function useLang() {
  const ctx = useContext(LangContext);
  const af = ctx.lang === 'af';
  const tr = (en, afText) => (af && afText != null ? afText : en);
  // Locale for date/number formatting that follows the chosen language.
  const locale = af ? 'af-ZA' : 'en-ZA';
  // Full / short weekday name from an English weekday name (e.g. "Sunday").
  const dayLong = en => (af ? (DAY_LONG_AF[en] || en) : en);
  const dayShort = en => (af ? (DAY_SHORT_AF[en] || en) : (DAY_SHORT_EN[en] || en));
  return { ...ctx, tr, locale, dayLong, dayShort };
}
