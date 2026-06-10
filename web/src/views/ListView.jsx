import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'household', 'toiletries', 'pet', 'other'];
const CATEGORY_LABEL = { produce: '🥕 Produce', meat: '🥩 Meat', dairy: '🥛 Dairy', bakery: '🍞 Bakery', pantry: '🥫 Pantry', frozen: '🧊 Frozen', household: '🧴 Household', toiletries: '🧻 Toiletries', pet: '🐶 Pet', other: '📦 Other' };

export default function ListView() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [err, setErr] = useState(null);

  const load = () => api.get('/items?status=pending').then(setItems).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await api.post('/items', { name: newItem.trim(), source: 'manual', added_by: 'web' });
    setNewItem('');
    load();
  }

  async function check(item) {
    await api.patch(`/items/${item.id}`, { status: 'purchased' });
    load();
  }

  async function remove(item) {
    await api.del(`/items/${item.id}`);
    load();
  }

  const grouped = CATEGORY_ORDER
    .map(cat => [cat, items.filter(i => i.category === cat)])
    .filter(([, arr]) => arr.length);

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
      {grouped.map(([cat, arr]) => (
        <div key={cat}>
          <div className="cat-head">{CATEGORY_LABEL[cat]}</div>
          <ul className="items">
            {arr.map(item => (
              <li key={item.id} className={item.urgency === 'urgent' ? 'urgent' : ''}>
                <input type="checkbox" onChange={() => check(item)} title="Mark purchased" />
                <span className="name">
                  {item.urgency === 'urgent' && '❗'}
                  {item.name}
                  {item.added_by ? <span className="muted"> — {item.added_by}</span> : null}
                </span>
                <span className="qty">{Number(item.quantity)}{item.unit ? ` ${item.unit}` : '×'}</span>
                <span className={`src ${item.source}`}>{item.source.replace('_', ' ')}</span>
                <a className="ghost tiny" href={item.search_link} target="_blank" rel="noreferrer" title="Search on Checkers">🔎</a>
                <button className="ghost tiny" onClick={() => remove(item)} title="Remove">✕</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!items.length && <p className="muted">List is empty. Items arrive from WhatsApp, the meal plan, or the box above.</p>}
    </div>
  );
}
