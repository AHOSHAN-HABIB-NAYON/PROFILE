import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { REPORT_REASONS } from '@quizwar/shared';
import { PageHeader } from '../components/AppShell';
import { Avatar, statusLabel } from '../components/Avatar';
import { ChallengeSheet } from '../components/ChallengeSheet';
import { Empty, Skeleton } from '../components/Feedback';
import { LeagueBadge } from '../components/Game';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { StatsGrid } from './Profile';

export default function PublicProfile() {
  const { uid = '' } = useParams();
  const authed = useAuth((s) => s.status === 'authed');
  const me = useAuth((s) => s.user);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [challenge, setChallenge] = useState(false);
  const [more, setMore] = useState(false);
  const [report, setReport] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['profile', uid.toUpperCase()], queryFn: () => api(`/users/${encodeURIComponent(uid)}`) });

  if (isLoading) return <div className="page"><Skeleton kind="card" lines={2} /></div>;
  if (error || !data) return <div className="page"><Empty icon="🔍" title="Player not found" body="Check the UID and try again." action={<Link className="btn primary" to={authed ? '/friends?tab=add' : '/welcome'}>Go back</Link>} /></div>;
  const self = me?.id === data.user.id;
  const rel = data.relation;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      void qc.invalidateQueries({ queryKey: ['profile', uid.toUpperCase()] });
      void qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      toast.error('Something went wrong', friendlyError(e));
    }
  };

  return (
    <div className={authed ? 'page stack' : 'welcome stack'}>
      <PageHeader title="Player" back={authed} action={authed && !self ? <button className="btn sm ghost" onClick={() => setMore(true)}>•••</button> : undefined} />
      <section className="profile-head">
        <Avatar name={data.user.username} src={data.user.avatarUrl} size={96} frame={data.user.frame} status={rel?.status} />
        <h1>{data.user.username}</h1>
        {data.user.title && <span className="chip accent">{data.user.title}</span>}
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <span className="uid-badge">{data.user.uid}</span>
          <LeagueBadge rating={data.user.rating} />
          <span className="chip">Lv {data.user.level}</span>
        </div>
        {rel && <p className="xs muted">{statusLabel(rel.status)}</p>}
        {data.bio && <p className="small muted">{data.bio}</p>}
        {data.squad && <span className="chip primary">🛡️ {data.squad.name} [{data.squad.tag}]</span>}
      </section>

      {!authed ? (
        <Link to={`/welcome?next=${encodeURIComponent(`/u/${data.user.uid}`)}`} className="btn primary lg block">⚔️ Join QUIZ WAR to challenge {data.user.username}</Link>
      ) : !self && (
        <div className="row">
          <button className="btn primary grow" disabled={!rel?.available} onClick={() => setChallenge(true)}>⚔️ Challenge</button>
          {rel?.friend ? (
            <button className="btn outline grow" disabled>✓ Friends</button>
          ) : (
            <button className="btn soft grow" onClick={() => void act(() => api('/friends/requests', { body: { userId: data.user.id } }), 'Friend request sent')}>👥 Add Friend</button>
          )}
        </div>
      )}
      {authed && !self && !rel?.available && <p className="xs muted center">This player isn’t available for battle right now.</p>}

      <StatsGrid stats={data.stats} />
      {data.achievements.length > 0 && (
        <section className="card">
          <h3 className="mb">Achievements</h3>
          <div className="badges">{data.achievements.map((a: any) => <div key={a.key} className="badge-tile" title={a.description}><span className="b-icon">{a.icon}</span>{a.name}</div>)}</div>
        </section>
      )}

      {authed && <ChallengeSheet target={challenge ? data.user : null} onClose={() => setChallenge(false)} />}
      <Sheet open={more} onClose={() => setMore(false)} title={data.user.username}>
        <div className="col">
          {rel?.friend && <button className="btn outline block" onClick={() => void act(() => api(`/friends/${data.user.id}`, { method: 'DELETE' }), 'Friend removed').then(() => setMore(false))}>Remove friend</button>}
          <button className="btn outline block" onClick={() => (setMore(false), setReport(true))}>🚩 Report player</button>
          <button className="btn danger block" onClick={() => void act(() => api('/blocks', { body: { userId: data.user.id } }), 'Player blocked').then(() => nav('/friends'))}>🚫 Block player</button>
        </div>
      </Sheet>
      <Sheet open={report} onClose={() => setReport(false)} title="Report player">
        <form className="col" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await act(() => api('/reports', { body: { targetUid: data.user.uid, reason: f.get('reason'), details: String(f.get('details') || '') || undefined } }), 'Report sent — thank you');
          setReport(false);
        }}>
          <div className="field"><label htmlFor="r1">Reason</label><select id="r1" name="reason" className="input">{REPORT_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select></div>
          <div className="field"><label htmlFor="r2">Details (optional)</label><textarea id="r2" name="details" className="input" maxLength={1000} /></div>
          <button className="btn danger block">Send report</button>
        </form>
      </Sheet>
    </div>
  );
}
