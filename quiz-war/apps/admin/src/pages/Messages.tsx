import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Loading, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';

type Retention = { days: number; text: boolean; voice: boolean; images: boolean };
type Msg = { id: number; body: string; kind?: string; media?: { url: string | null; secs: number }; createdAt: string; readAt: string | null; sender: { id: number; uid: string; username: string }; recipient: { id: number; uid: string; username: string } };

export default function Messages() {
  const [user, setUser] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState({ user: '', q: '' });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const list = useQuery({
    queryKey: ['messages', filter],
    queryFn: () => api<{ items: Msg[]; retentionDays: number; retention?: Retention; voice?: boolean; images?: boolean; enabled: boolean }>(`/messages?user=${encodeURIComponent(filter.user)}&q=${encodeURIComponent(filter.q)}`),
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
          <p className="small muted">Text, emoji and voice messages between players. Cleanup runs every hour using the settings below.</p>
        </div>
        <label className="row" style={{ gap: 8, fontWeight: 700 }}>
          <input type="checkbox" checked={list.data?.enabled ?? true} onChange={(e) => void setEnabled(e.target.checked)} /> {(list.data?.enabled ?? true) ? 'On' : 'Off'}
        </label>
      </div>
      {list.data && <RetentionCard key={JSON.stringify(list.data.retention)} r={list.data.retention ?? { days: 7, text: true, voice: true, images: true }} voice={list.data.voice ?? true} images={list.data.images ?? true} onSaved={() => void list.refetch()} />}
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
                  <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 360 }}>{m.kind === 'voice' ? (m.media?.url ? <audio controls preload="none" src={m.media.url} style={{ height: 32, maxWidth: 260 }} /> : <i className="faint">Voice message (expired)</i>) : m.kind === 'image' ? (m.media?.url ? <a href={m.media.url} target="_blank" rel="noreferrer"><img src={m.media.url} alt="" style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8 }} /></a> : <i className="faint">Photo (expired)</i>) : m.body}</td>
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

/** Admin: keep chat for N days; choose what the cleanup deletes; voice messages on/off. */
function RetentionCard({ r, voice, images, onSaved }: { r: Retention; voice: boolean; images: boolean; onSaved: () => void }) {
  const [v, setV] = useState({ ...r, voiceEnabled: voice, imagesEnabled: images });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api('/messages/retention', { method: 'PUT', body: v });
      setMsg('Saved.');
      onSaved();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card form mt">
      <b>Auto-delete and voice messages</b>
      <p className="small muted">Keeps Hostinger light: old messages and voice files are removed for good. Voice messages are recorded small on the phone (about 15–20 KB per 10 seconds, max 2 minutes).</p>
      <div className="cols">
        <div className="field">
          <label htmlFor="rt-days">Delete after</label>
          <select id="rt-days" className="input" value={v.days} onChange={(e) => setV({ ...v, days: Number(e.target.value) })}>
            {[3, 7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <div className="field">
          <span className="small bold">What gets deleted</span>
          <label className="row"><input type="checkbox" checked={v.text} onChange={(e) => setV({ ...v, text: e.target.checked })} /> Text messages</label>
          <label className="row"><input type="checkbox" checked={v.voice} onChange={(e) => setV({ ...v, voice: e.target.checked })} /> Voice messages (audio files)</label>
          <label className="row"><input type="checkbox" checked={v.images} onChange={(e) => setV({ ...v, images: e.target.checked })} /> Photos</label>
        </div>
      </div>
      <label className="row"><input type="checkbox" checked={v.voiceEnabled} onChange={(e) => setV({ ...v, voiceEnabled: e.target.checked })} /> Allow voice messages in chat</label>
      <label className="row"><input type="checkbox" checked={v.imagesEnabled} onChange={(e) => setV({ ...v, imagesEnabled: e.target.checked })} /> Allow photos in chat (compressed to about 10% of the original; no videos)</label>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => void save()}>Save</button>
        {msg && <span className="small">{msg}</span>}
      </div>
    </div>
  );
}
