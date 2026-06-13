import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import Dashboard from './views/Dashboard.jsx';
import PlanView from './views/PlanView.jsx';
import ListView from './views/ListView.jsx';
import StaplesView from './views/StaplesView.jsx';
import CartView from './views/CartView.jsx';
import CatalogView from './views/CatalogView.jsx';
import WhatsAppSim from './views/WhatsAppSim.jsx';
import SettingsView from './views/SettingsView.jsx';

const TABS = [
  ['dashboard', '🏠', 'Home'],
  ['plan', '🍽️', 'Plan'],
  ['list', '🛒', 'List'],
  ['staples', '🧺', 'Staples'],
  ['cart', '🤖', 'Cart'],
  ['catalog', '📦', 'Catalog'],
  ['whatsapp', '💬', 'Chat'],
  ['settings', '⚙️', 'Settings'],
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.get('/health').then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{greeting()}, Strauss family 🧑‍🍳</h1>
          <div className="sub">What's cooking this week?</div>
        </div>
        {health && (
          <div className="badges">
            <span className={`badge ${health.ok ? 'ok' : 'err'}`}>{health.ok ? '● online' : '● offline'}</span>
            <span className={`badge ${health.ai ? 'ok' : 'warn'}`}>AI {health.ai ? 'on' : 'off'}</span>
            <span className={`badge ${health.whatsapp ? 'ok' : 'warn'}`}>{health.whatsapp ? 'WhatsApp live' : 'WA sim'}</span>
          </div>
        )}
      </header>
      <nav className="tabs">
        {TABS.map(([id, ico, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span className="ico">{ico}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'dashboard' && <Dashboard goTo={setTab} />}
        {tab === 'plan' && <PlanView />}
        {tab === 'list' && <ListView />}
        {tab === 'staples' && <StaplesView />}
        {tab === 'cart' && <CartView />}
        {tab === 'catalog' && <CatalogView />}
        {tab === 'whatsapp' && <WhatsAppSim />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
