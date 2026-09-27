'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Button, Card, Empty, Skeleton, cx } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';

interface N {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
const ICON: Record<string, IconName> = {
  login: 'lock',
  new_device: 'devices',
  password_changed: 'key',
  passkey_added: 'key',
  passkey_removed: 'key',
  '2fa_enabled': 'shield',
  '2fa_disabled': 'shield',
  security_alert: 'alert',
  deposit_received: 'deposit',
  withdrawal_requested: 'withdraw',
  withdrawal_completed: 'withdraw',
  withdrawal_rejected: 'withdraw',
  order_filled: 'check',
  order_partial: 'orders',
  order_cancelled: 'close',
  transfer: 'transfer',
  announcement: 'megaphone',
  welcome: 'star',
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      get<{ items: N[]; unread: number }>('/account/notifications', {
        limit: 30,
        before: pageParam || undefined,
      }),
    getNextPageParam: (last) =>
      last.items.length === 30 ? Number(last.items[last.items.length - 1]!.id) : undefined,
  });
  const readAll = useMutation({
    mutationFn: () => post('/account/notifications/read', { all: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => post('/account/notifications/read', { ids: [Number(id)] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          <Button size="sm" variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>
            Mark all read
          </Button>
        }
      />
      <Card padded={false}>
        {q.isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !items.length ? (
          <Empty icon="bell" title="You're all caught up" />
        ) : (
          <div className="divide-y divide-line">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.readAt && readOne.mutate(n.id)}
                className={cx('w-full text-left flex gap-3 px-4 py-3.5', !n.readAt && 'bg-accent-soft/40')}
              >
                <span
                  className={cx(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    n.type.includes('security') || n.type.includes('device')
                      ? 'bg-warn-soft text-warn'
                      : 'bg-accent-soft text-accent',
                  )}
                >
                  <Icon name={ICON[n.type] ?? 'bell'} size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{n.title}</span>
                    {!n.readAt && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className="block text-[13px] text-muted mt-0.5">{n.body}</span>
                  <span className="block text-[11px] text-faint mt-1">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {q.hasNextPage && (
          <div className="p-3 border-t border-line">
            <Button block variant="ghost" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
