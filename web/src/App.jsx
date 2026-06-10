import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import Dashboard from './views/Dashboard.jsx';
import PlanView from './views/PlanView.jsx';
import ListView from './views/ListView.jsx';
import CartView from './views/CartView.jsx';
import CatalogView from './views/CatalogView.jsx';
import WhatsAppSim from './views/WhatsAppSim.jsx';
import SettingsView from './views/SettingsView.jsx';

const TABS = [
  ['dashboard', '🏠 Home'],
  ['plan', '🍽️ Plan'],
  ['list', '🛒 List'],
  ['cart', '🤖 Cart'],
  ['catalog', '📦 Catalog'],
  ['whatsapp', '💬 WhatsApp'],
  ['settings', '⚙️ Settings'],
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.get('/health').then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>🛒 Strauss Grocery OS</h1>
        {health && (
          <div className="badges">
            <span className={`badge ${health.ok ? 'ok' : 'err'}`}>{health.ok ? `db: ${health.db}` : 'API offline'}</span>
            <span className={`badge ${health.ai ? 'ok' : 'warn'}`}>AI {health.ai ? 'on' : 'off'}</span>
            <span className={`badge ${health.whatsapp ? 'ok' : 'warn'}`}>WA {health.whatsapp ? 'live' : 'sim'}</span>
          </div>
        )}
      </header>
      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <main className="content">
        {tab === 'dashboard' && <Dashboard goTo={setTab} />}
        {tab === 'plan' && <PlanView />}
        {tab === 'list' && <ListView />}
        {tab === 'cart' && <CartView />}
        {tab === 'catalog' && <CatalogView />}
        {tab === 'whatsapp' && <WhatsAppSim />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
