import React, { useEffect, useState } from 'react';
import { api, todayISO } from '../api.js';
import { foodArt } from '../foodArt.js';
import TodoList from './TodoList.jsx';
import { useLang, useAutoTranslate, ingredientEnglish } from '../i18n.jsx';

const isoDate = v => String(v).slice(0, 10);

export default function Dashboard({ goTo }) {
  const { tr, locale, dayShort, dayLong } = useLang();
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [showRecipe, setShowRecipe] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // which day's meal the hero shows
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(e => setErr(e.message));
    api.get('/plan/current').then(setPlan).catch(() => setPlan(null));
    api.get('/items?status=all').then(setItems).catch(() => {});
  }, []);

  // Translate recipe text + ingredient names for display (data stays English).
  const tx = useAutoTranslate((plan?.meals || []).flatMap(m =>
    [m.title, m.description, m.instructions, ...((m.ingredients || []).map(ingredientEnglish))]));

  if (err) return <div className="error-box">{err}</div>;
  if (!data) return <p className="muted">{tr('Setting the table…', 'Ons dek die tafel…')}</p>;

  const meals = plan?.meals || []; // server returns these in date order
  const isToday = m => m.meal_date && isoDate(m.meal_date) === todayISO();
  const todayMeal = meals.find(isToday) || meals[0];
  // The hero shows today's meal by default, or whichever day you tap in the strip.
  const selected = meals.find(m => m.entry_id === selectedId) || todayMeal;
  const art = selected ? foodArt(selected) : null;

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
      {/* Selected day's dinner hero (defaults to today; tap a day below to change) */}
      {selected ? (
        <div className="hero">
          <div className="hero-art" style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
            <span className="kicker">{isToday(selected) ? tr("Tonight's dinner", 'Vanaand se aandete') : tr(`${selected.day_of_week}'s dinner`, `${dayLong(selected.day_of_week)} se aandete`)}</span>
            <span className="emoji">{art.emoji}</span>
          </div>
          <div className="hero-body">
            <h2>{tx(selected.title)}</h2>
            <p>{tx(selected.description)}</p>
            <div className="row">
              <span className="tag">⏱ {(selected.prep_minutes || 0) + (selected.cook_minutes || 0)} min</span>
              <span className="tag terra">💰 ~R{Math.round((selected.est_cost_cents || 0) / 100)}</span>
              {selected.cuisine && <span className="tag gold">{selected.cuisine}</span>}
              <div className="spacer" />
              <button className="ghost" onClick={() => setShowRecipe(v => !v)}>
                {showRecipe ? tr('Hide recipe ▲', 'Versteek resep ▲') : tr('See the recipe →', 'Sien die resep →')}
              </button>
            </div>
            {showRecipe && (
              <div className="recipe-expand" style={{ marginTop: 12 }}>
                {selected.ingredients?.length > 0 && (
                  <>
                    <h4 style={{ margin: '0 0 6px' }}>{tr('Ingredients', 'Bestanddele')}</h4>
                    <ul className="muted" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
                      {selected.ingredients.map((ing, i) => (
                        <li key={i}>{tx(ingredientEnglish(ing))}</li>
                      ))}
                    </ul>
                  </>
                )}
                {selected.instructions && (
                  <>
                    <h4 style={{ margin: '0 0 6px' }}>{tr('Method', 'Metode')}</h4>
                    <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{tx(selected.instructions)}</p>
                  </>
                )}
                {!selected.ingredients?.length && !selected.instructions && (
                  <p className="muted" style={{ margin: 0 }}>{tr("No recipe details for this one — it's a no-cook / leftovers night.", 'Geen reseptebesonderhede hiervoor nie — dis ’n nie-kook / oorskietkos-aand.')}</p>
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
            <h2>{tr('No plan for this week yet', 'Nog geen plan vir hierdie week nie')}</h2>
            <p>{tr('Two minutes with the weekly wizard and dinner is sorted — budget, busy nights, braai and all.', 'Twee minute met die weeklikse towenaar en aandete is gereël — begroting, besige aande, braai en als.')}</p>
            <button className="primary terra" onClick={() => goTo('plan')}>{tr("Plan this week's dinners", 'Beplan hierdie week se aandetes')}</button>
          </div>
        </div>
      )}

      {/* Week at a glance — tap a day to show its meal in the card above */}
      {meals.length > 0 && (
        <div className="card">
          <h2>{tr('The week at a glance', 'Die week in ’n neutedop')}</h2>
          <p className="muted" style={{ margin: '0 0 6px' }}>{tr('Tap a day to see its dinner above.', 'Tik op ’n dag om sy aandete hierbo te sien.')}</p>
          <div className="week-strip" style={{ marginTop: 10 }}>
            {meals.map(m => {
              const a = foodArt(m);
              const isSel = selected && m.entry_id === selected.entry_id;
              return (
                <div key={m.entry_id} className={`wday ${isSel ? 'today' : ''}`} onClick={() => setSelectedId(m.entry_id)} title={m?.title || ''}>
                  <div className="d">{dayShort(m.day_of_week)}</div>
                  <div className="e">{a.emoji}</div>
                  <div className="t">{m?.title ? tx(m.title) : '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Family to-do list */}
      <TodoList />

      {/* Insight tiles */}
      <div className="grid cols3">
        <div className="tile">
          <div className="t-label">{tr('💰 Budget', '💰 Begroting')}</div>
          {budget ? (
            <>
              <div className="t-value">R{plannedRand} <span style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>{tr(`of R${budget}`, `van R${budget}`)}</span></div>
              <div className="t-sub">{plannedRand <= budget ? tr(`R${budget - plannedRand} breathing room`, `R${budget - plannedRand} spasie oor`) : tr(`R${plannedRand - budget} over — swap a meal cheaper`, `R${plannedRand - budget} oor — ruil ’n maaltyd goedkoper`)}</div>
              <div className="progress terra"><div style={{ width: `${Math.min(100, Math.round((plannedRand / budget) * 100))}%` }} /></div>
            </>
          ) : (
            <>
              <div className="t-value">—</div>
              <div className="t-sub">{tr('Set a budget in the weekly wizard', 'Stel ’n begroting in die weeklikse towenaar')}</div>
            </>
          )}
        </div>
        <div className="tile">
          <div className="t-label">{tr('🛒 Shopping', '🛒 Inkopies')}</div>
          <div className="t-value">{pending} <span style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>{tr('to buy', 'om te koop')}</span></div>
          <div className="t-sub">{inCart ? tr(`${inCart} in the trolley · `, `${inCart} in die trollie · `) : ''}{done ? tr(`${done} bought`, `${done} gekoop`) : tr('list fills via WhatsApp + the plan', 'lys vul via WhatsApp + die plan')}</div>
          <div className="progress"><div style={{ width: `${shopPct}%` }} /></div>
        </div>
        <div className="tile">
          <div className="t-label">{tr('🧠 Pantry memory', '🧠 Spens-geheue')}</div>
          <div className="t-value">{data.catalog_confirmed}<span style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>/{data.catalog_size}</span></div>
          <div className="t-sub">{tr('products it knows by heart', 'produkte wat dit uit die kop ken')}</div>
          <div className="progress"><div style={{ width: `${data.catalog_size ? Math.round((data.catalog_confirmed / data.catalog_size) * 100) : 0}%` }} /></div>
        </div>
      </div>

      {/* How it flows */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>{tr('How the kitchen runs 🍳', 'Hoe die kombuis werk 🍳')}</h2>
        <ol className="muted" style={{ lineHeight: 2.1, margin: '6px 0 0', paddingLeft: 20 }}>
          <li>{tr('Out of something? The family tells ', 'Iets op? Die gesin sê vir ')}<b>Groceries Bot</b>{tr(' on WhatsApp — it lands on the ', ' op WhatsApp — dit beland vanself op die ')}<a onClick={() => goTo('list')} href="#">{tr('list', 'lys')}</a>{tr(' by itself.', '.')}</li>
          <li>{tr('Weekend: ', 'Naweek: ')}<a onClick={() => goTo('plan')} href="#">{tr("plan the week's dinners", 'beplan die week se aandetes')}</a>{tr(' and send the ingredients across.', ' en stuur die bestanddele deur.')}</li>
          <li>{tr('Shop day: ', 'Inkopiedag: ')}<a onClick={() => goTo('cart')} href="#">{tr('the robot packs the Sixty60 trolley', 'die robot pak die Sixty60-trollie')}</a>{tr(' — you check it and press Pay.', ' — jy gaan dit na en druk Betaal.')}</li>
        </ol>
      </div>
    </div>
  );
}
