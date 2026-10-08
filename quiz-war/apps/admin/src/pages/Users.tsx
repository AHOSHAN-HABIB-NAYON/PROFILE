import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Loading, Pager, StatusBadge, fmtDate } from '../components/ui';
import { api } from '../lib/api';

export default function Users() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['users', q, status, page], queryFn: () => api(`/users?q=${encodeURIComponent(q)}&status=${status}&page=${page}&pageSize=25`) });
  return (
    <>
      <div className="head"><h1>Players</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="UID, username or exact email" aria-label="Search players" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        <select className="input" style={{ maxWidth: 180 }} aria-label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
          <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option><option value="deleted">Deleted</option>
        </select>
      </div>
      <div className="card table-wrap">
        {isLoading ? <Loading /> : (
          <table>
            <thead><tr><th>Player</th><th>UID</th><th>Status</th><th>Level</th><th>Rating</th><th>Games</th><th>Coins</th><th>Login</th><th>Joined</th><th>Last login</th></tr></thead>
            <tbody>
              {data.items.map((u: any) => (
                <tr key={u.id} className="click" onClick={() => nav(`/users/${u.id}`)}>
                  <td><span className={`dot ${u.online ? 'on' : 'off'}`} /> <b>{u.username ?? '—'}</b></td>
                  <td><code>{u.uid}</code></td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{u.level}</td><td>{u.rating}</td><td>{u.games}</td><td>{Number(u.coins).toLocaleString()}</td>
                  <td className="small">{[u.hasEmail && 'Email', u.hasGoogle && 'Google'].filter(Boolean).join(', ') || '—'}</td>
                  <td className="small">{fmtDate(u.createdAt)}</td><td className="small">{fmtDate(u.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && <Pager page={page} setPage={setPage} hasMore={page * 25 < data.total} total={data.total} pageSize={25} />}
      </div>
    </>
  );
}
