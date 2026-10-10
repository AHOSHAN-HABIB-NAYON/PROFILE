import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Loading, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';

type Msg = { id: number; body: string; createdAt: string; readAt: string | null; sender: { id: number; uid: string; username: string }; recipient: { id: number; uid: string; username: string } };

export default function Messages() {
  const [user, setUser] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState({ user: '', q: '' });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const list = useQuery({
    queryKey: ['messages', filter],
    queryFn: () => api<{ items: Msg[]; retentionDays: number; enabled: boolean }>(`/messages?user=${encodeURIComponent(filter.user)}&q=${encodeURIComponent(filter.q)}`),
  });
  const del = async (body: { ids?: number[]; fromUserId?: number }, what: string) => {
    if (!confirm(`Delete ${what}? This can’t be undone.`)) return;
    try {
      const r = await api<{ deleted: number }>('/messages/delete', { body });
      alert(`${r.deleted} message(s) deleted.`);
      setPicked(new Set());
      void list.refetch();
    } catch (e) {
      alert(errMsg(e));
    }
  };
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setEnabled = async (enabled: boolean) => {
    await api('/messages/enabled', { method: 'PUT', body: { enabled } }).catch((e) => alert(errMsg(e)));
    void list.refetch();
  };
  const items = list.data?.items ?? [];
  const onlyUser = filter.user && items[0] ? (items[0].sender.uid === filter.user.toUpperCase() ? items[0].sender : items[0].recipient.uid === filter.user.toUpperCase() ? items[0].recipient : null) : null;

  return (
    <>
      <div className="head"><h1>Player chat</h1></div>
      <div className="card row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <b>Player chat</b>
          <p className="small muted">Text and emoji messages between players. Every message is deleted automatically after {list.data?.retentionDays ?? 7} days.</p>
        </div>
        <label className="row" style={{ gap: 8, fontWeight: 700 }}>
          <input type="checkbox" checked={list.data?.enabled ?? true} onChange={(e) => void setEnabled(e.target.checked)} /> {(list.data?.enabled ?? true) ? 'On' : 'Off'}
        </label>
      </div>
      <form className="card form mt" onSubmit={(e) => (e.preventDefault(), setFilter({ user: user.trim(), q: q.trim() }))}>
        <div className="cols">
          <div className="field"><label htmlFor="mu">Player UID</label><input id="mu" className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="QW-XXXXXX" /></div>
          <div className="field"><label htmlFor="mq">Text contains</label><input id="mq" className="input" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="row">
          <button className="btn primary">Search</button>
          {picked.size > 0 && <button type="button" className="btn danger" onClick={() => void del({ ids: [...picked] }, `${picked.size} selected message(s)`)}>Delete selected ({picked.size})</button>}
          {onlyUser && <button type="button" className="btn danger" onClick={() => void del({ fromUserId: onlyUser.id }, `every message sent by ${onlyUser.username}`)}>Delete all sent by {onlyUser.username}</button>}
        </div>
      </form>
      <div className="card mt table-wrap">
        {list.isLoading ? <Loading /> : !items.length ? <p className="muted small">No messages.</p> : (
          <table>
            <thead><tr><th></th><th>When</th><th>From</th><th>To</th><th>Message</th><th></th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td><input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} aria-label="Select" /></td>
                  <td className="small">{fmtDate(m.createdAt)}</td>
                  <td><Link to={`/users/${m.sender.id}`}>{m.sender.username}</Link><div className="small faint">{m.sender.uid}</div></td>
                  <td><Link to={`/users/${m.recipient.id}`}>{m.recipient.username}</Link><div className="small faint">{m.recipient.uid}</div></td>
                  <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 360 }}>{m.body}</td>
                  <td><button className="btn sm danger" onClick={() => void del({ ids: [m.id] }, 'this message')}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
