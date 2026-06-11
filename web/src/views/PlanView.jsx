import React, { useEffect, useState } from 'react';
import { api, currentWeekStart } from '../api.js';
import { foodArt } from '../foodArt.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT_STATES = ['normal', 'quick', 'off'];
const SLOT_ICON = { normal: '🍳', quick: '⚡', off: '🚫' };
const CHIPS = ['Braai night 🔥', 'Cheaper week 💸', 'Fish night 🐟', 'Vegetarian night 🥦', 'One-pot meals 🍲', 'Air fryer night', 'Use up the freezer 🧊', 'Leftover night ♻️', 'Old favourites ⭐', 'Try something new 🎲', 'Kid-friendly 🧒', 'No spicy food'];

export default function PlanView() {
  const [weekStart, setWeekStart] = useState(currentWeekStart());
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
  useEffect(() => { loadPlan(weekStart); }, [weekStart]);

  const cycleSlot = day => setSchedule(s => ({ ...s, [day]: SLOT_STATES[(SLOT_STATES.indexOf(s[day]) + 1) % 3] }));
  const toggleChip = c => setChips(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);

  async function generate() {
    setBusy(true); setErr(null); setSummary(null);
    try {
      const res = await api.post('/plan/generate', {
        week_start: weekStart,
        week: {
          budget_rand: budget,
          schedule,
          mood_chips: chips,
          have_at_home: haveAtHome.split(',').map(s => s.trim()).filter(Boolean),
          notes,
        },
      });
      setPlan(res.plan);
      setSummary(res.week_summary);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function swap(day) {
    const reason = prompt(`Why swap ${day}'s meal? (e.g. "too fancy", "kids won't eat it", "make it cheaper")`);
    if (reason === null) return;
    setSwapping(day); setErr(null);
    try {
      const res = await api.post(`/plan/${weekStart}/swap`, { day, reason });
      setPlan(res.plan);
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
          <label className="field">Week starting (Monday)
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
          </label>
          <label className="field">Budget: <b>R{budget}</b>
            <input type="range" min="1000" max="6000" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))} />
          </label>
        </div>
        <h3>Schedule — tap a night: 🍳 normal → ⚡ quick (≤20 min) → 🚫 not cooking</h3>
        <div className="schedule-grid">
          {DAYS.map((d, i) => <div key={d} className="day">{DAY_SHORT[i]}</div>)}
          {DAYS.map(d => (
            <button key={d} className={`slot ${schedule[d]}`} onClick={() => cycleSlot(d)} title={schedule[d]}>
              {SLOT_ICON[schedule[d]]}
            </button>
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
        {err && <div className="error-box">{err}</div>}
        {summary && <p className="muted" style={{ marginTop: 10 }}>{summary}</p>}
      </div>

      {plan && (
        <div className="card">
          <div className="row">
            <h2>Week of {new Date(plan.week_start).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}</h2>
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
                  <span className="day-pill">{meal.day_of_week}</span>
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
