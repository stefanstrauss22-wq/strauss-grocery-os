import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

const STATUS_ICON = { added: '✅', substituted: '🔁', needs_review: '⚠️', unavailable: '🚫', error: '❌' };

export default function CartView() {
  const { tr } = useLang();
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
    alert(tr(
      `${res.purchased} items marked purchased and added to history. 🛵`,
      `${res.purchased} items as gekoop gemerk en by geskiedenis gevoeg. 🛵`,
    ));
    setRun(null); loadRuns();
  }

  async function showManual() {
    setManual(await api.get('/cart/manual'));
  }

  async function clearRuns() {
    if (!confirm(tr(
      'Clear the cart run history? This removes the log of past robot runs only — your purchase history and the learned catalog are untouched.',
      'Maak die mandjie-lopiegeskiedenis skoon? Dit verwyder net die log van vorige robotlopies — jou aankoopgeskiedenis en die aangeleerde katalogus bly onaangeraak.',
    ))) return;
    setErr(null);
    try { await api.del('/cart/runs'); setRun(null); loadRuns(); }
    catch (e) { setErr(e.message); }
  }

  const summary = r => {
    const s = typeof r.summary === 'string' ? JSON.parse(r.summary) : (r.summary || {});
    return s;
  };

  return (
    <div>
      <div className="card">
        <h2>{tr('Sixty60 cart builder 🤖', 'Sixty60-mandjiebouer 🤖')}</h2>
        <p className="lead">
          {tr(
            'The robot fills your Checkers trolley from the list: products it knows are added directly, new items are searched and AI-matched, anything uncertain is flagged for you.',
            'Die robot vul jou Checkers-trollie vanaf die lys: produkte wat dit ken word direk bygevoeg, nuwe items word gesoek en met KI gepas, enigiets onseker word vir jou gemerk.',
          )}
          <b> {tr('It never checks out — you always review and pay.', 'Dit betaal nooit self af nie — jy hersien en betaal altyd.')}</b>
        </p>
        <p className="muted">
          {tr(<>The robot runs on the <b>home PC</b> (it needs a real browser). Tap <b>Build cart</b> below
          and — as long as the PC is on with the watcher running — it fills your Checkers trolley,
          then WhatsApps you when it's ready.</>,
          <>Die robot loop op die <b>tuis-rekenaar</b> (dit het 'n regte webblaaier nodig). Tik <b>Bou mandjie</b> hieronder
          en — solank die rekenaar aan is en die waghouer loop — vul dit jou Checkers-trollie,
          en WhatsApp jou dan wanneer dit gereed is.</>)}
        </p>
        <p className="muted">
          ⚠️ {tr(<><b>Check out on the Checkers <i>website</i></b> (checkers.co.za, logged in) — in the
          browser the robot leaves open, or in your phone's browser. The Sixty60 <i>mobile app</i>
          keeps a <b>separate basket</b>, so the robot's order won't show there.</>,
          <><b>Betaal af op die Checkers-<i>webwerf</i></b> (checkers.co.za, ingeteken) — in die
          webblaaier wat die robot oop los, of in jou foon se webblaaier. Die Sixty60-<i>selfoon-app</i>
          hou 'n <b>aparte mandjie</b>, so die robot se bestelling sal nie daar wys nie.</>)}
        </p>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="primary" onClick={requestBuild}>{tr('🛒 Build cart now', '🛒 Bou mandjie nou')}</button>
          <button className="ghost" onClick={showManual}>{tr('📋 Manual mode (tap-through links)', '📋 Handmatige modus (tik-deur skakels)')}</button>
        </div>
        {requested && <p className="muted" style={{ marginTop: 8 }}>{tr('✅ Requested — your home PC will fill the trolley shortly (it must be on). Watch the run appear below; you\'ll get a WhatsApp when it\'s ready.', '✅ Aangevra — jou tuis-rekenaar sal die trollie binnekort vul (dit moet aan wees). Kyk hoe die lopie hieronder verskyn; jy sal \'n WhatsApp kry wanneer dit gereed is.')}</p>}
        {err && <div className="error-box">{err}</div>}
      </div>

      {manual && (
        <div className="card">
          <h2>{tr('Manual mode', 'Handmatige modus')} — {manual.length} {tr('items', 'items')}</h2>
          <p className="muted">{tr('Each link opens a Checkers search. Tap, add, next. Unbreakable fallback.', 'Elke skakel maak \'n Checkers-soektog oop. Tik, voeg by, volgende. Onbreekbare terugval.')}</p>
          <ul className="items">
            {manual.map(m => (
              <li key={m.id}>
                <span className="name">{m.name}</span>
                <span className="qty">{Number(m.quantity)}{m.unit ? ` ${m.unit}` : '×'}</span>
                <a href={m.link} target="_blank" rel="noreferrer">{tr('Open search ↗', 'Maak soektog oop ↗')}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="row">
          <h2>{tr('Runs', 'Lopies')}</h2>
          <div className="spacer" />
          {runs.length > 0 && <button className="ghost tiny" onClick={clearRuns}>{tr('🗑 Clear history', '🗑 Maak geskiedenis skoon')}</button>}
        </div>
        {!runs.length && <p className="muted">{tr('No cart runs yet.', 'Nog geen mandjie-lopies nie.')}</p>}
        <table className="plain">
          <thead><tr><th>#</th><th>{tr('Started', 'Begin')}</th><th>{tr('Status', 'Status')}</th><th>{tr('Added', 'Bygevoeg')}</th><th>{tr('Review', 'Hersien')}</th><th>{tr('Est. total', 'Gesk. totaal')}</th><th></th></tr></thead>
          <tbody>
            {runs.map(r => {
              const s = summary(r);
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{new Date(r.started_at).toLocaleString('en-ZA')}</td>
                  <td>{r.status === 'running' ? tr('⏳ filling…', '⏳ vul…') : r.status === 'requested' ? tr('🕒 waiting for PC', '🕒 wag vir rekenaar') : r.status}</td>
                  <td>{s.added ?? '—'}</td>
                  <td>{s.needs_review ?? '—'}</td>
                  <td>{s.est_total_cents ? `R${(s.est_total_cents / 100).toFixed(2)}` : '—'}</td>
                  <td><button className="ghost tiny" onClick={() => openRun(r.id)}>{tr('Details', 'Besonderhede')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {run && (
        <div className="card">
          <div className="row">
            <h2>{tr('Run', 'Lopie')} #{run.id} — {tr('review & confirm', 'hersien & bevestig')}</h2>
            <div className="spacer" />
            {run.status === 'done' && (
              <button className="primary" onClick={() => complete(run.id)}>{tr('✅ I checked out — confirm purchases', '✅ Ek het afbetaal — bevestig aankope')}</button>
            )}
          </div>
          <p className="muted">
            {tr(<>Changed a brand or quantity at checkout? <b>Fix it here</b>, then tap <b>I checked out</b> —
            the bot remembers your corrections and buys exactly these next time. Untick <b>Bought</b> for
            anything you removed.</>,
            <>'n Handelsmerk of hoeveelheid by die betaalpunt verander? <b>Maak dit hier reg</b>, tik dan <b>Ek het afbetaal</b> —
            die bot onthou jou regstellings en koop volgende keer presies hierdie. Ontmerk <b>Gekoop</b> vir
            enigiets wat jy verwyder het.</>)}
          </p>
          <table className="plain">
            <thead><tr><th></th><th>{tr('Item', 'Item')}</th><th>{tr('Product you bought', 'Produk wat jy gekoop het')}</th><th>{tr('Qty', 'Hoev.')}</th><th>{tr('Price (R)', 'Prys (R)')}</th><th>{tr('Bought', 'Gekoop')}</th></tr></thead>
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
                      <span className="muted">{it.note || '—'} {it.product_url && <a href={it.product_url} target="_blank" rel="noreferrer">{tr('search ↗', 'soek ↗')}</a>}</span>
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
