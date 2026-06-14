import React, { useEffect, useState } from 'react';
import { api, todayISO, addDays, planWindow } from '../api.js';
import { foodArt } from '../foodArt.js';
import Nutrition from '../components/Nutrition.jsx';
import { useLang, useAutoTranslate, ingredientEnglish } from '../i18n.jsx';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };
const isoDate = v => String(v).slice(0, 10);
const fmtDay = (iso, locale = 'en-ZA') => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
// tags is stored as a JSON array (sometimes as a JSON string) — normalise to an array.
const parseTags = t => (Array.isArray(t) ? t : (() => { try { return JSON.parse(t || '[]'); } catch { return []; } })()) || [];
const blankWeek = () => Object.fromEntries(DAYS.map(d => [d, 'normal']));

export default function PlanView() {
  const { tr, locale, lang, dayShort, dayLong } = useLang();
  // Meal types the family can plan, and the per-meal per-day style options.
  const MEALS = {
    breakfast: { emoji: '🍳', label: tr('Breakfast', 'Ontbyt') },
    lunch: { emoji: '🥪', label: tr('Lunch', 'Middagete') },
    dinner: { emoji: '🍽️', label: tr('Dinner', 'Aandete') },
  };
  const OPT = {
    dinner: [
      { value: 'normal',    label: tr('🍳 Normal', '🍳 Normaal') },
      { value: 'quick',     label: tr('⚡ Quick (≤20 min)', '⚡ Vinnig (≤20 min)') },
      { value: 'braai',     label: tr('🔥 Braai', '🔥 Braai') },
      { value: 'fish',      label: tr('🐟 Fish', '🐟 Vis') },
      { value: 'air_fryer', label: tr('🍟 Air fryer', '🍟 Lugbraaier') },
      { value: 'leftover',  label: tr('♻️ Leftovers', '♻️ Oorskiet') },
      { value: 'off',       label: tr('🚫 Not cooking', '🚫 Kook nie') },
    ],
    breakfast: [
      { value: 'normal',    label: tr('🍳 Normal', '🍳 Normaal') },
      { value: 'quick',     label: tr('⚡ Quick (≤10 min)', '⚡ Vinnig (≤10 min)') },
      { value: 'leftover',  label: tr('♻️ Leftovers', '♻️ Oorskiet') },
      { value: 'off',       label: tr('🚫 Skip', '🚫 Slaan oor') },
    ],
    lunch: [
      { value: 'normal',    label: tr('🥪 Normal', '🥪 Normaal') },
      { value: 'quick',     label: tr('⚡ Quick (≤20 min)', '⚡ Vinnig (≤20 min)') },
      { value: 'fish',      label: tr('🐟 Fish', '🐟 Vis') },
      { value: 'leftover',  label: tr('♻️ Leftovers', '♻️ Oorskiet') },
      { value: 'off',       label: tr('🚫 Skip', '🚫 Slaan oor') },
    ],
  };
  const CHIPS = [
    tr('Cheaper week 💸', 'Goedkoper week 💸'),
    tr('One-pot meals 🍲', 'Eenpot-etes 🍲'),
    tr('Old favourites ⭐', 'Ou gunstelinge ⭐'),
    tr('Use up the freezer 🧊', 'Maak die vrieskas leeg 🧊'),
    tr('Try something new 🎲', 'Probeer iets nuuts 🎲'),
    tr('Kid-friendly 🧒', 'Kindervriendelik 🧒'),
    tr('No spicy food', 'Geen skerp kos'),
  ];
  const [weekStart, setWeekStart] = useState(todayISO());
  // Planning horizon — next 3 nights or next 7. Remembered between visits.
  const [horizon, setHorizonState] = useState(() => {
    try { return Number(localStorage.getItem('planHorizon')) === 3 ? 3 : 7; } catch { return 7; }
  });
  const setHorizon = h => { try { localStorage.setItem('planHorizon', String(h)); } catch { /* ignore */ } setHorizonState(h); };
  // Which meals to plan — dinner by default; breakfast/lunch optional. Remembered.
  const [mealTypes, setMealTypesState] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('planMealTypes'));
      const f = Array.isArray(v) ? v.filter(t => MEAL_ORDER[t] !== undefined) : [];
      if (f.length) return f.sort((a, b) => MEAL_ORDER[a] - MEAL_ORDER[b]);
    } catch { /* ignore */ }
    return ['dinner'];
  });
  const setMealTypes = arr => { try { localStorage.setItem('planMealTypes', JSON.stringify(arr)); } catch { /* ignore */ } setMealTypesState(arr); };
  const toggleMealType = t => {
    if (mealTypes.includes(t)) { if (mealTypes.length > 1) setMealTypes(mealTypes.filter(x => x !== t)); }
    else setMealTypes([...mealTypes, t].sort((a, b) => MEAL_ORDER[a] - MEAL_ORDER[b]));
  };
  const windowDays = planWindow(weekStart, horizon); // the days of this run, in order
  const [plan, setPlan] = useState(null);
  const [budget, setBudget] = useState(2500);
  const [schedule, setSchedule] = useState({ breakfast: blankWeek(), lunch: blankWeek(), dinner: blankWeek() });
  const [chips, setChips] = useState([]);
  const [haveAtHome, setHaveAtHome] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [swapping, setSwapping] = useState(null);
  // Translate recipe text + cuisine + tags + ingredient names for display.
  const tx = useAutoTranslate((plan?.meals || []).flatMap(m =>
    [m.title, m.description, m.instructions, m.cuisine, ...parseTags(m.tags),
     ...((m.ingredients || []).map(ingredientEnglish))]));

  const loadPlan = async ws => {
    try { setPlan(await api.get(`/plan/${ws}`)); }
    catch { try { setPlan(await api.get('/plan/current')); } catch { setPlan(null); } }
  };
  useEffect(() => { loadPlan(weekStart); }, [weekStart]);

  // Generation/swap runs in the background on the server; poll the plan until
  // its status flips away from 'generating'. Resolves with the finished plan.
  function pollUntilReady(ws, { timeoutMs = 300000, intervalMs = 4000 } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const p = await api.get(`/plan/${ws}`);
          if (p && p.status !== 'generating') return resolve(p);
          if (Date.now() - start > timeoutMs) return reject(new Error('Still working — it is taking longer than usual. Give it a moment and refresh.'));
          setTimeout(tick, intervalMs);
        } catch (e) {
          if (Date.now() - start > timeoutMs) return reject(e);
          setTimeout(tick, intervalMs);
        }
      };
      tick();
    });
  }

  // Start the budget slider from the household profile's default budget.
  useEffect(() => {
    api.get('/settings/household_profile')
      .then(p => { if (p?.default_budget_rand) setBudget(Number(p.default_budget_rand)); })
      .catch(() => {});
  }, []);

  const setStyle = (mealType, day, value) => setSchedule(s => ({ ...s, [mealType]: { ...s[mealType], [day]: value } }));
  const toggleChip = c => setChips(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);

  async function generate() {
    setBusy(true); setErr(null);
    try {
      await api.post('/plan/generate', {
        week_start: weekStart,
        horizon_days: horizon,
        language: lang,
        week: {
          budget_rand: budget,
          meal_types: mealTypes,
          schedule: Object.fromEntries(mealTypes.map(mt => [mt, schedule[mt]])),
          mood_chips: chips,
          have_at_home: haveAtHome.split(',').map(s => s.trim()).filter(Boolean),
          notes,
        },
      });
      const p = await pollUntilReady(weekStart);
      setPlan(p);
      if (p.status === 'error') setErr(tr('Generation hit a snag — please try again.', 'Die opstel het ’n probleem getref — probeer asseblief weer.'));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function swap(meal) {
    const mealType = meal.meal_type || 'dinner';
    const what = `${MEALS[mealType].label} (${dayLong(meal.day_of_week)})`;
    const reason = prompt(tr(`Why swap this ${what}? (e.g. "too fancy", "kids won't eat it", "make it cheaper")`, `Hoekom ruil hierdie ${what} uit? (bv. "te deftig", "die kinders eet dit nie", "maak dit goedkoper")`));
    if (reason === null) return;
    const key = `${meal.day_of_week}|${mealType}`;
    setSwapping(key); setErr(null);
    try {
      await api.post(`/plan/${weekStart}/swap`, { day: meal.day_of_week, meal_type: mealType, reason });
      const p = await pollUntilReady(weekStart);
      setPlan(p);
    } catch (e) { setErr(e.message); }
    setSwapping(null);
  }

  async function toggleLock(meal) {
    await api.post(`/plan/${weekStart}/lock`, { entry_id: meal.entry_id, locked: !meal.locked });
    loadPlan(weekStart);
  }

  async function toList() {
    setBusy(true); setErr(null);
    try {
      const res = await api.post(`/plan/${weekStart}/to-list`, {});
      alert(tr(`Shopping list updated: ${res.added} new items, ${res.merged} merged into existing.`, `Inkopielys opgedateer: ${res.added} nuwe items, ${res.merged} saamgevoeg met bestaandes.`));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function rate(meal, rating) {
    await api.post('/plan/rate', { recipe_id: meal.id, rating });
    alert(rating > 0 ? tr('Noted — the planner will bring this back 👍', 'Genoteer — die beplanner sal dit weer voorstel 👍') : tr('Noted — the planner will avoid this 👎', 'Genoteer — die beplanner sal dit vermy 👎'));
  }

  // One meal card. `showType` puts a meal-type pill on the art (used when a day
  // shows more than one meal); otherwise the weekday pill is shown.
  const mealCard = (meal, showType) => {
    const art = foodArt(meal);
    const tags = parseTags(meal.tags);
    const mt = meal.meal_type || 'dinner';
    const swapKey = `${meal.day_of_week}|${mt}`;
    return (
      <div key={meal.entry_id} className={`meal-card ${meal.locked ? 'locked' : ''}`}>
        <div className="meal-art" style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
          <span className="day-pill">{showType ? `${MEALS[mt].emoji} ${MEALS[mt].label}` : `${dayLong(meal.day_of_week)}${meal.meal_date ? ` · ${fmtDay(meal.meal_date, locale)}` : ''}`}</span>
          {meal.locked && <span className="lock-pill">📌</span>}
          <span className="emoji">{art.emoji}</span>
        </div>
        <div className="meal-body">
          <h3>{meal.title ? tx(meal.title) : '—'}</h3>
          <p className="desc">{tx(meal.description)}</p>
          <div style={{ marginBottom: 6 }}>
            {meal.cuisine && <span className="tag gold">{tx(meal.cuisine)}</span>}
            {tags.slice(0, 3).map(t => <span key={t} className="tag">{tx(t)}</span>)}
          </div>
          <div className="meta">
            <span>⏱ {(meal.prep_minutes || 0) + (meal.cook_minutes || 0)} min</span>
            <span>💰 ~R{Math.round((meal.est_cost_cents || 0) / 100)}</span>
            <span>🍽 {meal.servings}</span>
            {meal.calories_kcal != null && <span>🔥 {meal.calories_kcal} kcal</span>}
          </div>
          {meal.ingredients?.length > 0 && (
            <details>
              <summary>{tr('Recipe & ingredients', 'Resep & bestanddele')}</summary>
              <Nutrition recipe={meal} />
              <ul className="muted" style={{ paddingLeft: 18 }}>
                {meal.ingredients.map((ing, i) => (
                  <li key={i}>{tx(ingredientEnglish(ing))}</li>
                ))}
              </ul>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{tx(meal.instructions)}</p>
            </details>
          )}
          <div className="actions">
            <button className="ghost tiny" disabled={swapping === swapKey} onClick={() => swap(meal)}>
              {swapping === swapKey ? tr('⏳ swapping…', '⏳ ruil tans…') : tr('🔄 Swap', '🔄 Ruil')}
            </button>
            <button className="ghost tiny" onClick={() => toggleLock(meal)}>{meal.locked ? tr('🔓 Unlock', '🔓 Sluit oop') : tr('📌 Lock', '📌 Sluit')}</button>
            {meal.id && <>
              <button className="ghost tiny" onClick={() => rate(meal, 1)}>👍</button>
              <button className="ghost tiny" onClick={() => rate(meal, -1)}>👎</button>
            </>}
          </div>
        </div>
      </div>
    );
  };

  // Group the plan's meals by day (server returns them date- then slot-ordered).
  const dayGroups = [];
  { const seen = {};
    for (const m of (plan?.meals || [])) {
      const k = m.meal_date ? isoDate(m.meal_date) : m.day_of_week;
      if (!seen[k]) { seen[k] = { key: k, date: m.meal_date, day: m.day_of_week, meals: [] }; dayGroups.push(seen[k]); }
      seen[k].meals.push(m);
    } }
  const planMealTypeCount = new Set((plan?.meals || []).map(m => m.meal_type || 'dinner')).size;
  const grouped = planMealTypeCount > 1; // group by day only when a day has >1 meal
  const mealCount = mealTypes.length * horizon;

  return (
    <div>
      <div className="card">
        <h2>{tr('Weekly wizard', 'Week beplanner')}</h2>
        <div className="grid cols2">
          <label className="field">{tr('Plan starting', 'Plan begin')}
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
          </label>
          <label className="field">{tr('Budget', 'Begroting')}: <b>R{budget}</b>
            <input type="range" min="1000" max="6000" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))} />
          </label>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <span style={{ display: 'block' }}>{tr('How far ahead?', 'Hoe ver vooruit?')}</span>
          <div className="seg-toggle" role="group" aria-label={tr('Planning length', 'Beplanningslengte')} style={{ marginTop: 14 }}>
            <button type="button" className={horizon === 3 ? 'active' : ''} onClick={() => setHorizon(3)}>{tr('Next 3 days', 'Volgende 3 dae')}</button>
            <button type="button" className={horizon === 7 ? 'active' : ''} onClick={() => setHorizon(7)}>{tr('Next 7 days', 'Volgende 7 dae')}</button>
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <span style={{ display: 'block' }}>{tr('Which meals?', 'Watter etes?')}</span>
          <div className="mt-select" role="group" aria-label={tr('Meals to plan', 'Etes om te beplan')} style={{ marginTop: 14 }}>
            {['breakfast', 'lunch', 'dinner'].map(mt => (
              <button key={mt} type="button" className={mealTypes.includes(mt) ? 'active' : ''} onClick={() => toggleMealType(mt)}>
                {MEALS[mt].emoji} {MEALS[mt].label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{tr(`${horizon} days`, `${horizon} dae`)}: {fmtDay(weekStart, locale)} → {fmtDay(addDays(weekStart, horizon - 1), locale)}</p>
        <h3>{tr('Plan each day — pick the kind of meal', 'Beplan elke dag — kies die soort ete')}</h3>
        <div className="grid cols2" style={{ marginTop: 4 }}>
          {windowDays.map(w => (
            <div key={w.date} className="day-plan">
              <div className="day-plan-head">{dayShort(w.weekday)} {fmtDay(w.date, locale)}</div>
              {mealTypes.map(mt => (
                <label key={mt} className="meal-row">
                  <span className="meal-row-label">{MEALS[mt].emoji} {MEALS[mt].label}</span>
                  <select value={schedule[mt][w.weekday]} onChange={e => setStyle(mt, w.weekday, e.target.value)}>
                    {OPT[mt].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ))}
        </div>
        <h3>{tr("This week's mood", 'Hierdie week se bui')}</h3>
        <div className="chips">
          {CHIPS.map(c => (
            <span key={c} className={`chip ${chips.includes(c) ? 'on' : ''}`} onClick={() => toggleChip(c)}>{c}</span>
          ))}
        </div>
        <div className="grid cols2" style={{ marginTop: 12 }}>
          <label className="field">{tr('Already at home (comma separated)', 'Reeds tuis (met kommas geskei)')}
            <input type="text" placeholder={tr('chicken thighs, rice, frozen peas', 'hoenderdye, rys, bevrore ertjies')} value={haveAtHome} onChange={e => setHaveAtHome(e.target.value)} />
          </label>
          <label className="field">{tr('Anything else?', 'Enigiets anders?')}
            <input type="text" placeholder={tr('Granny visits Wednesday; Liam has a match Saturday', 'Ouma kuier Woensdag; Liam het ’n wedstryd Saterdag')} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={busy} onClick={generate}>
          {busy ? <span><span className="spinner">⏳</span> {tr('Planning…', 'Beplan…')}</span> : (plan ? tr('Regenerate plan (locked meals kept)', 'Stel plan weer op (geslote etes bly behoue)') : tr("Generate this week's plan", 'Stel hierdie week se plan op'))}
        </button>
        {busy && <p className="muted" style={{ marginTop: 10 }}>{tr(`Cooking up ${mealCount} meals with costed ingredients — this takes a minute or two. You can leave this open.`, `Kook tans ${mealCount} etes met gekoste bestanddele — dit neem ’n minuut of twee. Jy kan dit oop laat.`)}</p>}
        {err && <div className="error-box">{err}</div>}
      </div>

      {plan && (
        <div className="card">
          <div className="row">
            <h2>{fmtDay(plan.week_start, locale)} → {fmtDay(addDays(plan.week_start, (plan.horizon_days || 7) - 1), locale)}</h2>
            <div className="spacer" />
            <button className="primary" disabled={busy} onClick={toList}>{tr('Send ingredients to shopping list →', 'Stuur bestanddele na inkopielys →')}</button>
          </div>
          {grouped ? (
            dayGroups.map(g => (
              <div key={g.key} className="day-group">
                <h3 className="day-group-head">{dayLong(g.day)}{g.date ? ` · ${fmtDay(g.date, locale)}` : ''}</h3>
                <div className="grid cols2">
                  {g.meals.map(meal => mealCard(meal, true))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid cols2" style={{ marginTop: 10 }}>
              {(plan.meals || []).map(meal => mealCard(meal, false))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
