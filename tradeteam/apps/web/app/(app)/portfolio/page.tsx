'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { fmtNum, fmtPct, fmtUsd, signClass } from '@/lib/format';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, Empty, SectionTitle, Skeleton, Tabs, cx } from '@/components/ui/primitives';
import { CoinIcon } from '@/components/ui/coin';
import { DataTable } from '@/components/ui/table';
import { PerformanceChart } from '@/components/market/performance-chart';

interface Holding {
  asset: string;
  name: string | null;
  logoUrl: string | null;
  quantity: string;
  price: string | null;
  value: string | null;
  avgEntry: string | null;
  unrealizedPnl: string | null;
  unrealizedPnlPct: string | null;
  realizedPnl: string;
  change24h: string | null;
}
interface Portfolio {
  currency: string;
  totalValue: string;
  pnlToday: string | null;
  pnlTodayPct: string | null;
  pnl24h: string;
  pnl24hPct: string;
  unrealizedPnl: string;
  realizedPnl: string;
  totalPnl: string;
  holdings: Holding[];
  allocation: { asset: string; value: string; pct: string }[];
}
const COLORS = ['#4f46e5', '#22c58b', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#94a3b8', '#f97316'];

function Donut({ items }: { items: { asset: string; pct: string }[] }) {
  let acc = 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="w-40 h-40 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--card-2)" strokeWidth="12" />
      {items.slice(0, 8).map((a, i) => {
        const len = (Number(a.pct) / 100) * c;
        const el = (
          <circle
            key={a.asset}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={COLORS[i]}
            strokeWidth="12"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-acc}
          />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}

export default function PortfolioPage() {
  const [range, setRange] = useState<'1d' | '7d' | '30d' | '90d' | '1y'>('30d');
  const q = useQuery({ queryKey: ['portfolio'], queryFn: () => get<Portfolio>('/portfolio') });
  const p = q.data;
  const stat = (label: string, v: string | null | undefined, pct?: string | null) => (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cx('font-bold num text-[17px]', signClass(v))}>{v ? fmtUsd(v) : '—'}</p>
      {pct !== undefined && <p className={cx('text-[12px] num', signClass(pct))}>{fmtPct(pct)}</p>}
    </div>
  );
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Portfolio" />
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[13px] text-muted">Portfolio value</p>
              {q.isLoading ? (
                <Skeleton className="h-10 w-44" />
              ) : (
                <p className="text-[32px] font-extrabold num">{fmtUsd(p?.totalValue)}</p>
              )}
            </div>
            <Tabs
              size="sm"
              value={range}
              onChange={setRange}
              items={(['1d', '7d', '30d', '90d', '1y'] as const).map((v) => ({
                value: v,
                label: v.toUpperCase(),
              }))}
            />
          </div>
          <div className="-mx-2 mt-2">
            <PerformanceChart range={range} height={200} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            {stat("Today's P&L", p?.pnlToday, p?.pnlTodayPct)}
            {stat('24h P&L', p?.pnl24h, p?.pnl24hPct)}
            {stat('Unrealized P&L', p?.unrealizedPnl)}
            {stat('Realized P&L', p?.realizedPnl)}
          </div>
        </Card>
        <Card>
          <SectionTitle>Allocation</SectionTitle>
          {!p?.allocation.length ? (
            <Empty
              icon="portfolio"
              title="No holdings"
              action={
                <Link href="/wallet/deposit" className="text-accent font-semibold text-sm">
                  Deposit funds
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Donut items={p.allocation} />
              <div className="w-full">
                {p.allocation.slice(0, 8).map((a, i) => (
                  <div key={a.asset} className="flex items-center gap-2 py-1 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="flex-1 font-semibold">{a.asset}</span>
                    <span className="num">{a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionTitle>Holdings</SectionTitle>
        </div>
        <DataTable
          rows={p?.holdings}
          loading={q.isLoading}
          rowKey={(h) => h.asset}
          mobileTitle={(h) => (
            <span className="flex items-center gap-2">
              <CoinIcon symbol={h.asset} url={h.logoUrl} size={22} />
              {h.asset}
            </span>
          )}
          empty={<Empty icon="wallet" title="No holdings yet" />}
          columns={[
            {
              key: 'asset',
              header: 'Asset',
              hideOnMobile: true,
              render: (h) => (
                <span className="flex items-center gap-2.5">
                  <CoinIcon symbol={h.asset} url={h.logoUrl} size={26} />
                  <span>
                    <span className="font-semibold">{h.asset}</span>
                    <span className="block text-[11px] text-muted">{h.name}</span>
                  </span>
                </span>
              ),
            },
            { key: 'qty', header: 'Holdings', align: 'right', render: (h) => fmtNum(h.quantity, 8) },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (h) => (h.price ? fmtNum(h.price, 8) : '—'),
            },
            { key: 'value', header: 'Value', align: 'right', render: (h) => fmtUsd(h.value) },
            {
              key: 'avg',
              header: 'Avg entry',
              align: 'right',
              render: (h) => (h.avgEntry ? fmtNum(h.avgEntry, 8) : '—'),
            },
            {
              key: 'upnl',
              header: 'Unrealized',
              align: 'right',
              render: (h) => (
                <span className={signClass(h.unrealizedPnl)}>
                  {h.unrealizedPnl ? `${fmtUsd(h.unrealizedPnl)} (${fmtPct(h.unrealizedPnlPct)})` : '—'}
                </span>
              ),
            },
            {
              key: 'rpnl',
              header: 'Realized',
              align: 'right',
              render: (h) => <span className={signClass(h.realizedPnl)}>{fmtUsd(h.realizedPnl)}</span>,
            },
            {
              key: 'ch',
              header: '24h',
              align: 'right',
              render: (h) => <span className={signClass(h.change24h)}>{fmtPct(h.change24h)}</span>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
