import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const DEFAULT_PROFILE = {
  household: '2 parents, 3 active teenagers; domestic worker weekday lunches',
  allergies: '',
  dislikes: '',
  equipment: 'oven, stovetop, air fryer, Weber braai, slow cooker',
  rhythms: 'Sunday is the big family meal. Friday is braai or pizza night.',
  default_budget_rand: 2500,
};

export default function SettingsView() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [members, setMembers] = useState([]);
  const [newMember, setNewMember] = useState({ name: '', role: 'child', phone: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings/household_profile').then(p => p && setProfile({ ...DEFAULT_PROFILE, ...p }));
    api.get('/members').then(setMembers);
  }, []);

  async function saveProfile() {
    await api.put('/settings/household_profile', profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addMember(e) {
    e.preventDefault();
    if (!newMember.name) return;
    await api.post('/members', newMember);
    setNewMember({ name: '', role: 'child', phone: '' });
    setMembers(await api.get('/members'));
  }

  async function removeMember(m) {
    await api.del(`/members/${m.id}`);
    setMembers(await api.get('/members'));
  }

  const set = key => e => setProfile(p => ({ ...p, [key]: e.target.value }));

  return (
    <div className="grid cols2">
      <div className="card">
        <h2>Household profile (feeds every plan)</h2>
        <label className="field">Who's eating
          <input type="text" value={profile.household} onChange={set('household')} />
        </label>
        <label className="field">Allergies (absolute no-gos)
          <input type="text" placeholder="e.g. peanuts (Emma)" value={profile.allergies} onChange={set('allergies')} />
        </label>
        <label className="field">Dislikes
          <input type="text" placeholder="e.g. Anna won't eat mushrooms; no offal" value={profile.dislikes} onChange={set('dislikes')} />
        </label>
        <label className="field">Equipment
          <input type="text" value={profile.equipment} onChange={set('equipment')} />
        </label>
        <label className="field">Weekly rhythms
          <textarea value={profile.rhythms} onChange={set('rhythms')} />
        </label>
        <label className="field">Default weekly budget (Rand)
          <input type="number" value={profile.default_budget_rand} onChange={e => setProfile(p => ({ ...p, default_budget_rand: Number(e.target.value) }))} />
        </label>
        <button className="primary" onClick={saveProfile}>{saved ? '✅ Saved' : 'Save profile'}</button>
      </div>
      <div className="card">
        <h2>Family members</h2>
        <p className="muted">Phone numbers link WhatsApp senders to people (use international format, e.g. 27821234567).</p>
        <table className="plain">
          <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>{m.name}</td><td>{m.role}</td><td>{m.phone || '—'}</td>
                <td><button className="ghost tiny" onClick={() => removeMember(m)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addMember} className="grid cols3" style={{ marginTop: 10 }}>
          <input type="text" placeholder="name" value={newMember.name} onChange={e => setNewMember(m => ({ ...m, name: e.target.value }))} />
          <select value={newMember.role} onChange={e => setNewMember(m => ({ ...m, role: e.target.value }))}>
            <option value="parent">parent</option>
            <option value="child">child</option>
            <option value="domestic">domestic worker</option>
          </select>
          <div className="row">
            <input type="text" placeholder="phone" value={newMember.phone} onChange={e => setNewMember(m => ({ ...m, phone: e.target.value }))} />
            <button className="primary" type="submit">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
