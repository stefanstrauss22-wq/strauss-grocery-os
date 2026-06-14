import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang, useAutoTranslate } from '../i18n.jsx';

const CATEGORY_ICON = { produce: '🥕', meat: '🥩', dairy: '🥛', bakery: '🍞', pantry: '🥫', frozen: '🧊', household: '🧴', toiletries: '🧻', pet: '🐶', other: '📦' };
const KIND_LABEL = { fixed: 'staple', rotation: 'rotation', custom: 'added', learned: 'suggested' };
const KIND_ORDER = ['fixed', 'rotation', 'learned', 'custom'];

export default function StaplesView() {
  const { tr, unitWord } = useLang();
  const [staples, setStaples] = useState([]);
  const tx = useAutoTranslate(staples.map(s => s.name)); // display staple names in AF (data stays English)
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/staples').then(setStaples).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await api.post('/staples', { name: newItem.trim() });
    setNewItem('');
    load();
  }

  const toggle = s => api.patch(`/staples/${s.id}`, { active: !s.active }).then(load);
  const remove = s => api.del(`/staples/${s.id}`).then(load);

  async function setQty(s, quantity) {
    if (!Number.isFinite(quantity) || quantity < 0) return;
    await api.patch(`/staples/${s.id}`, { quantity });
    load();
  }

  async function rotate() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.post('/staples/rotate', {});
      setMsg(tr(`Fresh rotation picks: ${r.picks.join(', ')}`, `Vars roterende keuses: ${r.picks.join(', ')}`));
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function toList() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.post('/staples/to-list', {});
      setMsg(tr(`Sent to shopping list: ${r.added} added, ${r.skipped} already on the list.`, `Na inkopielys gestuur: ${r.added} bygevoeg, ${r.skipped} reeds op die lys.`));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // Tick / untick every staple in a category at once.
  async function toggleAll(arr) {
    const target = !arr.every(s => s.active);
    await Promise.all(arr.filter(s => s.active !== target).map(s => api.patch(`/staples/${s.id}`, { active: target })));
    load();
  }

  const grouped = KIND_ORDER
    .map(k => [k, staples.filter(s => s.kind === k)])
    .filter(([, arr]) => arr.length);
  const activeCount = staples.filter(s => s.active).length;

  return (
    <div className="card">
      <div className="row">
        <h2>{tr('Weekly staples', 'Weeklikse noodsaaklikhede')}</h2>
        <div className="spacer" />
        <span className="muted">{tr(`${activeCount} of ${staples.length} ticked`, `${activeCount} van ${staples.length} gemerk`)}</span>
      </div>
      <p className="muted">{tr('Your standing weekly order. Tick what you want, tweak quantities, then send it across to the shopping list — nothing here touches the list until you do.', 'Jou vaste weeklikse bestelling. Merk wat jy wil hê, pas hoeveelhede aan en stuur dit dan na die inkopielys — niks hier raak die lys totdat jy dit doen nie.')}</p>

      <form onSubmit={add} className="chat-input">
        <input type="text" placeholder={tr('Add a staple… (e.g. 6 bananas)', 'Voeg \'n noodsaaklikheid by… (bv. 6 piesangs)')} value={newItem} onChange={e => setNewItem(e.target.value)} />
        <button className="primary" type="submit">{tr('Add', 'Voeg by')}</button>
      </form>

      <div className="row" style={{ gap: 8, margin: '10px 0' }}>
        <button className="ghost" disabled={busy} onClick={rotate}>{busy ? tr('⏳ working…', '⏳ besig…') : tr('🎲 Refresh rotation picks', '🎲 Verfris roterende keuses')}</button>
        <div className="spacer" />
        <button className="primary" disabled={busy || !activeCount} onClick={toList}>{tr('Send ticked items to shopping list →', 'Stuur gemerkte items na inkopielys →')}</button>
      </div>

      {err && <div className="error-box">{err}</div>}
      {msg && <p className="muted">{msg}</p>}

      {grouped.map(([kind, arr]) => {
        const allActive = arr.every(s => s.active);
        return (
        <div key={kind}>
          <div className="cat-head row" style={{ alignItems: 'center' }}>
            <span>{KIND_LABEL[kind] === 'rotation' ? tr('🎲 This week\'s rotation', '🎲 Hierdie week se rotasie') : KIND_LABEL[kind] === 'suggested' ? tr('💡 Suggested from your buying', '💡 Voorgestel uit jou aankope') : kind === 'custom' ? tr('✏️ Added by you', '✏️ Deur jou bygevoeg') : tr('🧺 Fixed staples', '🧺 Vaste noodsaaklikhede')}</span>
            <div className="spacer" />
            <button className="ghost tiny" onClick={() => toggleAll(arr)}>{allActive ? tr('Deselect all', 'Ontmerk almal') : tr('Select all', 'Merk almal')}</button>
          </div>
          <ul className="items">
            {arr.map(s => (
              <li key={s.id} className={s.active ? '' : 'muted'}>
                <input type="checkbox" checked={s.active} onChange={() => toggle(s)} title={tr('Include in the order', 'Sluit in die bestelling in')} />
                <span className="name">
                  <span title={s.category}>{CATEGORY_ICON[s.category] || '📦'}</span> {tx(s.name)}
                  {s.note ? <span className="muted"> — {s.note}</span> : null}
                </span>
                <input
                  type="number" min="0" step="1" className="qty-input" value={Number(s.quantity)}
                  onChange={e => setQty(s, Number(e.target.value))}
                  style={{ width: 56 }} title={tr('Quantity', 'Hoeveelheid')}
                />
                <span className="qty">{s.unit ? unitWord(s.unit, Number(s.quantity)) : '×'}</span>
                <button className="ghost tiny" onClick={() => remove(s)} title={tr('Remove from staples', 'Verwyder uit noodsaaklikhede')}>✕</button>
              </li>
            ))}
          </ul>
        </div>
        );
      })}
      {!staples.length && <p className="muted">{tr('No staples yet. They seed from your shopping preferences, or add your own above.', 'Nog geen noodsaaklikhede nie. Hulle word vanuit jou inkopievoorkeure gevul, of voeg jou eie hierbo by.')}</p>}
    </div>
  );
}
