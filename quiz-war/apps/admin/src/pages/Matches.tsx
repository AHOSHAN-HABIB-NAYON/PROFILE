import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Loading, Modal, Pager, StatusBadge, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

function MatchDetail({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['match', id], queryFn: () => api(`/matches/${id}`) });
  if (isLoading) return <Loading />;
  const byPlayer = (mpId: number) => data.answers.filter((a: any) => a.matchPlayerId === mpId);
  return (
    <div className="form">
      <div className="row"><StatusBadge status={data.match.status} /><span className="badge">{data.match.mode}</span><span className="badge">{data.match.match_type}</span>{data.match.flagged ? <span className="badge red">flagged: {data.match.flag_reason}</span> : null}</div>
      <table><thead><tr><th>Player</th><th>Team</th><th>Score</th><th>Correct</th><th>Avg ms</th><th>Result</th><th>Rating</th><th>Disconnects</th></tr></thead>
        <tbody>{data.players.map((p: any) => (
          <tr key={p.id}><td>{p.user_id ? <Link to={`/users/${p.user_id}`}>{p.username ?? p.uid}</Link> : `🤖 ${p.bot_name}`}</td><td>{p.team}</td><td>{p.score}</td><td>{p.correct_count}/{p.answered_count}</td><td>{p.avg_response_ms ?? '—'}</td><td>{p.result ?? '—'}</td><td>{p.rating_before ?? '—'} → {p.rating_after ?? '—'}</td><td>{p.disconnects}</td></tr>
        ))}</tbody></table>
      {data.answers.length > 0 && (
        <details><summary className="small"><b>Answer timeline</b> (response times help investigate cheating)</summary>
          <table className="mt"><thead><tr><th>Player</th>{Array.from(new Set(data.answers.map((a: any) => a.q))).map((q: any) => <th key={q}>Q{q + 1}</th>)}</tr></thead>
            <tbody>{data.players.map((p: any) => (
              <tr key={p.id}><td className="small">{p.username ?? p.bot_name}</td>{byPlayer(p.id).map((a: any) => <td key={a.q} className="small" style={{ color: a.correct ? 'var(--success)' : 'var(--danger)' }}>{a.optionIndex == null ? '⌛' : `${a.correct ? '✓' : '✗'} ${a.ms}ms`}</td>)}</tr>
            ))}</tbody></table>
        </details>
      )}
      <details><summary className="small"><b>Events</b> ({data.events.length})</summary><pre className="json">{data.events.map((e: any) => `${fmtDate(e.createdAt)}  ${e.type}${e.userId ? ` user:${e.userId}` : ''} ${e.data ? JSON.stringify(e.data) : ''}`).join('\n')}</pre></details>
    </div>
  );
}

export default function Matches() {
  const { can } = useAdmin();
  const [tab, setTab] = useState<'live' | 'all' | 'flagged'>('live');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const live = useQuery({ queryKey: ['live'], queryFn: () => api('/matches/live'), refetchInterval: 3000, enabled: tab === 'live' });
  const past = useQuery({ queryKey: ['matches', tab, page], queryFn: () => api(`/matches?page=${page}&pageSize=25${tab === 'flagged' ? '&flagged=true' : ''}`), enabled: tab !== 'live' });
  return (
    <>
      <div className="head"><h1>Matches</h1>
        <div className="tabs">{(['live', 'all', 'flagged'] as const).map((t) => <button key={t} aria-selected={tab === t} onClick={() => (setTab(t), setPage(1))}>{t === 'live' ? `Live${live.data ? ` (${live.data.items.length})` : ''}` : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
      </div>
      <div className="card table-wrap">
        {tab === 'live' ? (live.isLoading ? <Loading /> : !live.data.items.length ? <p className="muted">No live matches right now.</p> : (
          <table><thead><tr><th>Match</th><th>Mode</th><th>State</th><th>Question</th><th>Duration</th><th>Players (connection · score)</th><th>Flags</th><th /></tr></thead>
            <tbody>{live.data.items.map((m: any) => (
              <tr key={m.id}>
                <td><code className="small">{m.id.slice(-8)}</code></td>
                <td>{m.mode} <span className="badge">{m.type}</span>{m.ranked && <span className="badge violet">ranked</span>}</td>
                <td><span className="badge blue">{m.state}</span></td>
                <td>{m.currentQuestion}/{m.questionCount ?? '∞'}</td>
                <td>{Math.floor(m.durationSec / 60)}m {m.durationSec % 60}s</td>
                <td className="small">{m.players.map((p: any) => <div key={p.userId}><span className={`dot ${p.connected ? 'on' : 'off'}`} /> T{p.team} {p.isBot ? '🤖 ' : ''}{p.username}{p.forfeited ? ' (left)' : ''} · {p.score}</div>)}</td>
                <td>{m.flags.map((f: string) => <span key={f} className="badge red">{f}</span>)}</td>
                <td>{can('matches.manage') && <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => confirm('Abort this match? No rewards will be given.') && void api(`/matches/${m.id}/abort`, { method: 'POST' }).then(() => live.refetch()).catch((e) => alert(errMsg(e)))}>Abort</button>}</td>
              </tr>
            ))}</tbody></table>
        )) : past.isLoading ? <Loading /> : (
          <>
            <table><thead><tr><th>Date</th><th>Mode</th><th>Type</th><th>Players</th><th>Category</th><th>Status</th><th>End</th><th>Flag</th></tr></thead>
              <tbody>{past.data.items.map((m: any) => (
                <tr key={m.id} className="click" onClick={() => setOpen(m.id)}>
                  <td className="small">{fmtDate(m.createdAt)}</td><td>{m.mode}</td><td><span className="badge">{m.type}</span>{m.ranked && <span className="badge violet">ranked</span>}</td>
                  <td className="small">{m.players}</td><td className="small">{m.category ?? 'Mixed'}</td><td><StatusBadge status={m.status} /></td><td className="small">{m.endReason}</td>
                  <td>{m.flagged && <span className="badge red">{m.flagReason}</span>}</td>
                </tr>
              ))}</tbody></table>
            <Pager page={page} setPage={setPage} hasMore={past.data.items.length === 25} />
          </>
        )}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={`Match ${open ?? ''}`} wide>{open && <MatchDetail id={open} />}</Modal>
    </>
  );
}
