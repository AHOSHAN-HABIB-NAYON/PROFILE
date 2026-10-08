import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, Skeleton } from '../components/Feedback';
import { useNotifications } from '../hooks/queries';
import { api } from '../lib/api';

const ICONS: Record<string, string> = { battle_request: '⚔️', friend_request: '👥', friend_accepted: '🤝', achievement: '🏅', rank: '🏆', streak: '🔥', streak_warning: '🔥', squad_invite: '🛡️', announcement: '📢', moderation: '⚠️' };

export default function Notifications() {
  const { data, isLoading } = useNotifications();
  const qc = useQueryClient();
  const nav = useNavigate();
  useEffect(() => {
    if (data?.unread) {
      const t = setTimeout(() => void api('/notifications/read', { body: { ids: 'all' } }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })), 1500);
      return () => clearTimeout(t);
    }
  }, [data?.unread, qc]);
  return (
    <div className="page stack">
      <PageHeader title="Notifications" back />
      {isLoading ? <Skeleton lines={6} /> : !data?.items.length ? <Empty icon="🔔" title="You're all caught up" body="Battle requests, friend activity and rewards show up here." /> : (
        <div className="card list">
          {data.items.map((n) => (
            <button key={n.id} className="list-row link" style={{ background: n.readAt ? undefined : 'var(--primary-soft)', border: 0, width: '100%', textAlign: 'left' }} onClick={() => n.data?.url && nav(String(n.data.url))}>
              <span style={{ fontSize: 24 }} aria-hidden>{ICONS[n.type] ?? '🔔'}</span>
              <div className="grow"><b className="small">{n.title}</b><p className="xs muted">{n.body}</p><p className="xs faint">{new Date(n.createdAt).toLocaleString()}</p></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
