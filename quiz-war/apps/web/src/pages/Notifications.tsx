import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Empty, ListSkeleton } from '../components/Feedback';
import { Icon, IconTile, notificationIcon } from '../components/Icon';
import { PullToRefresh } from '../components/PullToRefresh';
import { useNotifications } from '../hooks/queries';
import { api } from '../lib/api';
import { useLang, useT } from '../lib/i18n';

function ago(iso: string, lang: 'bn' | 'en') {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'bn' ? 'bn-BD' : 'en', { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

export default function Notifications() {
  const t = useT();
  const lang = useLang();
  const { data, isLoading, refetch } = useNotifications();
  const qc = useQueryClient();
  const nav = useNavigate();
  useEffect(() => {
    if (!data?.unread) return;
    const id = setTimeout(() => void api('/notifications/read', { body: { ids: 'all' } }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })), 1500);
    return () => clearTimeout(id);
  }, [data?.unread, qc]);
  return (
    <PullToRefresh onRefresh={() => refetch()}>
      <div className="page stack">
        <PageHeader title={t('Notifications', 'নোটিফিকেশন')} back />
        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : !data?.items.length ? (
          <Empty icon="bell" anim="ring" title={t('You’re all caught up', 'নতুন কিছু নেই')} body={t('Battle requests, friend activity and rewards show up here.', 'ব্যাটল চ্যালেঞ্জ, বন্ধুদের খবর আর রিওয়ার্ড এখানে দেখাবে।')} />
        ) : (
          <div className="notif-list stagger">
            {data.items.map((n) => {
              const ic = notificationIcon(n.type);
              return (
                <button key={n.id} className={`notif ${n.readAt ? '' : 'unread'}`} onClick={() => n.data?.url && nav(String(n.data.url))}>
                  <IconTile name={ic.icon} tone={ic.tone} size={44} />
                  <div className="grow">
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                    <small>{ago(n.createdAt, lang)}</small>
                  </div>
                  {!!n.data?.url && <Icon name="chevron" size={18} className="faint" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
