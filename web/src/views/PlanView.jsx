import React, { useEffect, useState } from 'react';
import { api, todayISO, addDays, planWindow } from '../api.js';
import { foodArt } from '../foodArt.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const fmtDay = iso => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
// One dropdown per night: cooking effort + the meal-type themes, in one control.
const NIGHT_OPTIONS = [
  { value: 'normal',    label: '🍳 Normal' },
  { value: 'quick',     label: '⚡ Quick (≤20 min)' },
  { value: 'braai',     label: '🔥 Braai' },
  { value: 'fish',      label: '🐟 Fish' },
  { value: 'air_fryer', label: '🍟 Air fryer' },
  { value: 'leftover',  label: '♻️ Leftovers' },
  { value: 'off',       label: '🚫 Not cooking' },
];
const CHIPS = ['Cheaper week 💸', 'One-pot meals 🍲', 'Old favourites ⭐', 'Use up the freezer 🧊', 'Try something new 🎲', 'Kid-friendly 🧒', 'No spicy food'];

export default function PlanView() {
  const [weekStart, setWeekStart] = useState(todayISO());
  const windowDays = planWindow(weekStart); // the 7 days of this run, in order
  const [plan, setPlan] = useState(null);
  const [budget, setBudget] = useState(2500);
  const [schedule, setSchedule] = useState(Object.fromEntries(DAYS.map(d => [d, 'normal'])));
  const [chips, setChips] = useState([]);
  const [haveAtHome, setHaveAtHome] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [summary, setSummary] = useState(null);
  const [swapping, setSwapping] = useState(null);

  const loadPlan = ws => api.get(`/plan/${ws}`).then(setPlan).catch(() => setPlan(null));

  // On first load, show the CURRENT rolling plan — the one whose 7-day window
  // covers today — and sync the date picker to its actual start date. A plan
  // can start on any day, so an exact `/plan/{today}` match misses the day
  // after it starts and the section looks empty.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.get('/plan/current')
      .then(p => { if (p?.week_start) setWeekStart(String(p.week_start).slice(0, 10)); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => { if (ready) loadPlan(weekStart); }, [weekStart, ready]);

  // Generation/swap runs in the background on the server; poll the plan until
  // its status flips away from 'generating'. Resolves with the finished plan.
  function pollUntilReady(ws, { timeoutMs = 240000, intervalMs = 4000 } = {}) {
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

  const setNight = (day, value) => setSchedule(s => ({ ...s, [day]: value }));
  const toggleChip = c => setChips(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);

  async function generate() {
    setBusy(true); setErr(null); setSummary(null);
    try {
      await api.post('/plan/generate', {
        week_start: weekStart,
        week: {
          budget_rand: budget,
          schedule,
          mood_chips: chips,
          have_at_home: haveAtHome.split(',').map(s => s.trim()).filter(Boolean),
          notes,
        },
      });
      const p = await pollUntilReady(weekStart);
      setPlan(p);
      if (p.status === 'error') setErr('Generation hit a snag — please try again.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function swap(day) {
    const reason = prompt(`Why swap ${day}'s meal? (e.g. "too fancy", "kids won't eat it", "make it cheaper")`);
    if (reason === null) return;
    setSwapping(day); setErr(null);
    try {
      await api.post(`/plan/${weekStart}/swap`, { day, reason });
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
      alert(`Shopping list updated: ${res.added} new items, ${res.merged} merged into existing.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function rate(meal, rating) {
    await api.post('/plan/rate', { recipe_id: meal.id, rating });
    alert(rating > 0 ? 'Noted — the planner will bring this back 👍' : 'Noted — the planner will avoid this 👎');
  }

  return (
    <div>
      <div className="card">
        <h2>Weekly wizard</h2>
        <div className="grid cols2">
          <label className="field">Plan starting
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
          </label>
          <label className="field">Budget: <b>R{budget}</b>
            <input type="range" min="1000" max="6000" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>7 days: {fmtDay(weekStart)} → {fmtDay(addDays(weekStart, 6))}</p>
        <h3>Each night — pick the kind of dinner</h3>
        <div className="night-list">
          {windowDays.map(w => (
            <div key={w.date} className="night-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <span style={{ minWidth: 92, fontWeight: 600 }}>{SHORT[w.weekday]} {fmtDay(w.date)}</span>
              <select className="night-select" style={{ flex: 1, padding: '8px 10px' }}
                value={schedule[w.weekday]} onChange={e => setNight(w.weekday, e.target.value)}>
                {NIGHT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <h3>This week's mood</h3>
        <div className="chips">
          {CHIPS.map(c => (
            <span key={c} className={`chip ${chips.includes(c) ? 'on' : ''}`} onClick={() => toggleChip(c)}>{c}</span>
          ))}
        </div>
        <div className="grid cols2" style={{ marginTop: 12 }}>
          <label className="field">Already at home (comma separated)
            <input type="text" placeholder="chicken thighs, rice, frozen peas" value={haveAtHome} onChange={e => setHaveAtHome(e.target.value)} />
          </label>
          <label className="field">Anything else?
            <input type="text" placeholder="Granny visits Wednesday; Liam has a match Saturday" value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={busy} onClick={generate}>
          {busy ? <span><span className="spinner">⏳</span> Planning…</span> : (plan ? 'Regenerate plan (locked meals kept)' : 'Generate this week\'s plan')}
        </button>
        {busy && <p className="muted" style={{ marginTop: 10 }}>Cooking up 7 dinners with costed ingredients — this takes about a minute. You can leave this open.</p>}
        {err && <div className="error-box">{err}</div>}
        {summary && <p className="muted" style={{ marginTop: 10 }}>{summary}</p>}
      </div>

      {plan && (
        <div className="card">
          <div className="row">
            <h2>{fmtDay(plan.week_start)} → {fmtDay(addDays(plan.week_start, 6))}</h2>
            <div className="spacer" />
            <button className="primary" disabled={busy} onClick={toList}>Send ingredients to shopping list →</button>
          </div>
          <div className="grid cols2" style={{ marginTop: 10 }}>
            {plan.meals.map(meal => {
              const art = foodArt(meal);
              const tags = (typeof meal.tags === 'string' ? JSON.parse(meal.tags || '[]') : meal.tags) || [];
              return (
              <div key={meal.entry_id} className={`meal-card ${meal.locked ? 'locked' : ''}`}>
                <div className="meal-art" style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
                  <span className="day-pill">{meal.day_of_week}{meal.meal_date ? ` · ${fmtDay(meal.meal_date)}` : ''}</span>
                  {meal.locked && <span className="lock-pill">📌</span>}
                  <span className="emoji">{art.emoji}</span>
                </div>
                <div className="meal-body">
                <h3>{meal.title || '—'}</h3>
                <p className="desc">{meal.description}</p>
                <div style={{ marginBottom: 6 }}>
                  {meal.cuisine && <span className="tag gold">{meal.cuisine}</span>}
                  {tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}
                </div>
                <div className="meta">
                  <span>⏱ {(meal.prep_minutes || 0) + (meal.cook_minutes || 0)} min</span>
                  <span>💰 ~R{Math.round((meal.est_cost_cents || 0) / 100)}</span>
                  <span>🍽 {meal.servings}</span>
                </div>
                {meal.ingredients?.length > 0 && (
                  <details>
                    <summary>Recipe & ingredients</summary>
                    <ul className="muted" style={{ paddingLeft: 18 }}>
                      {meal.ingredients.map((ing, i) => (
                        <li key={i}>{ing.quantity} {ing.unit || ''} {ing.name}</li>
                      ))}
                    </ul>
                    <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{meal.instructions}</p>
                  </details>
                )}
                <div className="actions">
                  <button className="ghost tiny" disabled={swapping === meal.day_of_week} onClick={() => swap(meal.day_of_week)}>
                    {swapping === meal.day_of_week ? '⏳ swapping…' : '🔄 Swap'}
                  </button>
                  <button className="ghost tiny" onClick={() => toggleLock(meal)}>{meal.locked ? '🔓 Unlock' : '📌 Lock'}</button>
                  {meal.id && <>
                    <button className="ghost tiny" onClick={() => rate(meal, 1)}>👍</button>
                    <button className="ghost tiny" onClick={() => rate(meal, -1)}>👎</button>
                  </>}
                </div>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}
