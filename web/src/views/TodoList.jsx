import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

export default function TodoList() {
  const { tr } = useLang();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [err, setErr] = useState(null);

  const load = () => api.get('/tasks').then(setTasks).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!newTask.trim()) return;
    await api.post('/tasks', { title: newTask.trim(), added_by: 'web' });
    setNewTask('');
    load();
  }

  const toggle = t => api.patch(`/tasks/${t.id}`, { done: !t.done }).then(load);
  const remove = t => api.del(`/tasks/${t.id}`).then(load);

  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row">
        <h2>📝 {tr('To-do list', 'Doenlys')}</h2>
        <div className="spacer" />
        <span className="muted">{open.length} {tr('open', 'oop')}</span>
      </div>
      <form onSubmit={add} className="chat-input">
        <input type="text" placeholder={tr('Add a to-do… (or send it to the WhatsApp bot)', 'Voeg ’n doening by… (of stuur dit na die WhatsApp-bot)')} value={newTask} onChange={e => setNewTask(e.target.value)} />
        <button className="primary" type="submit">{tr('Add', 'Voeg by')}</button>
      </form>
      {err && <div className="error-box">{err}</div>}

      <ul className="items">
        {open.map(t => (
          <li key={t.id}>
            <input type="checkbox" checked={false} onChange={() => toggle(t)} title={tr('Mark done', 'Merk as klaar')} />
            <span className="name">
              {t.title}
              {t.added_by ? <span className="muted"> — {t.added_by}</span> : null}
            </span>
            <button className="ghost tiny" onClick={() => remove(t)} title={tr('Remove', 'Verwyder')}>✕</button>
          </li>
        ))}
        {done.map(t => (
          <li key={t.id} className="muted">
            <input type="checkbox" checked={true} onChange={() => toggle(t)} title={tr('Mark not done', 'Merk as nie klaar nie')} />
            <span className="name" style={{ textDecoration: 'line-through' }}>{t.title}</span>
            <button className="ghost tiny" onClick={() => remove(t)} title={tr('Remove', 'Verwyder')}>✕</button>
          </li>
        ))}
      </ul>
      {!tasks.length && <p className="muted">{tr('Nothing on the list. Add one above, or tell the WhatsApp bot "remind me to…".', 'Niks op die lys nie. Voeg een hierbo by, of sê vir die WhatsApp-bot "herinner my om…".')}</p>}
    </div>
  );
}
