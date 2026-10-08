import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Loading, Pager, fmtDate } from '../components/ui';
import { api } from '../lib/api';

export default function Audit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['audit', action, page], queryFn: () => api(`/audit?page=${page}&pageSize=40${action ? `&action=${encodeURIComponent(action)}` : ''}`) });
  return (
    <>
      <div className="head"><h1>Audit log</h1>
        <select className="input" style={{ maxWidth: 220 }} aria-label="Filter action" value={action} onChange={(e) => (setAction(e.target.value), setPage(1))}>
          <option value="">All actions</option>{['user.', 'question.', 'category.', 'report.', 'settings.', 'match.', 'admin.', 'role.', 'announcement.', 'season.', 'achievement.', 'shop.', 'auth.'].map((a) => <option key={a} value={a}>{a.replace('.', '')}</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        {isLoading ? <Loading rows={10} /> : (
          <table><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Summary</th><th>IP</th></tr></thead>
            <tbody>{data.items.map((l: any) => (
              <Fragment key={l.id}>
                <tr className="click" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td className="small">{fmtDate(l.createdAt)}</td><td>{l.admin ?? '—'}</td><td><code>{l.action}</code></td><td className="small">{l.targetType ? `${l.targetType} ${l.targetId ?? ''}` : '—'}</td><td className="small">{l.summary}</td><td className="small faint">{l.ip}</td>
                </tr>
                {open === l.id && (l.before || l.after) && (
                  <tr><td colSpan={6}><div className="grid two"><div><b className="small">Before</b><pre className="json">{JSON.stringify(l.before, null, 2)}</pre></div><div><b className="small">After</b><pre className="json">{JSON.stringify(l.after, null, 2)}</pre></div></div></td></tr>
                )}
              </Fragment>
            ))}</tbody></table>
        )}
        {data && <Pager page={page} setPage={setPage} hasMore={data.items.length === 40} />}
      </div>
    </>
  );
}
