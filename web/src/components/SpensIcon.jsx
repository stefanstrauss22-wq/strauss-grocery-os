import React from 'react';

// Spens brand mark (mark A) — the terracotta-lidded green jar with a cream label.
// Rendered inline so it stays sharp and themable. Colours are fixed to the brand.
export default function SpensIcon({ size = 24, title = 'Spens' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}
      xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <rect x="31" y="16" width="38" height="11" rx="4" fill="#BF512E" />
      <rect x="26" y="26" width="48" height="8" rx="4" fill="#BF512E" />
      <rect x="29" y="34" width="42" height="52" rx="11" fill="#34503A" />
      <rect x="35" y="50" width="30" height="22" rx="5" fill="#FAF5EC" />
    </svg>
  );
}
