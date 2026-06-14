import React from 'react';

// Sjeffie brand mark (mark B) — a winking chef's toque, marigold hat with a
// cream face, on a transparent background for inline use on light surfaces.
// Rendered inline so it stays sharp and themable. Colours are fixed to the brand.
export default function SjeffieIcon({ size = 24, title = 'Sjeffie' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}
      xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <circle cx="36" cy="38" r="13" fill="#F4A52A" />
      <circle cx="64" cy="38" r="13" fill="#F4A52A" />
      <circle cx="50" cy="31" r="16" fill="#F4A52A" />
      <rect x="30" y="38" width="40" height="20" rx="4" fill="#F4A52A" />
      <rect x="32" y="60" width="36" height="18" rx="6" fill="#F4A52A" />
      <path d="M40 68 Q43 65.5 46 68" fill="none" stroke="#FFFDF7" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="57" cy="68" r="2.9" fill="#FFFDF7" />
      <path d="M44 72.5 Q50 76.5 56 72.5" fill="none" stroke="#FFFDF7" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}
