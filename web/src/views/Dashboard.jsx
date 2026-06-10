import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard({ goTo }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(e => setErr(e.message));
  }, []);

  if (err) return <div className="error-box">{err}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="grid cols3">
        <div className="card stat">
          <div className="n">{data.pending_items}</div>
          <div className="l">items on the list</div>
        </div>
        <div className="card stat">
          <div className="n">{data.catalog_confirmed}/{data.catalog_size}</div>
          <div className="l">catalog products confirmed</div>
        </div>
        <div className="card stat">
          <div className="n">{data.latest_plan ? new Date(data.latest_plan.week_start).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—'}</div>
          <div className="l">latest meal plan week</div>
        </div>
      </div>

      <div className="card">
        <h2>This week's flow</h2>
        <ol className="muted" style={{ lineHeight: 2 }}>
          <li><a onClick={() => goTo('plan')} href="#">Generate the weekly plan</a> (budget, schedule, mood chips)</li>
          <li>Push plan ingredients to the <a onClick={() => goTo('list')} href="#">shopping list</a> — WhatsApp items land there automatically</li>
          <li><a onClick={() => goTo('cart')} href="#">Build the Sixty60 cart</a>, review, then check out yourself in the app</li>
        </ol>
        {data.last_cart_run && (
          <p className="muted">
            Last cart run: <b>{data.last_cart_run.status}</b> ({new Date(data.last_cart_run.started_at).toLocaleString('en-ZA')})
          </p>
        )}
      </div>
    </div>
  );
}
