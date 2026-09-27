import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { cx, dateTime } from '../../lib/format';
import { Button } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface N { id: number; type: string; title: string; message: string | null; link: string | null; is_read: number; created_at: string }

export default function Notifications() {
  const { data, refetch } = useQuery({ queryKey: ['notifications-all'], queryFn: () => api.get<{ items: N[] }>('/api/admin/system/notifications?limit=100') });
  return (
    <div>
      <PageHeader title="Notifications" actions={<Button size="sm" variant="soft" onClick={async () => { await api.post('/api/admin/system/notifications/read', {}); void refetch(); }}>Mark all read</Button>} />
      <Panel pad={false}>
        <ul className="divide-y divide-line">
          {data?.items.map((n) => (
            <li key={n.id}><Link to={n.link ?? '#'} className={cx('block px-5 py-3 hover:bg-soft/60', !n.is_read && 'bg-brand-50/40')}><p className="font-semibold">{n.title}</p>{n.message && <p className="text-[13px] text-muted">{n.message}</p>}<p className="text-[11.5px] text-muted">{n.type} · {dateTime(n.created_at)}</p></Link></li>
          ))}
          {!data?.items.length && <li className="px-5 py-10 text-center text-muted">No notifications.</li>}
        </ul>
      </Panel>
      <Panel title="Which alerts to receive" className="mt-4"><SettingsForm groups={['notifications']} /></Panel>
    </div>
  );
}
