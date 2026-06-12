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

  // Save a per-item correction (optimistic local update + PATCH).
  async function patchItem(it, patch) {
    setRun(r => ({ ...r, items: r.items.map(x => x.id === it.id ? { ...x, ...patch } : x) }));
    try { await api.patch(`/cart/run-items/${it.id}`, patch); } catch (e) { setErr(e.message); }
  }

  async function complete(id) {
    const res = await api.post(`/cart/runs/${id}/complete`, {});
    alert(`${res.purchased} items marked purchased and added to history. 🛵`);
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
          then WhatsApps you when it's ready.
        </p>
        <p className="muted">
          ⚠️ <b>Check out on the Checkers <i>website</i></b> (checkers.co.za, logged in) — in the
          browser the robot leaves open, or in your phone's browser. The Sixty60 <i>mobile app</i>
          keeps a <b>separate basket</b>, so the robot's order won't show there.
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
            <h2>Run #{run.id} — review &amp; confirm</h2>
            <div className="spacer" />
            {run.status === 'done' && (
              <button className="primary" onClick={() => complete(run.id)}>✅ I checked out — confirm purchases</button>
            )}
          </div>
          <p className="muted">
            Changed a brand or quantity at checkout? <b>Fix it here</b>, then tap <b>I checked out</b> —
            the bot remembers your corrections and buys exactly these next time. Untick <b>Bought</b> for
            anything you removed.
          </p>
          <table className="plain">
            <thead><tr><th></th><th>Item</th><th>Product you bought</th><th>Qty</th><th>Price (R)</th><th>Bought</th></tr></thead>
            <tbody>
              {run.items.map(it => {
                const editable = it.status === 'added' || it.status === 'substituted';
                return (
                <tr key={it.id} style={it.bought === false ? { opacity: 0.5 } : undefined}>
                  <td>{STATUS_ICON[it.status] || it.status}</td>
                  <td>{it.item_name}</td>
                  <td>
                    {editable ? (
                      <input type="text" defaultValue={it.product_name || ''} style={{ minWidth: 200 }}
                        onBlur={e => e.target.value !== (it.product_name || '') && patchItem(it, { product_name: e.target.value })} />
                    ) : (
                      <span className="muted">{it.note || '—'} {it.product_url && <a href={it.product_url} target="_blank" rel="noreferrer">search ↗</a>}</span>
                    )}
                  </td>
                  <td>{editable ? (
                    <input type="number" min="1" defaultValue={Number(it.final_quantity ?? it.quantity ?? 1)} style={{ width: 56 }}
                      onBlur={e => patchItem(it, { final_quantity: Number(e.target.value) })} />
                  ) : '—'}</td>
                  <td>{editable ? (
                    <input type="number" step="0.01" defaultValue={it.price_cents ? (it.price_cents / 100).toFixed(2) : ''} style={{ width: 80 }}
                      onBlur={e => patchItem(it, { price_cents: Math.round(Number(e.target.value) * 100) })} />
                  ) : '—'}</td>
                  <td>{editable && (
                    <input type="checkbox" defaultChecked={it.bought !== false}
                      onChange={e => patchItem(it, { bought: e.target.checked })} />
                  )}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
