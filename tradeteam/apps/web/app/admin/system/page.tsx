'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { fmtCompact, fmtDateTime, fmtNum } from '@/lib/format';
import { AdminTitle } from '@/components/admin/admin-shell';
import { Card, Row, SectionTitle, Skeleton, cx } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';

type H = Record<string, unknown> & {
  database?: { ok: boolean; latencyMs?: number };
  redis?: { ok: boolean; latencyMs?: number };
  marketData?: Record<string, unknown>;
  websocket?: Record<string, unknown>;
  engine?: Record<string, unknown>;
  queues?: Record<string, Record<string, number> | null>;
  markets?: { count: number; tickers: number; loadedAt: number };
  services?: { exchange: boolean; smtp: boolean };
  memory?: { rss: number; heapUsed: number };
  version?: string;
  uptimeSec?: number;
};

const Dot = ({ ok }: { ok: unknown }) => (
  <span className={cx('inline-block w-2.5 h-2.5 rounded-full mr-2', ok ? 'bg-up' : 'bg-down')} />
);

export default function AdminSystem() {
  const q = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => get<H>('/admin/system/health'),
    refetchInterval: 5000,
  });
  const rec = useQuery({
    queryKey: ['admin', 'exchange-balances'],
    queryFn: () =>
      get<{
        error: string | null;
        rows: { asset: string; internal: string; exchange: string | null; difference: string | null }[];
      }>('/admin/system/exchange-balances'),
  });
  const h = q.data;
  if (!h) return <Skeleton className="h-96" />;
  const md = h.marketData ?? {};
  return (
    <div className="space-y-4">
      <AdminTitle
        title="System health"
        subtitle={`Version ${h.version} · up ${Math.round((h.uptimeSec ?? 0) / 60)} min · refreshed every 5s`}
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <SectionTitle>Database</SectionTitle>
          <p>
            <Dot ok={h.database?.ok} />
            {h.database?.ok ? `${h.database.latencyMs} ms` : 'down'}
          </p>
        </Card>
        <Card>
          <SectionTitle>Redis</SectionTitle>
          <p>
            <Dot ok={h.redis?.ok} />
            {h.redis?.ok ? `${h.redis.latencyMs} ms` : 'down'}
          </p>
        </Card>
        <Card>
          <SectionTitle>WebSocket gateway</SectionTitle>
          <Row label="Connections" value={String(h.websocket?.connections ?? 0)} />
          <Row label="Active channels" value={String(h.websocket?.channels ?? 0)} />
          <Row label="Messages delivered" value={fmtCompact(Number(h.websocket?.messagesOut ?? 0))} />
        </Card>
        <Card>
          <SectionTitle>Market data ({String(md.provider ?? '—')})</SectionTitle>
          <p className="mb-2">
            <Dot ok={md.ok} />
            {md.ok ? 'connected' : String(md.detail ?? 'disconnected')}
          </p>
          <Row label="Upstream connections" value={String(md.connections ?? 0)} />
          <Row label="Upstream streams" value={String(md.upstream ?? md.streams ?? 0)} />
          <Row label="Watched channels" value={String(md.channels ?? 0)} />
          <Row label="Last message" value={md.lastMessageAt ? fmtDateTime(Number(md.lastMessageAt)) : '—'} />
          <Row label="Leader instance" value={String(md.leader ?? '—')} />
        </Card>
        <Card>
          <SectionTitle>Matching engine</SectionTitle>
          <p className="mb-2">
            <Dot ok={h.engine?.ok} />
            {h.engine?.ok ? 'running in this process' : String(h.engine?.detail ?? 'stopped')}
          </p>
          <Row label="Internal markets" value={String(h.engine?.markets ?? 0)} />
          <Row label="Resting orders" value={String(h.engine?.resting ?? 0)} />
        </Card>
        <Card>
          <SectionTitle>Markets & services</SectionTitle>
          <Row label="Markets loaded" value={fmtNum(String(h.markets?.count ?? 0), 0)} />
          <Row label="Live tickers" value={fmtNum(String(h.markets?.tickers ?? 0), 0)} />
          <Row label="Exchange API" value={h.services?.exchange ? 'configured' : 'not configured'} />
          <Row label="SMTP" value={h.services?.smtp ? 'configured' : 'not configured'} />
          <Row
            label="Memory (RSS / heap)"
            value={`${Math.round((h.memory?.rss ?? 0) / 1e6)} / ${Math.round((h.memory?.heapUsed ?? 0) / 1e6)} MB`}
          />
        </Card>
      </div>
      <Card>
        <SectionTitle>Background queues</SectionTitle>
        {Object.entries(h.queues ?? {}).map(([k, v]) => (
          <Row
            key={k}
            label={k}
            value={
              v
                ? `waiting ${v.waiting} · active ${v.active} · failed ${v.failed} · delayed ${v.delayed}`
                : 'unavailable'
            }
          />
        ))}
      </Card>
      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionTitle>Exchange balance reconciliation</SectionTitle>
        </div>
        {rec.data?.error && (
          <p className="px-4 text-[13px] text-muted">Exchange balances unavailable: {rec.data.error}</p>
        )}
        <DataTable
          rows={rec.data?.rows}
          loading={rec.isLoading}
          rowKey={(r) => r.asset}
          columns={[
            { key: 'a', header: 'Asset', render: (r) => r.asset },
            {
              key: 'i',
              header: 'Users (internal ledger)',
              align: 'right',
              render: (r) => fmtNum(r.internal, 8),
            },
            {
              key: 'e',
              header: 'Exchange account',
              align: 'right',
              render: (r) => (r.exchange ? fmtNum(r.exchange, 8) : '—'),
            },
            {
              key: 'd',
              header: 'Difference',
              align: 'right',
              render: (r) => (
                <span className={Number(r.difference ?? 0) < 0 ? 'text-down font-semibold' : ''}>
                  {r.difference ? fmtNum(r.difference, 8) : '—'}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
