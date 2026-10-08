import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Loading, Modal, Pager, StatusBadge, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

function ReportDetail({ id, onDone }: { id: number; onDone: () => void }) {
  const { can } = useAdmin();
  const { data, isLoading } = useQuery({ queryKey: ['report', id], queryFn: () => api(`/reports/${id}`) });
  const [action, setAction] = useState('dismiss');
  const [err, setErr] = useState<string | null>(null);
  if (isLoading) return <Loading />;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/reports/${id}/resolve`, { body: { action, note: f.get('note') ?? '', hours: f.get('hours') ? Number(f.get('hours')) : undefined } });
      onDone();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  const ev = data.evidence ?? {};
  return (
    <div className="form">
      <div className="row"><StatusBadge status={data.status} /><span className="badge amber">{data.reason}</span><span className="small faint">{fmtDate(data.created_at)}</span></div>
      {data.details && <p><b>Reporter says:</b> {data.details}</p>}
      <h3>Evidence (captured at report time)</h3>
      {ev.profile && (
        <div className="card row">
          {ev.profile.avatar_url && <img src={ev.profile.avatar_url} alt="Reported avatar" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />}
          <div><b>{ev.profile.username}</b> <code>{ev.profile.uid}</code><p className="small muted">{ev.profile.bio}</p>{data.target_user_id && <Link to={`/users/${data.target_user_id}`}>Open player →</Link>}</div>
        </div>
      )}
      {ev.match && <p className="small">Match <code>{ev.match.id}</code> · {ev.match.mode} · {ev.match.match_type} {ev.match.flagged ? <span className="badge red">auto-flagged: {ev.match.flag_reason}</span> : null}</p>}
      {data.status === 'open' || data.status === 'reviewing' ? (can('reports.handle') && (
        <form className="form" onSubmit={submit}>
          {err && <p className="err">{err}</p>}
          <h3>Action</h3>
          <div className="tabs">{['dismiss', 'warn', 'suspend', 'ban'].map((a) => <button type="button" key={a} aria-selected={action === a} onClick={() => setAction(a)} disabled={a !== 'dismiss' && !can('users.moderate')}>{a}</button>)}</div>
          {action === 'suspend' && <select name="hours" className="input" defaultValue="24" aria-label="Suspension length"><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select>}
          <textarea name="note" className="input" placeholder="Note / reason (shown to the player for warnings)" maxLength={500} aria-label="Note" />
          <button className={`btn ${action === 'ban' ? 'danger' : 'primary'}`}>Resolve: {action}</button>
        </form>
      )) : <p className="ok">Resolved: {data.action} {data.admin_note && `— ${data.admin_note}`}</p>}
    </div>
  );
}

export default function Reports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['reports', status, page], queryFn: () => api(`/reports?status=${status}&page=${page}&pageSize=25`) });
  return (
    <>
      <div className="head"><h1>Reports</h1><div className="tabs">{['open', 'reviewing', 'actioned', 'dismissed', 'all'].map((s) => <button key={s} aria-selected={status === s} onClick={() => (setStatus(s), setPage(1))}>{s}</button>)}</div></div>
      <div className="card table-wrap">
        {isLoading ? <Loading /> : !data.items.length ? <p className="muted">No reports here. 🎉</p> : (
          <table><thead><tr><th>Date</th><th>Reason</th><th>Reported player</th><th>Reports on player</th><th>Reporter</th><th>Match</th><th>Status</th></tr></thead>
            <tbody>{data.items.map((r: any) => (
              <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                <td className="small">{fmtDate(r.createdAt)}</td><td><span className="badge amber">{r.reason}</span></td><td>{r.target ?? '—'} <code className="small">{r.targetUid}</code></td>
                <td>{r.targetReportCount > 2 ? <span className="badge red">{r.targetReportCount}</span> : r.targetReportCount}</td><td className="small">{r.reporter}</td><td className="small">{r.matchId ? r.matchId.slice(-8) : '—'}</td><td><StatusBadge status={r.status} /></td>
              </tr>
            ))}</tbody></table>
        )}
        {data && <Pager page={page} setPage={setPage} hasMore={data.items.length === 25} />}
      </div>
      <Modal open={open !== null} onClose={() => setOpen(null)} title={`Report #${open}`} wide>{open && <ReportDetail id={open} onDone={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ['reports'] }); }} />}</Modal>
    </>
  );
}
