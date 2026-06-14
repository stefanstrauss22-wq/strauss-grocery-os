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

export function useLang() {
  const ctx = useContext(LangContext);
  const tr = (en, af) => (ctx.lang === 'af' && af != null ? af : en);
  // Locale for date/number formatting that follows the chosen language.
  const locale = ctx.lang === 'af' ? 'af-ZA' : 'en-ZA';
  return { ...ctx, tr, locale };
}
