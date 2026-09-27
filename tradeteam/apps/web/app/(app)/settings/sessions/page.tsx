'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, del, errorMessage } from '@/lib/api';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, Button, Card, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';
import { toast } from '@/components/ui/toast';

interface S {
  id: string;
  ip: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  method: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
interface Dev {
  id: number;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  lastIp: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export default function SessionsPage() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['sessions'], queryFn: () => get<{ items: S[] }>('/account/sessions') });
  const d = useQuery({ queryKey: ['devices'], queryFn: () => get<{ items: Dev[] }>('/account/devices') });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/account/sessions/${id}`),
    onSuccess: () => (toast('Session signed out'), qc.invalidateQueries({ queryKey: ['sessions'] })),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  const others = useMutation({
    mutationFn: () => post<{ revoked: number }>('/account/sessions/revoke-others'),
    onSuccess: (r) => (
      toast(`${r.revoked} sessions signed out`),
      qc.invalidateQueries({ queryKey: ['sessions'] })
    ),
  });
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader
        title="Sessions & devices"
        back="/settings/security"
        actions={
          <Button size="sm" variant="danger" loading={others.isPending} onClick={() => others.mutate()}>
            Sign out others
          </Button>
        }
      />
      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionTitle>Active sessions</SectionTitle>
        </div>
        {s.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {s.data?.items.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="w-10 h-10 rounded-xl bg-card-2 flex items-center justify-center text-fg-2">
                  <Icon name="devices" size={19} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {[x.browser, x.os].filter(Boolean).join(' on ') || 'Unknown device'}{' '}
                    {x.current && <Badge tone="up">This device</Badge>}
                  </p>
                  <p className="text-[12px] text-muted truncate">
                    {x.ip} · via {x.method} · active {timeAgo(x.lastSeenAt)} · since{' '}
                    {fmtDateTime(x.createdAt)}
                  </p>
                </div>
                {!x.current && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={revoke.isPending && revoke.variables === x.id}
                    onClick={() => revoke.mutate(x.id)}
                  >
                    Sign out
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionTitle>Known devices</SectionTitle>
        </div>
        <div className="divide-y divide-line">
          {d.data?.items.map((x) => (
            <div key={x.id} className="px-4 py-3 text-sm flex justify-between gap-3">
              <span className="font-medium">
                {[x.browser, x.os].filter(Boolean).join(' · ') || 'Unknown'}{' '}
                <span className="text-muted text-[12px] capitalize">{x.deviceType}</span>
              </span>
              <span className="text-[12px] text-muted text-right num">
                {x.lastIp}
                <br />
                last seen {fmtDateTime(x.lastSeenAt)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
