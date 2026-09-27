import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { money, num } from '../../lib/format';
import { Tabs } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';
import { RANGES, type Range } from './Dashboard';

interface A {
  bestProducts: Array<{ product_id: number | null; name: string; qty: number; sales: number }>;
  mostViewed: Array<{ id: number; name: string; views: number }>;
  topCategories: Array<{ id: number; name: string; qty: number; sales: number }>;
  funnel: Record<string, number>;
  districts: Array<{ district: string; orders: number; sales: number }>;
  profit: { sales: number; cost: number; gross: number; itemsWithoutCost: number };
}

function Bars({ rows, value, label, fmt }: { rows: Array<Record<string, any>>; value: string; label: (r: any) => React.ReactNode; fmt: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value])));
  if (!rows.length) return <p className="text-[13px] text-muted">No data for this period.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="text-[13px]">
          <div className="mb-1 flex justify-between gap-3"><span className="truncate">{label(r)}</span><span className="shrink-0 font-bold tabular-nums">{fmt(Number(r[value]))}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-brand-400" style={{ width: `${(Number(r[value]) / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<Range>('30d');
  const { data: a } = useQuery({ queryKey: ['analytics', range], queryFn: () => api.get<A>(`/api/admin/dashboard/analytics?range=${range}`) });
  const steps: Array<[string, string]> = [['page_view', 'Visitors'], ['view_item', 'Viewed a product'], ['add_to_cart', 'Added to cart'], ['begin_checkout', 'Started checkout'], ['purchase', 'Ordered']];
  const top = Math.max(1, a?.funnel.page_view ?? 1);
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Sales, products, customers and the shopping funnel." />
      <Tabs value={range} onChange={setRange} tabs={RANGES} className="mb-4 -mx-1" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Conversion funnel">
          <ul className="space-y-3">
            {steps.map(([k, l]) => {
              const v = a?.funnel[k] ?? 0;
              return <li key={k} className="text-[13px]"><div className="mb-1 flex justify-between"><span>{l}</span><span className="font-bold tabular-nums">{num(v)} <span className="font-normal text-muted">({Math.round((v / top) * 100)}%)</span></span></div><div className="h-3 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(v / top) * 100}%` }} /></div></li>;
            })}
          </ul>
        </Panel>
        <Panel title="Gross profit (delivered orders)">
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-soft p-3"><dt className="text-[12px] text-muted">Sales</dt><dd className="text-[18px] font-extrabold">{money(a?.profit.sales)}</dd></div>
            <div className="rounded-2xl bg-soft p-3"><dt className="text-[12px] text-muted">Cost</dt><dd className="text-[18px] font-extrabold">{money(a?.profit.cost)}</dd></div>
            <div className="rounded-2xl bg-green-50 p-3"><dt className="text-[12px] text-green-800">Gross profit</dt><dd className="text-[18px] font-extrabold text-green-800">{money(a?.profit.gross)}</dd></div>
          </dl>
          {Boolean(a?.profit.itemsWithoutCost) && <p className="mt-3 text-[12px] text-amber-700">{a!.profit.itemsWithoutCost} sold items have no cost price — add cost prices to products for accurate profit.</p>}
        </Panel>
        <Panel title="Best selling products"><Bars rows={a?.bestProducts ?? []} value="qty" label={(r) => (r.product_id ? <Link to={`/admin/products/${r.product_id}`} className="hover:text-brand-600">{r.name}</Link> : r.name)} fmt={(v) => `${num(v)} sold`} /></Panel>
        <Panel title="Most viewed products"><Bars rows={a?.mostViewed ?? []} value="views" label={(r) => <Link to={`/admin/products/${r.id}`} className="hover:text-brand-600">{r.name}</Link>} fmt={(v) => `${num(v)} views`} /></Panel>
        <Panel title="Top categories"><Bars rows={a?.topCategories ?? []} value="sales" label={(r) => r.name} fmt={(v) => money(v)} /></Panel>
        <Panel title="Top districts"><Bars rows={a?.districts ?? []} value="orders" label={(r) => r.district} fmt={(v) => `${num(v)} orders`} /></Panel>
      </div>
    </div>
  );
}
