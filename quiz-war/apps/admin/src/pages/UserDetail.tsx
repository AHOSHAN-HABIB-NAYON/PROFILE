import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Loading, Modal, StatusBadge, fmtDate } from '../components/ui';
import { Icon } from '../components/Icon';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

export default function UserDetail() {
  const { id = '' } = useParams();
  const { can } = useAdmin();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'matches' | 'logins' | 'moderation' | 'reports'>('matches');
  const [action, setAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const user = useQuery({ queryKey: ['user', id], queryFn: () => api(`/users/${id}`) });
  const matches = useQuery({ queryKey: ['user-matches', id], queryFn: () => api(`/users/${id}/matches?pageSize=30`), enabled: tab === 'matches' });
  const logins = useQuery({ queryKey: ['user-logins', id], queryFn: () => api(`/users/${id}/logins`), enabled: tab === 'logins' });
  if (user.isLoading) return <Loading rows={8} />;
  if (!user.data) return <p className="err">Player not found</p>;
  const u = user.data.user;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMsg({});
    try {
      if (action?.startsWith('reset_')) await api(`/users/${id}/reset`, { body: { field: action.slice(6), reason: f.get('reason') } });
      else await api(`/users/${id}/moderate`, { body: { action, reason: f.get('reason'), hours: f.get('hours') ? Number(f.get('hours')) : undefined } });
      setMsg({ ok: 'Done — action recorded in the audit log.' });
      setAction(null);
      void qc.invalidateQueries({ queryKey: ['user', id] });
    } catch (e2) {
      setMsg({ err: errMsg(e2) });
    }
  };

  return (
    <>
      <div className="head">
        <Link to="/users" className="btn ghost sm"><Icon name="chevron-left" size={16} />Players</Link>
        <h1>{u.username ?? '(no username)'} <code className="small">{u.uid}</code></h1>
        <StatusBadge status={u.status} />
        <span className="badge">{u.online}</span>
      </div>
      {msg.ok && <p className="ok">{msg.ok}</p>}
      {msg.err && <p className="err">{msg.err}</p>}
      <div className="grid two">
        <section className="card">
          <h2>Account</h2>
          <table className="mt kv"><tbody>
            <tr><td className="muted">Email</td><td>{u.email ?? '—'} {u.emailVerifiedAt && <span className="badge green">verified</span>}</td></tr>
            <tr><td className="muted">Login methods</td><td>{[u.hasPassword && 'Password', u.hasGoogle && 'Google', u.passkeys && `${u.passkeys} passkey(s)`].filter(Boolean).join(', ') || '—'}</td></tr>
            <tr><td className="muted">Joined</td><td>{fmtDate(u.createdAt)}</td></tr>
            <tr><td className="muted">Last login</td><td>{fmtDate(u.lastLoginAt)}</td></tr>
            {u.suspendedUntil && <tr><td className="muted">Suspended until</td><td>{fmtDate(u.suspendedUntil)}</td></tr>}
            {u.moderationReason && <tr><td className="muted">Reason</td><td>{u.moderationReason}</td></tr>}
            {user.data.activeMatchId && <tr><td className="muted">Live match</td><td><code>{user.data.activeMatchId}</code></td></tr>}
          </tbody></table>
        </section>
        <section className="card">
          <h2>Progress</h2>
          <table className="mt kv"><tbody>
            <tr><td className="muted">Level / XP</td><td>{u.level} · {Number(u.xp).toLocaleString()} XP</td></tr>
            <tr><td className="muted">Rating</td><td>{u.rating} (peak {u.peak_rating}) · {u.league}</td></tr>
            <tr><td className="muted">W / L / D</td><td>{u.wins} / {u.losses} / {u.draws} · {u.total_games} games</td></tr>
            <tr><td className="muted">Accuracy</td><td>{u.total_answered ? Math.round((u.total_correct / u.total_answered) * 100) : 0}% ({u.total_correct}/{u.total_answered})</td></tr>
            <tr><td className="muted">Coins</td><td>{Number(u.coins).toLocaleString()}</td></tr>
            <tr><td className="muted">Streak</td><td>{u.streak_days} days (best {u.best_streak_days})</td></tr>
          </tbody></table>
        </section>
      </div>
      {can('users.moderate') && (
        <section className="card mt">
          <h2>Moderation</h2>
          <div className="row mt">
            <button className="btn" onClick={() => setAction('warn')}><Icon name="alert" size={16} />Warn</button>
            {u.status !== 'suspended' && <button className="btn" onClick={() => setAction('suspend')}><Icon name="pause" size={16} />Suspend</button>}
            {u.status === 'suspended' && <button className="btn" onClick={() => setAction('unsuspend')}><Icon name="play" size={16} />Unsuspend</button>}
            {u.status !== 'banned' ? <button className="btn danger" onClick={() => setAction('ban')}><Icon name="ban" size={16} />Ban</button> : <button className="btn" onClick={() => setAction('unban')}>Unban</button>}
            {can('users.reset') && <>
              <span className="faint" aria-hidden>|</span>
              <button className="btn sm" onClick={() => setAction('reset_username')}>Reset username</button>
              <button className="btn sm" onClick={() => setAction('reset_avatar')}>Remove avatar</button>
              <button className="btn sm" onClick={() => setAction('reset_bio')}>Clear bio</button>
            </>}
          </div>
        </section>
      )}
      <div className="tabs mt" role="tablist">
        {(['matches', 'logins', 'moderation', 'reports'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div className="card mt table-wrap">
        {tab === 'matches' && (matches.isLoading ? <Loading /> : (
          <table><thead><tr><th>Date</th><th>Mode</th><th>Type</th><th>Players</th><th>Result</th><th>Score</th><th>Rating</th></tr></thead>
            <tbody>{matches.data?.items.map((m: any) => (
              <tr key={m.id}><td className="small">{fmtDate(m.createdAt)}</td><td>{m.mode}</td><td><span className="badge">{m.type}</span> {m.ranked && <span className="badge violet">ranked</span>}</td>
                <td className="small">{m.players.map((p: any) => p.name).join(' vs ')}</td><td>{m.result ?? '—'}</td><td>{m.score}</td>
                <td>{m.ratingBefore != null && m.ratingAfter != null ? <span className="inline-ic">{m.ratingBefore}<Icon name="arrow-right" size={12} label="to" />{m.ratingAfter}</span> : '—'}</td></tr>
            ))}</tbody></table>
        ))}
        {tab === 'logins' && (logins.isLoading ? <Loading /> : (
          <table><thead><tr><th>Date</th><th>Method</th><th>Result</th><th>IP</th><th>Device</th></tr></thead>
            <tbody>{logins.data?.items.map((l: any, i: number) => (
              <tr key={i}><td className="small">{fmtDate(l.createdAt)}</td><td>{l.method}</td><td>{l.success ? <span className="badge green">success</span> : <span className="badge red">{l.reason}</span>}</td><td><code>{l.ip}</code></td><td className="small faint" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.userAgent}</td></tr>
            ))}</tbody></table>
        ))}
        {tab === 'moderation' && (
          <table><thead><tr><th>Date</th><th>Action</th><th>Reason</th><th>Until</th><th>Admin</th></tr></thead>
            <tbody>{user.data.moderation.map((m: any) => <tr key={m.id}><td className="small">{fmtDate(m.createdAt)}</td><td>{m.action}</td><td>{m.reason}</td><td>{fmtDate(m.untilAt)}</td><td>{m.admin}</td></tr>)}</tbody></table>
        )}
        {tab === 'reports' && (
          <table><thead><tr><th>Date</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>{user.data.reports.map((r: any) => <tr key={r.id}><td className="small">{fmtDate(r.createdAt)}</td><td>{r.reason}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody></table>
        )}
      </div>
      <Modal open={!!action} onClose={() => setAction(null)} title={`${action?.replace('_', ' ')} — ${u.username ?? u.uid}`}>
        <form className="form" onSubmit={submit}>
          {action === 'suspend' && (
            <div className="field"><label htmlFor="h">Duration</label>
              <select id="h" name="hours" className="input" defaultValue="24"><option value="1">1 hour</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select>
            </div>
          )}
          <div className="field"><label htmlFor="r">Reason (shown to the player for warnings)</label><textarea id="r" name="reason" className="input" required minLength={3} maxLength={500} /></div>
          <button className={`btn ${action === 'ban' ? 'danger' : 'primary'}`}>Confirm {action?.replace('_', ' ')}</button>
        </form>
      </Modal>
    </>
  );
}
