import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

export default function CatalogView() {
  const { tr } = useLang();
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
    if (!window.confirm(tr(`Delete mapping "${row.ingredient_key}" → "${row.product_name}"?`, `Vee uit-koppeling "${row.ingredient_key}" → "${row.product_name}"?`))) return;
    await api.del(`/catalog/${row.id}`);
    load();
  }

  return (
    <div>
      <div className="card">
        <h2>{tr("Product catalog — the system's memory", 'Produkkatalogus — die stelsel se geheue')}</h2>
        <p className="muted">
          {tr('Each row maps an ingredient to a real Sixty60 product. ', 'Elke ry koppel \'n bestanddeel aan \'n werklike Sixty60-produk. ')}<b>{tr('Confirmed', 'Bevestig')}</b>{tr(' rows are added to the cart instantly with no AI (tier 1). ', '-rye word onmiddellik by die mandjie gevoeg sonder KI (vlak 1). ')}<b>{tr('Suggested', 'Voorgestel')}</b>{tr(' rows were AI-picked on a previous run — confirm the good ones.', '-rye is deur KI gekies tydens \'n vorige lopie — bevestig die goeies.')}
        </p>
        <form onSubmit={add} className="grid cols3">
          <input type="text" placeholder={tr('ingredient (e.g. milk)', 'bestanddeel (bv. melk)')} value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} />
          <input type="text" placeholder={tr('product (e.g. Clover Full Cream Milk 2L)', 'produk (bv. Clover Volroommelk 2L)')} value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} />
          <div className="row">
            <input type="text" placeholder={tr('product URL (optional)', 'produk-URL (opsioneel)')} value={form.product_url} onChange={e => setForm(f => ({ ...f, product_url: e.target.value }))} />
            <button className="primary" type="submit">{tr('Add', 'Voeg by')}</button>
          </div>
        </form>
      </div>
      <div className="card">
        <table className="plain">
          <thead><tr><th>{tr('Ingredient', 'Bestanddeel')}</th><th>{tr('Product', 'Produk')}</th><th>{tr('Price', 'Prys')}</th><th>{tr('Bought', 'Gekoop')}</th><th>{tr('Status', 'Status')}</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.ingredient_key}</td>
                <td>{r.product_url ? <a href={r.product_url} target="_blank" rel="noreferrer">{r.product_name}</a> : r.product_name}</td>
                <td>{r.last_price_cents ? `R${(r.last_price_cents / 100).toFixed(2)}` : '—'}</td>
                <td>{r.times_purchased}×</td>
                <td>{r.confidence === 'confirmed' ? `✅ ${tr('confirmed', 'bevestig')}` : <button className="ghost tiny" onClick={() => confirm(r)}>{tr('Confirm', 'Bevestig')} ✓</button>}</td>
                <td><button className="ghost tiny" onClick={() => remove(r)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">{tr('Empty — the catalog fills itself as cart runs happen, or add mappings manually above.', 'Leeg — die katalogus vul homself soos mandjie-lopies plaasvind, of voeg koppelings handmatig hierbo by.')}</p>}
      </div>
    </div>
  );
}
