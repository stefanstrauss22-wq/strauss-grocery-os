import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useLang } from './i18n.jsx';
import SpensIcon from './components/SpensIcon.jsx';
import Dashboard from './views/Dashboard.jsx';
import PlanView from './views/PlanView.jsx';
import ListView from './views/ListView.jsx';
import StaplesView from './views/StaplesView.jsx';
import CartView from './views/CartView.jsx';
import CatalogView from './views/CatalogView.jsx';
import SettingsView from './views/SettingsView.jsx';

// [id, icon, English label, Afrikaans label]
const TABS = [
  ['dashboard', '🏠', 'Home', 'Tuis'],
  ['plan', '🍽️', 'Plan', 'Beplan'],
  ['list', '🛒', 'List', 'Lys'],
  ['staples', '🧺', 'Staples', 'Stapels'],
  ['cart', '🤖', 'Cart', 'Mandjie'],
  ['catalog', '📦', 'Catalog', 'Katalogus'],
  ['settings', '⚙️', 'Settings', 'Instellings'],
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [health, setHealth] = useState(null);
  const { lang, setLang, tr } = useLang();

  useEffect(() => {
    api.get('/health').then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SpensIcon size={42} title="Spens" />
          <div>
            <h1>{tr('Morning Strausse!', 'Môre Strausse!')}</h1>
            <div className="sub">{tr("What's cooking this week?", 'Wat kook ons hierdie week?')}</div>
          </div>
        </div>
        <div className="badges">
          <div className="lang-toggle" role="group" aria-label="Language">
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'af' ? 'active' : ''} onClick={() => setLang('af')}>AF</button>
          </div>
          {health && (<>
            <span className={`badge ${health.ok ? 'ok' : 'err'}`}>{health.ok ? tr('● online', '● aanlyn') : tr('● offline', '● vanlyn')}</span>
            <span className={`badge ${health.ai ? 'ok' : 'warn'}`}>AI {health.ai ? tr('on', 'aan') : tr('off', 'af')}</span>
            <span className={`badge ${health.whatsapp ? 'ok' : 'warn'}`}>{health.whatsapp ? tr('WhatsApp live', 'WhatsApp lewendig') : tr('WA sim', 'WA sim')}</span>
          </>)}
        </div>
      </header>
      <nav className="tabs">
        {TABS.map(([id, ico, en, af]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span className="ico">{ico}</span>
            <span>{tr(en, af)}</span>
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
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
