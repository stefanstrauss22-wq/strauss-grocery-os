import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_ICON = { added: '✅', substituted: '🔁', needs_review: '⚠️', unavailable: '🚫', error: '❌' };

export default function CartView() {
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [manual, setManual] = useState(null);
  const [err, setErr] = useState(null);
  const [requested, setRequested] = useState(false);

  const loadRuns = () => api.get('/cart/runs').then(setRuns).catch(e => setErr(e.message));
  useEffect(() => { loadRuns(); }, []);

  // poll while a build is waiting for / running on the home PC
  useEffect(() => {
    if (!runs.some(r => r.status === 'running' || r.status === 'requested')) return;
    const t = setInterval(loadRuns, 4000);
    return () => clearInterval(t);
  }, [runs]);

  async function requestBuild() {
    setErr(null);
    try {
      await api.post('/cart/request', {});
      setRequested(true);
      loadRuns();
    } catch (e) { setErr(e.message); }
  }

  async function openRun(id) {
    setRun(await api.get(`/cart/runs/${id}`));
  }

  async function complete(id) {
    const res = await api.post(`/cart/runs/${id}/complete`, {});
    alert(`${res.purchased} items marked purchased and added to history. Now check out in the Sixty60 app 🛵`);
    setRun(null); loadRuns();
  }

  async function showManual() {
    setManual(await api.get('/cart/manual'));
  }

  const summary = r => {
    const s = typeof r.summary === 'string' ? JSON.parse(r.summary) : (r.summary || {});
    return s;
  };

  return (
    <div>
      <div className="card">
        <h2>Sixty60 cart builder 🤖</h2>
        <p className="lead">
          The robot fills your Checkers trolley from the list: products it knows are added directly,
          new items are searched and AI-matched, anything uncertain is flagged for you.
          <b> It never checks out — you always review and pay.</b>
        </p>
        <p className="muted">
          The robot runs on the <b>home PC</b> (it needs a real browser). Tap <b>Build cart</b> below
          and — as long as the PC is on with the watcher running — it fills your Checkers trolley,
          then WhatsApps you when it's ready. Because the cart sits on your Checkers account,
          you <b>review &amp; pay in the Sixty60 app on your phone</b>.
        </p>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="primary" onClick={requestBuild}>🛒 Build cart now</button>
          <button className="ghost" onClick={showManual}>📋 Manual mode (tap-through links)</button>
        </div>
        {requested && <p className="muted" style={{ marginTop: 8 }}>✅ Requested — your home PC will fill the trolley shortly (it must be on). Watch the run appear below; you'll get a WhatsApp when it's ready.</p>}
        {err && <div className="error-box">{err}</div>}
      </div>

      {manual && (
        <div className="card">
          <h2>Manual mode — {manual.length} items</h2>
          <p className="muted">Each link opens a Checkers search. Tap, add, next. Unbreakable fallback.</p>
          <ul className="items">
            {manual.map(m => (
              <li key={m.id}>
                <span className="name">{m.name}</span>
                <span className="qty">{Number(m.quantity)}{m.unit ? ` ${m.unit}` : '×'}</span>
                <a href={m.link} target="_blank" rel="noreferrer">Open search ↗</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Runs</h2>
        {!runs.length && <p className="muted">No cart runs yet.</p>}
        <table className="plain">
          <thead><tr><th>#</th><th>Started</th><th>Status</th><th>Added</th><th>Review</th><th>Est. total</th><th></th></tr></thead>
          <tbody>
            {runs.map(r => {
              const s = summary(r);
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{new Date(r.started_at).toLocaleString('en-ZA')}</td>
                  <td>{r.status === 'running' ? '⏳ filling…' : r.status === 'requested' ? '🕒 waiting for PC' : r.status}</td>
                  <td>{s.added ?? '—'}</td>
                  <td>{s.needs_review ?? '—'}</td>
                  <td>{s.est_total_cents ? `R${(s.est_total_cents / 100).toFixed(2)}` : '—'}</td>
                  <td><button className="ghost tiny" onClick={() => openRun(r.id)}>Details</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {run && (
        <div className="card">
          <div className="row">
            <h2>Run #{run.id} — review</h2>
            <div className="spacer" />
            {run.status === 'done' && (
              <button className="primary" onClick={() => complete(run.id)}>✅ I checked out — mark purchased</button>
            )}
          </div>
          <table className="plain">
            <thead><tr><th></th><th>Item</th><th>Product</th><th>Tier</th><th>Price</th><th>Note</th></tr></thead>
            <tbody>
              {run.items.map(it => (
                <tr key={it.id}>
                  <td>{STATUS_ICON[it.status] || it.status}</td>
                  <td>{it.item_name}</td>
                  <td>{it.product_url ? <a href={it.product_url} target="_blank" rel="noreferrer">{it.product_name || 'open ↗'}</a> : (it.product_name || '—')}</td>
                  <td>{it.tier}</td>
                  <td>{it.price_cents ? `R${(it.price_cents / 100).toFixed(2)}` : '—'}</td>
                  <td className="muted">{it.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
