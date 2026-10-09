import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Loading, Modal } from '../components/ui';
import { api, errMsg } from '../lib/api';

const PERIODS: Record<string, string> = { daily: 'Daily (resets at midnight BD time)', weekly: 'Weekly (resets Monday)', once: 'One-time' };
const ICONS = ['target', 'swords', 'trophy', 'brain', 'calendar', 'bolt', 'crown', 'globe', 'users', 'star', 'medal', 'flame', 'gift'];

function MissionForm({ m, metrics, onDone }: { m: any | null; metrics: Record<string, string>; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      title: f.get('title'),
      description: f.get('description') || null,
      icon: f.get('icon'),
      period: f.get('period'),
      metric: f.get('metric'),
      target: Number(f.get('target')),
      rewardCoins: Number(f.get('rewardCoins')),
      rewardXp: Number(f.get('rewardXp')),
      sortOrder: Number(f.get('sortOrder') || 0),
      isActive: f.get('isActive') === 'on',
    };
    try {
      await api(m ? `/missions/${m.id}` : '/missions', { method: m ? 'PUT' : 'POST', body });
      onDone();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="field"><label htmlFor="m-title">Title (shown to players)</label><input id="m-title" name="title" className="input" defaultValue={m?.title} required maxLength={100} placeholder="জয়ের স্বাদ" /></div>
      <div className="field"><label htmlFor="m-desc">Description</label><input id="m-desc" name="description" className="input" defaultValue={m?.description ?? ''} maxLength={300} placeholder="আজ ২টি ব্যাটল জিতুন" /></div>
      <div className="cols">
        <div className="field"><label htmlFor="m-period">Repeats</label><select id="m-period" name="period" className="input" defaultValue={m?.period ?? 'daily'}>{Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="m-metric">Condition</label><select id="m-metric" name="metric" className="input" defaultValue={m?.metric ?? 'battle_wins'}>{Object.entries(metrics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="m-target">Target</label><input id="m-target" name="target" type="number" min={1} className="input" defaultValue={m?.target ?? 3} required /></div>
      </div>
      <div className="cols">
        <div className="field"><label htmlFor="m-coins">Reward coins</label><input id="m-coins" name="rewardCoins" type="number" min={0} className="input" defaultValue={m?.rewardCoins ?? 50} /></div>
        <div className="field"><label htmlFor="m-xp">Reward XP</label><input id="m-xp" name="rewardXp" type="number" min={0} className="input" defaultValue={m?.rewardXp ?? 50} /></div>
        <div className="field"><label htmlFor="m-icon">Icon</label><select id="m-icon" name="icon" className="input" defaultValue={m?.icon ?? 'target'}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select></div>
        <div className="field"><label htmlFor="m-sort">Order</label><input id="m-sort" name="sortOrder" type="number" className="input" defaultValue={m?.sortOrder ?? 0} /></div>
      </div>
      <label className="row small"><input type="checkbox" name="isActive" defaultChecked={m?.isActive ?? true} /> Active</label>
      {err && <p className="err">{err}</p>}
      <button className="btn primary">{m ? 'Save mission' : 'Create mission'}</button>
    </form>
  );
}

export default function Missions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['missions'], queryFn: () => api('/missions') });
  const [edit, setEdit] = useState<any | 'new' | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['missions'] });
  return (
    <>
      <div className="head"><h1>Missions & quests</h1><button className="btn primary" onClick={() => setEdit('new')}>+ New mission</button></div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>Players see these in Shop → Missions. When a condition is met they get a notification and claim the reward themselves. Rewards are coins and XP earned by playing — they can never be bought.</p>
      <div className="card table-wrap">
        {q.isLoading ? <Loading /> : (
          <table>
            <thead><tr><th>Mission</th><th>Repeats</th><th>Condition</th><th>Reward</th><th>Completed</th><th>Claimed</th><th>Status</th><th /></tr></thead>
            <tbody>{q.data.items.map((m: any) => (
              <tr key={m.id}>
                <td><b style={{ fontFamily: 'var(--font-bn)' }}>{m.title}</b><div className="small muted" style={{ fontFamily: 'var(--font-bn)' }}>{m.description}</div></td>
                <td><span className="badge">{m.period}</span></td>
                <td className="small">{q.data.metrics[m.metric] ?? m.metric} ≥ <b>{m.target}</b></td>
                <td className="small">🪙 {m.rewardCoins} · ⭐ {m.rewardXp} XP</td>
                <td>{m.completions}</td>
                <td>{m.claims}</td>
                <td>{m.isActive ? <span className="badge green">active</span> : <span className="badge">off</span>}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setEdit(m)}>Edit</button>
                  <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Delete “${m.title}”?`) && void api(`/missions/${m.id}`, { method: 'DELETE' }).then(refresh).catch((e) => alert(errMsg(e)))}>Delete</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === 'new' ? 'New mission' : 'Edit mission'}>
        {q.data && <MissionForm m={edit === 'new' ? null : edit} metrics={q.data.metrics} onDone={() => (setEdit(null), refresh())} />}
      </Modal>
    </>
  );
}
