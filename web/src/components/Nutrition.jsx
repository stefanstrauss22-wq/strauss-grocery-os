import React from 'react';
import { useLang } from '../i18n.jsx';

// Per-serving nutrition strip for a recipe. Renders nothing for older recipes
// that predate nutrition (calories_kcal is null until they are regenerated).
export default function Nutrition({ recipe }) {
  const { tr } = useLang();
  if (!recipe || recipe.calories_kcal == null) return null;
  const g = v => (v == null ? '–' : `${v}g`);
  return (
    <div className="nutrition">
      <span className="nut-label">{tr('Per serving', 'Per porsie')}</span>
      <span className="nut">🔥 {recipe.calories_kcal} kcal</span>
      <span className="nut">🥩 {g(recipe.protein_g)} {tr('protein', 'proteïen')}</span>
      <span className="nut">🍞 {g(recipe.carbs_g)} {tr('carbs', 'koolhidrate')}</span>
      <span className="nut">🧈 {g(recipe.fat_g)} {tr('fat', 'vet')}</span>
      <span className="nut">🌾 {g(recipe.fibre_g)} {tr('fibre', 'vesel')}</span>
    </div>
  );
}
