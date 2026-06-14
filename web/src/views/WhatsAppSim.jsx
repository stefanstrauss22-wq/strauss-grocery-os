import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

export default function WhatsAppSim() {
  const { tr } = useLang();
  const [name, setName] = useState('Mamma');
  const [text, setText] = useState('');
  const [chat, setChat] = useState([
    { who: 'bot', text: 'Hi! Stuur jou kruideniersware hier 🛒 — "melk en brood asb", "need toilet paper urgently", or a whole list.' },
  ]);
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    setChat(c => [...c, { who: 'me', text: msg }]);
    setText(''); setBusy(true);
    try {
      const res = await api.post('/whatsapp/simulate', { name, text: msg });
      setChat(c => [...c, { who: 'bot', text: res.reply }]);
    } catch (err) {
      setChat(c => [...c, { who: 'bot', text: `⚠️ ${err.message}` }]);
    }
    setBusy(false);
  }

  return (
    <div className="grid cols2">
      <div className="card">
        <h2>{tr('Test the bot', 'Toets die bot')} 🧪</h2>
        <p className="lead">
          {tr('A practice chat that uses the ', 'n Oefen-klets wat dieselfde ')}<b>{tr('exact same brain', 'presiese brein')}</b>{tr(' as the real Groceries Bot — type a message, watch it understand and reply. ', ' as die regte Kruideniers-bot gebruik — tik n boodskap, kyk hoe dit verstaan en antwoord. ')}<b>{tr('Anything you send here really does land on the shopping list', 'Enigiets wat jy hier stuur, beland regtig op die inkopielys')}</b>{tr(' (List tab), so it\'s also a quick way to add items from this screen. English and Afrikaans both work.', ' (Lys-oortjie), so dis ook n vinnige manier om items van hierdie skerm af by te voeg. Engels en Afrikaans werk altwee.')}
        </p>
        <label className="field">{tr('Sending as', 'Stuur as')}
          <select value={name} onChange={e => setName(e.target.value)}>
            {['Mamma', 'Pappa', 'Liam', 'Emma', 'Noah', 'Thandi'].map(n => <option key={n}>{n}</option>)}
          </select>
        </label>
        <div className="chat">
          {chat.map((m, i) => <div key={i} className={`bubble ${m.who}`}>{m.text}</div>)}
          {busy && <div className="bubble bot"><span className="spinner">⏳</span></div>}
        </div>
        <form className="chat-input" onSubmit={send}>
          <input type="text" placeholder={tr('we\'re out of milk, and please buy dog food', 'ons is uit melk uit, en koop asb hondekos')} value={text} onChange={e => setText(e.target.value)} />
          <button className="primary" type="submit" disabled={busy}>{tr('Send', 'Stuur')}</button>
        </form>
      </div>
      <div className="card">
        <h2>✅ {tr('The bot is live on WhatsApp', 'Die bot is regstreeks op WhatsApp')}</h2>
        <p className="lead">{tr('Setup is done — the family uses it on real WhatsApp. This tab is just a sandbox for testing.', 'Opstelling is klaar — die gesin gebruik dit op regte WhatsApp. Hierdie oortjie is net n speelplek om te toets.')}</p>
        <h3>{tr('How the family uses it', 'Hoe die gesin dit gebruik')}</h3>
        <ol className="muted" style={{ lineHeight: 2 }}>
          <li>{tr('Open the ', 'Maak die ')}<b>{tr('Groceries Bot', 'Kruideniers-bot')}</b>{tr(' chat in WhatsApp.', '-klets in WhatsApp oop.')}</li>
          <li>{tr('Type what ran out — ', 'Tik wat opgeraak het — ')}<i>"we're out of milk"</i>, <i>"koop asb 2 brode en hondekos"</i>.</li>
          <li>{tr('The bot replies with a ✅ and the item lands on the shared ', 'Die bot antwoord met n ✅ en die item beland outomaties op die gedeelde ')}<b>{tr('List', 'Lys')}</b>{tr(' automatically.', '.')}</li>
        </ol>
        <h3>{tr('Good to know', 'Goed om te weet')}</h3>
        <ul className="muted" style={{ lineHeight: 2 }}>
          <li>{tr('Type, don\'t voice-note (voice isn\'t switched on yet).', 'Tik, moenie spraaknotas stuur nie (stem is nog nie aangeskakel nie).')}</li>
          <li>{tr('Only the ', 'Net die ')}<b>{tr('5 registered numbers', '5 geregistreerde nommers')}</b>{tr(' can use the bot.', ' kan die bot gebruik.')}</li>
          <li>{tr('Posted in the family group by mistake? Forward that message to the bot.', 'Per ongeluk in die gesin-groep gepos? Stuur daardie boodskap aan na die bot.')}</li>
        </ul>
      </div>
    </div>
  );
}
