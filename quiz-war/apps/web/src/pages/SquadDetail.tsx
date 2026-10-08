import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { ErrorBox, Skeleton } from '../components/Feedback';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { uploadImage } from '../lib/image';
import { PUBLIC_WEB_URL, share } from '../lib/platform';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';

const ROLE: Record<string, string> = { captain: '👑 Captain', officer: '⭐ Officer', member: 'Member' };

export default function SquadDetail() {
  const { id = '' } = useParams();
  const me = useAuth((s) => s.user)!;
  const mySquad = useAuth((s) => s.squadId);
  const nav = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['squad', id], queryFn: () => api(`/squads/${id}`) });
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const [invite, setInvite] = useState(false);
  const [manage, setManage] = useState<any>(null);

  if (isLoading) return <div className="page"><Skeleton kind="card" lines={2} /></div>;
  if (error || !data) return <div className="page"><ErrorBox error={error} retry={refetch} /></div>;
  const myRole = data.members.find((m: any) => m.user.id === me.id)?.role as string | undefined;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      void refetch();
      await useAuth.getState().loadMe();
    } catch (e) {
      toast.error('Something went wrong', friendlyError(e));
    }
  };
  const squadBattle = async (mode: 'duo' | 'trio' | 'squad') => {
    try {
      const r = await emit('room:create', { mode, squadId: data.id });
      useGame.getState().reset(r.matchId);
      void share({ title: 'Squad battle', text: `🛡️ ${data.name} squad battle — join the War Room!`, url: `${PUBLIC_WEB_URL}/war-room/${r.matchId}` });
      nav(`/war-room/${r.matchId}`);
    } catch (e) {
      toast.error('Could not create room', friendlyError(e));
    }
  };

  return (
    <div className="page stack">
      <PageHeader title="Squad" back />
      <section className="profile-head">
        <label className="avatar" style={{ width: 96, height: 96, fontSize: 96, cursor: myRole === 'captain' ? 'pointer' : 'default' }}>
          {data.logoUrl ? <img src={data.logoUrl} alt={`${data.name} logo`} /> : <span className="initial">🛡️</span>}
          {myRole === 'captain' && <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void run(() => uploadImage(`/squads/${data.id}/logo`, e.target.files![0], api), 'Logo updated')} />}
        </label>
        <h1>{data.name} <span className="chip">{data.tag}</span></h1>
        {data.description && <p className="small muted">{data.description}</p>}
        <div className="stat-grid" style={{ width: '100%' }}>
          <div className="stat"><b>#{data.squadRank}</b><span>Squad rank</span></div>
          <div className="stat"><b className="num">{data.xp.toLocaleString()}</b><span>Squad XP</span></div>
          <div className="stat"><b>{data.memberCount}/{data.memberLimit}</b><span>Members</span></div>
        </div>
      </section>
      {!myRole && !mySquad && data.isOpen && <button className="btn primary lg block" onClick={() => void run(() => api(`/squads/${data.id}/join`, { method: 'POST' }), 'Welcome to the squad!')}>Join squad</button>}
      {myRole && (
        <section className="card">
          <h3 className="mb">⚔️ Squad battle room</h3>
          <p className="xs muted mb">Create a War Room for squad members. Squad Wars between squads are coming soon.</p>
          <div className="row">
            <button className="btn soft grow" onClick={() => void squadBattle('duo')}>2v2</button>
            <button className="btn soft grow" onClick={() => void squadBattle('trio')}>3v3</button>
            <button className="btn soft grow" onClick={() => void squadBattle('squad')}>4v4</button>
          </div>
        </section>
      )}
      <section className="card">
        <div className="card-title"><h3>Members</h3>{(myRole === 'captain' || myRole === 'officer') && <button className="btn sm soft" onClick={() => setInvite(true)}>Invite</button>}</div>
        {data.members.map((m: any) => (
          <div key={m.user.id} className="list-row">
            <Link to={`/u/${m.user.uid}`}><Avatar name={m.user.username} src={m.user.avatarThumbUrl} size={40} /></Link>
            <div className="grow"><b>{m.user.username}</b><p className="xs muted">{ROLE[m.role]} · {m.contributedXp.toLocaleString()} XP</p></div>
            {myRole === 'captain' && m.user.id !== me.id && <button className="btn sm ghost" onClick={() => setManage(m)}>Manage</button>}
            {myRole === 'officer' && m.role === 'member' && <button className="btn sm ghost" onClick={() => void run(() => api(`/squads/${data.id}/members/${m.user.id}`, { method: 'DELETE' }), 'Member removed')}>Remove</button>}
          </div>
        ))}
      </section>
      {myRole && <button className="btn ghost block" style={{ color: 'var(--danger)' }} onClick={() => void run(() => api('/squads/leave', { method: 'POST' }), 'You left the squad').then(() => nav('/squads'))}>Leave squad</button>}

      <Sheet open={invite} onClose={() => setInvite(false)} title="Invite friends">
        <div className="list">
          {friends.data?.length ? friends.data.map((f) => (
            <div key={f.user.id} className="list-row"><Avatar name={f.user.username} src={f.user.avatarThumbUrl} size={36} /><b className="grow">{f.user.username}</b>
              <button className="btn sm soft" onClick={() => void run(() => api(`/squads/${data.id}/invite`, { body: { userId: f.user.id } }), 'Invitation sent')}>Invite</button></div>
          )) : <p className="muted small">Add friends first to invite them.</p>}
        </div>
      </Sheet>
      <Sheet open={!!manage} onClose={() => setManage(null)} title={manage?.user.username ?? ''}>
        {manage && (
          <div className="col">
            {manage.role !== 'officer' && <button className="btn outline block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'PATCH', body: { role: 'officer' } }), 'Promoted to officer').then(() => setManage(null))}>Make officer</button>}
            {manage.role === 'officer' && <button className="btn outline block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'PATCH', body: { role: 'member' } }), 'Role updated').then(() => setManage(null))}>Make member</button>}
            <button className="btn outline block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'PATCH', body: { role: 'captain' } }), 'Captain transferred').then(() => setManage(null))}>👑 Transfer captaincy</button>
            <button className="btn danger block" onClick={() => void run(() => api(`/squads/${data.id}/members/${manage.user.id}`, { method: 'DELETE' }), 'Member removed').then(() => setManage(null))}>Remove from squad</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
