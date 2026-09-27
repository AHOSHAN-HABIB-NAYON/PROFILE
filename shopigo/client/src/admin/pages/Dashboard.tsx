import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Ban, CircleCheck, PackageX, RotateCcw, Shield, ShoppingBag, Truck, TriangleAlert, Users, Wallet, Clock, BadgeDollarSign, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime, money, num } from '../../lib/format';
import { Tabs } from '../../components/ui';
import { PageHeader, Panel, RiskBadge, StatCard, STATUS_LABELS, StatusBadge, useMe } from '../components/kit';

export type Range = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'year';
export const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' },
];

interface Dash {
  kpis: { orders: number; sales: number; revenue: number; netRevenue: number; cancelled: number; delivered: number; returned: number; pending: number; customers: number; highRisk: number; aov: number };
  change: { orders: number; sales: number; revenue: number; aov: number };
  series: Array<{ bucket: string; orders: number; sales: number }>;
  statuses: Record<string, number>;
  lowStock: number; outOfStock: number; fraudAlerts: number; newCustomers: number;
  couriers: Array<{ name: string; orders: number }>;
  recent: Array<{ id: number; order_no: string; customer_name: string; total: number; status: string; risk_level: string; created_at: string; district: string }>;
  bucket: 'hour' | 'day' | 'month';
}

const INK = '#8c7c70';
const GRID = '#efe4da';
const BRAND = '#f26b3a';

export function ChartTooltip({ active, payload, label, money: isMoney }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-[12px] text-white shadow-xl">
      <p className="text-white/70">{label}</p>
      <p className="text-[14px] font-bold tabular-nums">{isMoney ? money(payload[0]!.value) : num(payload[0]!.value)}</p>
    </div>
  );
}

