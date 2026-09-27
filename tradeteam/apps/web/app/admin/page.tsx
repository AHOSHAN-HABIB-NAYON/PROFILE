'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { fmtCompact, fmtNum } from '@/lib/format';
import { AdminTitle } from '@/components/admin/admin-shell';
import { Card, SectionTitle, Skeleton, cx } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';

interface Dash {
  users: { total: number; active24h: number; new24h: number; new7d: number };
  deposits: { asset: string; amount: string; count: number }[];
  withdrawals: { asset: string; amount: string; count: number }[];
  pendingReview: { deposits: number; withdrawals: number };
  volume24h: { quote: string; volume: string; trades: number }[];
  openOrders: number;
  completedTrades: number;
  feeRevenue: { asset: string; amount: string }[];
  signups: { date: string; count: number }[];
  health: Record<string, { ok?: boolean; latencyMs?: number } & Record<string, unknown>>;
}

function Kpi({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
          <Icon name={icon} size={19} />
        </span>
        <span className="text-[13px] text-muted">{label}</span>
      </div>
      <p className="text-[28px] font-extrabold num mt-3">{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Health({ name, h }: { name: string; h?: { ok?: boolean; latencyMs?: number; detail?: unknown } }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm border-b border-line last:border-0">
      <span className="flex items-center gap-2">
        <span className={cx('w-2.5 h-2.5 rounded-full', h?.ok ? 'bg-up' : 'bg-down')} />
        {name}
      </span>
      <span className="text-muted num text-[12px]">
        {h?.ok
          ? h.latencyMs !== undefined
            ? `${h.latencyMs} ms`
            : 'OK'
          : String(h?.detail ?? 'unavailable')}
      </span>
    </div>
  );
}

export default function AdminDashboard() {
  const q = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => get<Dash>('/admin/dashboard'),
    refetchInterval: 30_000,
  });
  const d = q.data;
  if (!d) return <Skeleton className="h-[60vh]" />;
  const maxSign = Math.max(1, ...d.signups.map((s) => s.count));
  return (
    <div className="space-y-5">
      <AdminTitle title="Dashboard" subtitle="Platform overview, refreshed every 30 seconds." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon="users"
          label="Total users"
          value={fmtCompact(d.users.total)}
          sub={`${d.users.new24h} new today · ${d.users.new7d} this week`}
          href="/admin/users"
        />
        <Kpi icon="health" label="Active users (24h)" value={fmtCompact(d.users.active24h)} />
        <Kpi
          icon="orders"
          label="Open orders"
          value={fmtCompact(d.openOrders)}
          sub={`${fmtCompact(d.completedTrades)} completed trades`}
          href="/admin/orders"
        />
        <Kpi
          icon="alert"
          label="Pending review"
          value={d.pendingReview.deposits + d.pendingReview.withdrawals}
          sub={`${d.pendingReview.withdrawals} withdrawals · ${d.pendingReview.deposits} deposits`}
          href="/admin/withdrawals"
        />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <SectionTitle>Trading volume (24h)</SectionTitle>
          {d.volume24h.length ? (
            d.volume24h.map((v) => (
              <div key={v.quote} className="flex justify-between py-1.5 text-sm">
                <span className="font-semibold">{v.quote}</span>
                <span className="num">
                  {fmtNum(v.volume, 2)} · {v.trades} trades
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No trades in the last 24h.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>Fee revenue (all time)</SectionTitle>
          {d.feeRevenue.length ? (
            d.feeRevenue.map((f) => (
              <div key={f.asset} className="flex justify-between py-1.5 text-sm">
                <span className="font-semibold">{f.asset}</span>
                <span className="num">{fmtNum(f.amount, 8)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">No fees collected yet.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>System health</SectionTitle>
          <Health name="Database" h={d.health.database} />
          <Health name="Redis" h={d.health.redis} />
          <Health name="WebSocket gateway" h={d.health.websocket} />
          <Health name="Market data provider" h={d.health.marketData} />
          <Health name="Matching engine" h={d.health.engine} />
          <Link href="/admin/system" className="text-[13px] text-accent font-semibold block mt-2">
            Details
          </Link>
        </Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <SectionTitle>Deposits (credited)</SectionTitle>
          {d.deposits.length ? (
            d.deposits.map((x) => (
              <div key={x.asset} className="flex justify-between py-1.5 text-sm">
                <span className="font-semibold">{x.asset}</span>
                <span className="num">
                  {fmtNum(x.amount, 8)} ({x.count})
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">None yet.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>Withdrawals (completed)</SectionTitle>
          {d.withdrawals.length ? (
            d.withdrawals.map((x) => (
              <div key={x.asset} className="flex justify-between py-1.5 text-sm">
                <span className="font-semibold">{x.asset}</span>
                <span className="num">
                  {fmtNum(x.amount, 8)} ({x.count})
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">None yet.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>New users (30 days)</SectionTitle>
          <div className="flex items-end gap-1 h-32">
            {d.signups.map((s) => (
              <div
                key={s.date}
                title={`${s.date}: ${s.count}`}
                className="flex-1 bg-accent/70 rounded-t"
                style={{ height: `${(s.count / maxSign) * 100}%` }}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
