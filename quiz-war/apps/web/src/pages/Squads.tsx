import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, Skeleton } from '../components/Feedback';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

export default function Squads() {
  const squadId = useAuth((s) => s.squadId);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['squads', q], queryFn: async () => (await api<{ items: any[] }>(`/squads?q=${encodeURIComponent(q)}&pageSize=30`)).items });
  const invites = useQuery({ queryKey: ['squad-invites'], queryFn: async () => (await api<{ items: any[] }>('/squads/invites')).items });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = await api<{ id: number }>('/squads', { body: { name: f.get('name'), tag: f.get('tag'), description: f.get('description') || null, isOpen: f.get('open') === 'on' } });
      await useAuth.getState().loadMe();
      nav(`/squads/${r.id}`);
    } catch (e2) {
      setErr(friendlyError(e2));
    }
  }

  return (
    <div className="page stack">
      <PageHeader title="Squads" back action={!squadId && <button className="btn sm primary" onClick={() => setCreate(true)}>Create</button>} />
      {squadId && <Link to={`/squads/${squadId}`} className="card row" style={{ color: 'var(--text)', background: 'var(--primary-soft)' }}>🛡️ <b className="grow">My Squad</b>Open →</Link>}
      {invites.data?.map((i) => (
        <div key={i.id} className="card row">
          🛡️ <div className="grow"><b>{i.name}</b> <span className="chip">{i.tag}</span><p className="xs muted">invited you</p></div>
          <button className="btn sm success" onClick={async () => { try { await api(`/squads/invites/${i.id}/accept`, { method: 'POST' }); await useAuth.getState().loadMe(); nav(`/squads/${i.squadId}`); } catch (e) { toast.error('Could not join', friendlyError(e)); } }}>Join</button>
          <button className="btn sm ghost" onClick={() => void api(`/squads/invites/${i.id}/decline`, { method: 'POST' }).then(() => invites.refetch())}>Decline</button>
        </div>
      ))}
      <input className="input" placeholder="Search squads by name or tag" aria-label="Search squads" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.isLoading ? <Skeleton lines={5} /> : !list.data?.length ? <Empty icon="🛡️" title="No squads found" body="Create one and invite your friends!" /> : (
        <div className="card list">
          {list.data.map((s) => (
            <Link key={s.id} to={`/squads/${s.id}`} className="list-row link" style={{ color: 'var(--text)' }}>
              <span className="avatar" style={{ width: 42, height: 42, fontSize: 42 }}>{s.logoUrl ? <img src={s.logoUrl} alt="" /> : <span className="initial">🛡️</span>}</span>
              <div className="grow"><b>{s.name}</b> <span className="chip">{s.tag}</span><p className="xs muted">{s.memberCount}/{s.memberLimit} members · {Number(s.xp).toLocaleString()} XP {s.isOpen ? '' : '· invite only'}</p></div>
            </Link>
          ))}
        </div>
      )}
      <Sheet open={create} onClose={() => setCreate(false)} title="Create a squad">
        <form className="col" onSubmit={submit}>
          {err && <p className="form-error">{err}</p>}
          <div className="field"><label htmlFor="sn">Name</label><input id="sn" name="name" className="input" required minLength={3} maxLength={40} /></div>
          <div className="field"><label htmlFor="st">Tag (2–6 letters)</label><input id="st" name="tag" className="input" required minLength={2} maxLength={6} style={{ textTransform: 'uppercase' }} /></div>
          <div className="field"><label htmlFor="sd">Description</label><textarea id="sd" name="description" className="input" maxLength={300} /></div>
          <label className="row small bold"><span className="switch"><input type="checkbox" name="open" defaultChecked /></span> Anyone can join</label>
          <button className="btn primary block">Create squad</button>
        </form>
      </Sheet>
    </div>
  );
}
