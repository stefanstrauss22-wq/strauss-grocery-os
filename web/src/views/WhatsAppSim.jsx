import React, { useState } from 'react';
import { api } from '../api.js';

export default function WhatsAppSim() {
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
        <h2>Test the bot 🧪</h2>
        <p className="lead">
          A practice chat that uses the <b>exact same brain</b> as the real Groceries Bot —
          type a message, watch it understand and reply. <b>Anything you send here really does land on
          the shopping list</b> (List tab), so it's also a quick way to add items from this screen.
          English and Afrikaans both work.
        </p>
        <label className="field">Sending as
          <select value={name} onChange={e => setName(e.target.value)}>
            {['Mamma', 'Pappa', 'Liam', 'Emma', 'Noah', 'Thandi'].map(n => <option key={n}>{n}</option>)}
          </select>
        </label>
        <div className="chat">
          {chat.map((m, i) => <div key={i} className={`bubble ${m.who}`}>{m.text}</div>)}
          {busy && <div className="bubble bot"><span className="spinner">⏳</span></div>}
        </div>
        <form className="chat-input" onSubmit={send}>
          <input type="text" placeholder="ons is uit melk uit, en koop asb hondekos" value={text} onChange={e => setText(e.target.value)} />
          <button className="primary" type="submit" disabled={busy}>Send</button>
        </form>
      </div>
      <div className="card">
        <h2>✅ The bot is live on WhatsApp</h2>
        <p className="lead">Setup is done — the family uses it on real WhatsApp. This tab is just a sandbox for testing.</p>
        <h3>How the family uses it</h3>
        <ol className="muted" style={{ lineHeight: 2 }}>
          <li>Open the <b>Groceries Bot</b> chat in WhatsApp.</li>
          <li>Type what ran out — <i>"we're out of milk"</i>, <i>"koop asb 2 brode en hondekos"</i>.</li>
          <li>The bot replies with a ✅ and the item lands on the shared <b>List</b> automatically.</li>
        </ol>
        <h3>Good to know</h3>
        <ul className="muted" style={{ lineHeight: 2 }}>
          <li>Type, don't voice-note (voice isn't switched on yet).</li>
          <li>Only the <b>5 registered numbers</b> can use the bot.</li>
          <li>Posted in the family group by mistake? Forward that message to the bot.</li>
        </ul>
      </div>
    </div>
  );
}
