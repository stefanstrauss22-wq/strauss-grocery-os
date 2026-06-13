import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// The list is grouped by where each item came FROM first; type is a secondary tag.
const SOURCE_ORDER = ['whatsapp', 'meal_plan', 'staples', 'manual', 'predicted', 'other'];
const SOURCE_LABEL = {
  whatsapp: '💬 From WhatsApp',
  meal_plan: '🍽️ From the meal plan',
  staples: '🧺 Weekly staples',
  manual: '✏️ Added here',
  predicted: '🔮 Predicted',
  other: '📦 Other',
};
const CATEGORY_ICON = { produce: '🥕', meat: '🥩', dairy: '🥛', bakery: '🍞', pantry: '🥫', frozen: '🧊', household: '🧴', toiletries: '🧻', pet: '🐶', other: '📦' };
const CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'household', 'toiletries', 'pet', 'other'];

export default function ListView() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [err, setErr] = useState(null);

  const load = () => api.get('/items?status=pending')
    .then(rows => { setItems(rows); setSelected(new Set()); })
    .catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await api.post('/items', { name: newItem.trim(), source: 'manual', added_by: 'web' });
    setNewItem('');
    load();
  }

  const check = item => api.patch(`/items/${item.id}`, { status: 'purchased' }).then(load);
  const remove = item => api.del(`/items/${item.id}`).then(load);

  function toggleSel(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Group by source first, then sort within a group by category.
  const grouped = SOURCE_ORDER
    .map(src => [src, items
      .filter(i => (SOURCE_LABEL[i.source] ? i.source : 'other') === src)
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))])
    .filter(([, arr]) => arr.length);

  function toggleSelectAll(arr) {
    const ids = arr.map(i => i.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function bulk(action) {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === 'removed' && !confirm(`Remove ${ids.length} item${ids.length > 1 ? 's' : ''} from the list?`)) return;
    await api.post('/items/bulk', { ids, action });
    load();
  }

  const selCount = selected.size;

  return (
    <div className="card">
      <div className="row">
        <h2>Shopping list</h2>
        <div className="spacer" />
        <span className="muted">{items.length} items</span>
      </div>
      <form onSubmit={add} className="chat-input">
        <input type="text" placeholder="Add an item… (e.g. 2L milk)" value={newItem} onChange={e => setNewItem(e.target.value)} />
        <button className="primary" type="submit">Add</button>
      </form>
      {err && <div className="error-box">{err}</div>}

      {selCount > 0 && (
        <div className="row" style={{ gap: 8, margin: '10px 0', alignItems: 'center' }}>
          <span className="muted">{selCount} selected</span>
          <div className="spacer" />
          <button className="ghost" onClick={() => bulk('purchased')}>✓ Mark bought</button>
          <button className="ghost" onClick={() => bulk('removed')}>✕ Remove</button>
          <button className="ghost tiny" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {grouped.map(([src, arr]) => {
        const allSelected = arr.every(i => selected.has(i.id));
        return (
          <div key={src}>
            <div className="cat-head row" style={{ alignItems: 'center' }}>
              <span>{SOURCE_LABEL[src]} <span className="muted">({arr.length})</span></span>
              <div className="spacer" />
              <button className="ghost tiny" onClick={() => toggleSelectAll(arr)}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <ul className="items">
              {arr.map(item => (
                <li key={item.id} className={item.urgency === 'urgent' ? 'urgent' : ''}>
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSel(item.id)} title="Select" />
                  <span className="name">
                    {item.urgency === 'urgent' && '❗'}
                    <span title={item.category}>{CATEGORY_ICON[item.category] || '📦'}</span>{' '}
                    {item.name}
                    {item.added_by ? <span className="muted"> — {item.added_by}</span> : null}
                  </span>
                  <span className="qty">{Number(item.quantity)}{item.unit ? ` ${item.unit}` : '×'}</span>
                  <a className="ghost tiny" href={item.search_link} target="_blank" rel="noreferrer" title="Search on Checkers">🔎</a>
                  <button className="ghost tiny" onClick={() => check(item)} title="Mark bought">✓</button>
                  <button className="ghost tiny" onClick={() => remove(item)} title="Remove">✕</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!items.length && <p className="muted">List is empty. Items arrive from WhatsApp, the meal plan, the weekly staples page, or the box above.</p>}
    </div>
  );
}
