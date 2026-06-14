import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const CATEGORY_ICON = { produce: '🥕', meat: '🥩', dairy: '🥛', bakery: '🍞', pantry: '🥫', frozen: '🧊', household: '🧴', toiletries: '🧻', pet: '🐶', other: '📦' };
const KIND_LABEL = { fixed: 'staple', rotation: 'rotation', custom: 'added', learned: 'suggested' };
const KIND_ORDER = ['fixed', 'rotation', 'learned', 'custom'];

export default function StaplesView() {
  const [staples, setStaples] = useState([]);
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
      setMsg(`Fresh rotation picks: ${r.picks.join(', ')}`);
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function toList() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.post('/staples/to-list', {});
      setMsg(`Sent to shopping list: ${r.added} added, ${r.skipped} already on the list.`);
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
        <h2>Weekly staples</h2>
        <div className="spacer" />
        <span className="muted">{activeCount} of {staples.length} ticked</span>
      </div>
      <p className="muted">Your standing weekly order. Tick what you want, tweak quantities, then send it across to the shopping list — nothing here touches the list until you do.</p>

      <form onSubmit={add} className="chat-input">
        <input type="text" placeholder="Add a staple… (e.g. 6 bananas)" value={newItem} onChange={e => setNewItem(e.target.value)} />
        <button className="primary" type="submit">Add</button>
      </form>

      <div className="row" style={{ gap: 8, margin: '10px 0' }}>
        <button className="ghost" disabled={busy} onClick={rotate}>{busy ? '⏳ working…' : '🎲 Refresh rotation picks'}</button>
        <div className="spacer" />
        <button className="primary" disabled={busy || !activeCount} onClick={toList}>Send ticked items to shopping list →</button>
      </div>

      {err && <div className="error-box">{err}</div>}
      {msg && <p className="muted">{msg}</p>}

      {grouped.map(([kind, arr]) => {
        const allActive = arr.every(s => s.active);
        return (
        <div key={kind}>
          <div className="cat-head row" style={{ alignItems: 'center' }}>
            <span>{KIND_LABEL[kind] === 'rotation' ? '🎲 This week\'s rotation' : KIND_LABEL[kind] === 'suggested' ? '💡 Suggested from your buying' : kind === 'custom' ? '✏️ Added by you' : '🧺 Fixed staples'}</span>
            <div className="spacer" />
            <button className="ghost tiny" onClick={() => toggleAll(arr)}>{allActive ? 'Deselect all' : 'Select all'}</button>
          </div>
          <ul className="items">
            {arr.map(s => (
              <li key={s.id} className={s.active ? '' : 'muted'}>
                <input type="checkbox" checked={s.active} onChange={() => toggle(s)} title="Include in the order" />
                <span className="name">
                  <span title={s.category}>{CATEGORY_ICON[s.category] || '📦'}</span> {s.name}
                  {s.note ? <span className="muted"> — {s.note}</span> : null}
                </span>
                <input
                  type="number" min="0" step="1" className="qty-input" value={Number(s.quantity)}
                  onChange={e => setQty(s, Number(e.target.value))}
                  style={{ width: 56 }} title="Quantity"
                />
                <span className="qty">{s.unit || '×'}</span>
                <button className="ghost tiny" onClick={() => remove(s)} title="Remove from staples">✕</button>
              </li>
            ))}
          </ul>
        </div>
        );
      })}
      {!staples.length && <p className="muted">No staples yet. They seed from your shopping preferences, or add your own above.</p>}
    </div>
  );
}
