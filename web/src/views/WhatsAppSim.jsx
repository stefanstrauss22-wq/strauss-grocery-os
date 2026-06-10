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
        <h2>WhatsApp simulator</h2>
        <p className="muted">
          Exactly the pipeline the real WhatsApp bot uses (message → AI extraction → shopping list → reply),
          minus the Meta account. English and Afrikaans both work. Items appear in the List tab instantly.
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
        <h2>Going live</h2>
        <ol className="muted" style={{ lineHeight: 1.9 }}>
          <li>Create a Meta developer app → add the <b>WhatsApp</b> product (free test number included, up to 5 recipients).</li>
          <li>Set the webhook URL to <code>https://YOUR-SERVER/api/whatsapp/webhook</code> with your <code>WHATSAPP_VERIFY_TOKEN</code>.</li>
          <li>Put <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_NUMBER_ID</code> in <code>server/.env</code>.</li>
          <li>Family members message the bot number — replies and list updates are instant.</li>
        </ol>
        <p className="muted">Full steps in <code>SETUP.md</code>. No spare SIM needed: Meta's test number works today; a landline or Twilio number works for production.</p>
      </div>
    </div>
  );
}
