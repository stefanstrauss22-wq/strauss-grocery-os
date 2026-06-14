import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

const DEFAULT_PROFILE = {
  household: '2 parents, 3 active teenagers; domestic worker weekday lunches',
  allergies: '',
  dislikes: '',
  equipment: 'oven, stovetop, air fryer, Weber braai, slow cooker',
  rhythms: 'Sunday is the big family meal. Friday is braai or pizza night.',
  default_budget_rand: 2500,
};

export default function SettingsView() {
  const { tr } = useLang();
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
        <h2>{tr('Household profile (feeds every plan)', 'Huishoudingprofiel (voed elke plan)')}</h2>
        <label className="field">{tr("Who's eating", 'Wie eet saam')}
          <input type="text" value={profile.household} onChange={set('household')} />
        </label>
        <label className="field">{tr('Allergies (absolute no-gos)', 'Allergieë (absolute no-gos)')}
          <input type="text" placeholder={tr('e.g. peanuts (Emma)', 'bv. grondbone (Emma)')} value={profile.allergies} onChange={set('allergies')} />
        </label>
        <label className="field">{tr('Dislikes', 'Afkere')}
          <input type="text" placeholder={tr("e.g. Anna won't eat mushrooms; no offal", 'bv. Anna eet nie sampioene nie; geen afval')} value={profile.dislikes} onChange={set('dislikes')} />
        </label>
        <label className="field">{tr('Equipment', 'Toerusting')}
          <input type="text" value={profile.equipment} onChange={set('equipment')} />
        </label>
        <label className="field">{tr('Weekly rhythms', 'Weeklikse ritmes')}
          <textarea value={profile.rhythms} onChange={set('rhythms')} />
        </label>
        <label className="field">{tr('Default weekly budget (Rand)', 'Verstek weeklikse begroting (Rand)')}
          <input type="number" value={profile.default_budget_rand} onChange={e => setProfile(p => ({ ...p, default_budget_rand: Number(e.target.value) }))} />
        </label>
        <button className="primary" onClick={saveProfile}>{saved ? tr('✅ Saved', '✅ Gestoor') : tr('Save profile', 'Stoor profiel')}</button>
      </div>
      <div className="card">
        <h2>{tr('Family members', 'Gesinslede')}</h2>
        <p className="muted">{tr('Phone numbers link WhatsApp senders to people (use international format, e.g. 27821234567).', 'Telefoonnommers koppel WhatsApp-senders aan mense (gebruik internasionale formaat, bv. 27821234567).')}</p>
        <table className="plain">
          <thead><tr><th>{tr('Name', 'Naam')}</th><th>{tr('Role', 'Rol')}</th><th>{tr('Phone', 'Telefoon')}</th><th></th></tr></thead>
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
          <input type="text" placeholder={tr('name', 'naam')} value={newMember.name} onChange={e => setNewMember(m => ({ ...m, name: e.target.value }))} />
          <select value={newMember.role} onChange={e => setNewMember(m => ({ ...m, role: e.target.value }))}>
            <option value="parent">{tr('parent', 'ouer')}</option>
            <option value="child">{tr('child', 'kind')}</option>
            <option value="domestic">{tr('domestic worker', 'huishulp')}</option>
          </select>
          <div className="row">
            <input type="text" placeholder={tr('phone', 'telefoon')} value={newMember.phone} onChange={e => setNewMember(m => ({ ...m, phone: e.target.value }))} />
            <button className="primary" type="submit">{tr('Add', 'Voeg by')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
