import React, { useEffect, useState } from 'react';
import { api, todayISO } from '../api.js';
import { foodArt, dayShort } from '../foodArt.js';
import TodoList from './TodoList.jsx';

const isoDate = v => String(v).slice(0, 10);

export default function Dashboard({ goTo }) {
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [showRecipe, setShowRecipe] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(e => setErr(e.message));
    api.get('/plan/current').then(setPlan).catch(() => setPlan(null));
    api.get('/items?status=all').then(setItems).catch(() => {});
  }, []);

  if (err) return <div className="error-box">{err}</div>;
  if (!data) return <p className="muted">Setting the table…</p>;

  const meals = plan?.meals || []; // server returns these in date order
  const isToday = m => m.meal_date && isoDate(m.meal_date) === todayISO();
  const tonight = meals.find(isToday) || meals[0];
  const art = tonight ? foodArt(tonight) : null;

  // Budget insight: planned cost vs the week's budget from the wizard
  const ctx = plan ? (typeof plan.context === 'string' ? JSON.parse(plan.context) : plan.context) : null;
  const budget = ctx?.week?.budget_rand || null;
  const plannedRand = Math.round(meals.reduce((s, m) => s + (m.est_cost_cents || 0), 0) / 100);

  // Shopping progress: this list cycle
  const pending = items.filter(i => i.status === 'pending').length;
  const inCart = items.filter(i => i.status === 'in_cart').length;
  const done = items.filter(i => i.status === 'purchased').length;
  const cycleTotal = pending + inCart + done;
  const shopPct = cycleTotal ? Math.round(((inCart + done) / cycleTotal) * 100) : 0;

  return (
    <div>
      {/* Tonight's dinner hero */}
      {tonight ? (
        <div className="hero">
          <div className="hero-art" style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
            <span className="kicker">{isToday(tonight) ? "Tonight's dinner" : `${tonight.day_of_week}'s dinner`}</span>
            <span className="emoji">{art.emoji}</span>
          </div>
          <div className="hero-body">
            <h2>{tonight.title}</h2>
            <p>{tonight.description}</p>
            <div className="row">
              <span className="tag">⏱ {(tonight.prep_minutes || 0) + (tonight.cook_minutes || 0)} min</span>
              <span className="tag terra">💰 ~R{Math.round((tonight.est_cost_cents || 0) / 100)}</span>
              {tonight.cuisine && <span className="tag gold">{tonight.cuisine}</span>}
              <div className="spacer" />
              <button className="ghost" onClick={() => setShowRecipe(v => !v)}>
                {showRecipe ? 'Hide recipe ▲' : 'See the recipe →'}
              </button>
            </div>
            {showRecipe && (
              <div className="recipe-expand" style={{ marginTop: 12 }}>
                {tonight.ingredients?.length > 0 && (
                  <>
                    <h4 style={{ margin: '0 0 6px' }}>Ingredients</h4>
                    <ul className="muted" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
                      {tonight.ingredients.map((ing, i) => (
                        <li key={i}>{Number(ing.quantity)} {ing.unit || ''} {ing.name}</li>
                      ))}
                    </ul>
                  </>
                )}
                {tonight.instructions && (
                  <>
                    <h4 style={{ margin: '0 0 6px' }}>Method</h4>
                    <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{tonight.instructions}</p>
                  </>
                )}
                {!tonight.ingredients?.length && !tonight.instructions && (
                  <p className="muted" style={{ margin: 0 }}>No recipe details for this one — it's a no-cook / leftovers night.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hero">
          <div className="hero-art" style={{ background: 'linear-gradient(135deg, #F1E7D6, #DBC4A4)' }}>
            <span className="emoji">🧑‍🍳</span>
          </div>
          <div className="hero-body">
            <h2>No plan for this week yet</h2>
            <p>Two minutes with the weekly wizard and dinner is sorted — budget, busy nights, braai and all.</p>
            <button className="primary terra" onClick={() => goTo('plan')}>Plan this week's dinners</button>
          </div>
        </div>
      )}

      {/* Week at a glance */}
      {meals.length > 0 && (
        <div className="card">
          <h2>The week at a glance</h2>
          <div className="week-strip" style={{ marginTop: 10 }}>
            {meals.map(m => {
              const a = foodArt(m);
              return (
                <div key={m.entry_id} className={`wday ${isToday(m) ? 'today' : ''}`} onClick={() => goTo('plan')} title={m?.title || ''}>
                  <div className="d">{dayShort(m.day_of_week)}</div>
                  <div className="e">{a.emoji}</div>
                  <div className="t">{m?.title || '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Insight tiles */}
      <div className="grid cols3">
        <div className="tile">
          <div className="t-label">💰 Budget</div>
          {budget ? (
            <>
              <div className="t-value">R{plannedRand} <span style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>of R{budget}</span></div>
              <div className="t-sub">{plannedRand <= budget ? `R${budget - plannedRand} breathing room` : `R${plannedRand - budget} over — swap a meal cheaper`}</div>
              <div className="progress terra"><div style={{ width: `${Math.min(100, Math.round((plannedRand / budget) * 100))}%` }} /></div>
            </>
          ) : (
            <>
              <div className="t-value">—</div>
              <div className="t-sub">Set a budget in the weekly wizard</div>
            </>
          )}
        </div>
        <div className="tile">
          <div className="t-label">🛒 Shopping</div>
          <div className="t-value">{pending} <span style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>to buy</span></div>
          <div className="t-sub">{inCart ? `${inCart} in the trolley · ` : ''}{done ? `${done} bought` : 'list fills via WhatsApp + the plan'}</div>
          <div className="progress"><div style={{ width: `${shopPct}%` }} /></div>
        </div>
        <div className="tile">
          <div className="t-label">🧠 Pantry memory</div>
          <div className="t-value">{data.catalog_confirmed}<span style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>/{data.catalog_size}</span></div>
          <div className="t-sub">products it knows by heart</div>
          <div className="progress"><div style={{ width: `${data.catalog_size ? Math.round((data.catalog_confirmed / data.catalog_size) * 100) : 0}%` }} /></div>
        </div>
      </div>

      {/* How it flows */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>How the kitchen runs 🍳</h2>
        <ol className="muted" style={{ lineHeight: 2.1, margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Out of something? The family tells <b>Groceries Bot</b> on WhatsApp — it lands on the <a onClick={() => goTo('list')} href="#">list</a> by itself.</li>
          <li>Weekend: <a onClick={() => goTo('plan')} href="#">plan the week's dinners</a> and send the ingredients across.</li>
          <li>Shop day: <a onClick={() => goTo('cart')} href="#">the robot packs the Sixty60 trolley</a> — you check it and press Pay.</li>
        </ol>
      </div>

      {/* Family to-do list */}
      <TodoList />
    </div>
  );
}
