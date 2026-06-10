import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function CatalogView() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ item_name: '', product_name: '', product_url: '' });

  const load = () => api.get('/catalog').then(setRows);
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.item_name || !form.product_name) return;
    await api.post('/catalog', { ...form, confidence: 'confirmed' });
    setForm({ item_name: '', product_name: '', product_url: '' });
    load();
  }

  async function confirm(row) {
    await api.patch(`/catalog/${row.id}`, { confidence: 'confirmed' });
    load();
  }

  async function remove(row) {
    if (!window.confirm(`Delete mapping "${row.ingredient_key}" → "${row.product_name}"?`)) return;
    await api.del(`/catalog/${row.id}`);
    load();
  }

  return (
    <div>
      <div className="card">
        <h2>Product catalog — the system's memory</h2>
        <p className="muted">
          Each row maps an ingredient to a real Sixty60 product. <b>Confirmed</b> rows are added to the cart
          instantly with no AI (tier 1). <b>Suggested</b> rows were AI-picked on a previous run — confirm the good ones.
        </p>
        <form onSubmit={add} className="grid cols3">
          <input type="text" placeholder="ingredient (e.g. milk)" value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} />
          <input type="text" placeholder="product (e.g. Clover Full Cream Milk 2L)" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} />
          <div className="row">
            <input type="text" placeholder="product URL (optional)" value={form.product_url} onChange={e => setForm(f => ({ ...f, product_url: e.target.value }))} />
            <button className="primary" type="submit">Add</button>
          </div>
        </form>
      </div>
      <div className="card">
        <table className="plain">
          <thead><tr><th>Ingredient</th><th>Product</th><th>Price</th><th>Bought</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.ingredient_key}</td>
                <td>{r.product_url ? <a href={r.product_url} target="_blank" rel="noreferrer">{r.product_name}</a> : r.product_name}</td>
                <td>{r.last_price_cents ? `R${(r.last_price_cents / 100).toFixed(2)}` : '—'}</td>
                <td>{r.times_purchased}×</td>
                <td>{r.confidence === 'confirmed' ? '✅ confirmed' : <button className="ghost tiny" onClick={() => confirm(r)}>Confirm ✓</button>}</td>
                <td><button className="ghost tiny" onClick={() => remove(r)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">Empty — the catalog fills itself as cart runs happen, or add mappings manually above.</p>}
      </div>
    </div>
  );
}