function fmtBucket(b: string, bucket: Dash['bucket']) {
  if (bucket === 'hour') return b;
  if (bucket === 'month') return new Date(`${b}-01`).toLocaleDateString('en-GB', { month: 'short' });
  return new Date(b).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>('today');
  const me = useMe();
  const navigate = useNavigate();
  const { data: d, isLoading } = useQuery({ queryKey: ['dashboard', range], queryFn: () => api.get<Dash>(`/api/admin/dashboard?range=${range}`), refetchInterval: 60_000 });
  const series = (d?.series ?? []).map((s) => ({ ...s, label: fmtBucket(s.bucket, d!.bucket) }));
  return (
    <div>
      <PageHeader title={`Hi, ${me.data?.admin?.name.split(' ')[0] ?? ''} 👋`} subtitle="Here's what's happening in your store." />
      <Tabs value={range} onChange={setRange} tabs={RANGES} className="mb-4 -mx-1" />

      {d && (d.lowStock > 0 || d.outOfStock > 0 || d.fraudAlerts > 0) && (
        <div className="mb-4 grid gap-2 md:grid-cols-2">
          {(d.lowStock > 0 || d.outOfStock > 0) && (
            <Link to="/admin/products?stock=low" className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert className="size-5 shrink-0" />
              <span className="flex-1 font-semibold">{d.lowStock} product{d.lowStock === 1 ? ' is' : 's are'} running low{d.outOfStock ? ` · ${d.outOfStock} out of stock` : ''}.</span>
              <span className="flex items-center gap-1 font-bold">View Low Stock <ArrowRight className="size-4" /></span>
            </Link>
          )}
          {d.fraudAlerts > 0 && (
            <Link to="/admin/fraud" className="flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-[13.5px] text-red-900 ring-1 ring-red-200">
              <Shield className="size-5 shrink-0" /><span className="flex-1 font-semibold">{d.fraudAlerts} fraud alert{d.fraudAlerts === 1 ? '' : 's'} in this period</span><ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={isLoading ? '…' : num(d?.kpis.orders)} icon={<ShoppingBag className="size-5" />} change={d?.change.orders} hint={d ? `${d.kpis.pending} awaiting confirmation` : undefined} to="/admin/orders" />
        <StatCard label="Sales" value={isLoading ? '…' : money(d?.kpis.sales)} icon={<BadgeDollarSign className="size-5" />} tone="violet" change={d?.change.sales} hint="Excl. cancelled & returned" />
        <StatCard label="Revenue (delivered)" value={isLoading ? '…' : money(d?.kpis.revenue)} icon={<Wallet className="size-5" />} tone="green" change={d?.change.revenue} hint={d ? `Net of delivery ${money(d.kpis.netRevenue)}` : undefined} />
        <StatCard label="Avg. order value" value={isLoading ? '…' : money(d?.kpis.aov)} icon={<Clock className="size-5" />} tone="blue" change={d?.change.aov} />
        <StatCard label="Delivered" value={num(d?.kpis.delivered)} icon={<CircleCheck className="size-5" />} tone="green" />
        <StatCard label="Cancelled" value={num(d?.kpis.cancelled)} icon={<Ban className="size-5" />} tone="red" />
        <StatCard label="Returned" value={num(d?.kpis.returned)} icon={<RotateCcw className="size-5" />} tone="amber" />
        <StatCard label="Customers" value={num(d?.kpis.customers)} icon={<Users className="size-5" />} tone="blue" hint={d ? `${d.newCustomers} new` : undefined} to="/admin/customers" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Sales">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={BRAND} stopOpacity={0.28} /><stop offset="1" stopColor={BRAND} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip content={<ChartTooltip money />} cursor={{ stroke: INK, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="sales" stroke={BRAND} strokeWidth={2} fill="url(#salesFill)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Orders">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f6ece3' }} />
                <Bar dataKey="orders" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent orders" actions={<Link to="/admin/orders" className="text-[13px] font-semibold text-brand-600">View all</Link>} pad={false}>
          <ul className="divide-y divide-line">
            {d?.recent.map((o) => (
              <li key={o.id} onClick={() => navigate(`/admin/orders/${o.id}`)} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-soft/60">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">#{o.order_no} · {o.customer_name}</p>
                  <p className="text-[12px] text-muted">{dateTime(o.created_at)} · {o.district}</p>
                </div>
                {o.risk_level !== 'LOW' && <RiskBadge level={o.risk_level} />}
                <StatusBadge status={o.status} />
                <span className="w-24 text-right text-[13.5px] font-bold tabular-nums">{money(o.total)}</span>
              </li>
            ))}
            {!d?.recent.length && <li className="px-5 py-10 text-center text-[13px] text-muted">No orders yet.</li>}
          </ul>
        </Panel>
        <div className="space-y-4">
          <Panel title="Order status">
            <ul className="space-y-2">
              {Object.keys(STATUS_LABELS).map((k) => {
                const n = d?.statuses[k] ?? 0;
                const total = Math.max(1, d?.kpis.orders ?? 1);
                return (
                  <li key={k} className="flex items-center gap-3 text-[13px]">
                    <span className="w-28 shrink-0"><StatusBadge status={k} /></span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-soft"><span className="block h-full rounded-full bg-brand-400" style={{ width: `${(n / total) * 100}%` }} /></span>
                    <span className="w-8 text-right font-bold tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Courier" actions={<Link to="/admin/couriers" className="text-[13px] font-semibold text-brand-600">Report</Link>}>
            {d?.couriers.length ? d.couriers.map((c) => <div key={c.name} className="flex justify-between py-1 text-[13.5px]"><span className="flex items-center gap-2"><Truck className="size-4 text-muted" />{c.name}</span><span className="font-bold">{c.orders}</span></div>) : <p className="text-[13px] text-muted">No parcels sent in this period.</p>}
            {d && d.outOfStock > 0 && <p className="mt-3 flex items-center gap-2 text-[12.5px] text-danger"><PackageX className="size-4" />{d.outOfStock} active products are out of stock</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
