'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { MarketDTO } from '@tradeteam/shared';
import { get } from '@/lib/api';
import { useMe, useWallets } from '@/lib/hooks';
import { seedTickers } from '@/lib/realtime';
import { fmtDateTime, fmtNum, fmtPct, fmtUsd, signClass } from '@/lib/format';
import { Card, Empty, SectionTitle, Skeleton, StatusBadge, cx } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';
import { CoinIcon } from '@/components/ui/coin';
import { LiveChange, LivePrice, useTicker } from '@/components/market/live';
import { PerformanceChart } from '@/components/market/performance-chart';

interface Portfolio {
  totalValue: string;
  pnlToday: string | null;
  pnlTodayPct: string | null;
  pnl24h: string;
  pnl24hPct: string;
  totalPnl: string;
  unrealizedPnl: string;
  realizedPnl: string;
  allocation: { asset: string; value: string; pct: string }[];
}

const ACTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: '/wallet/deposit', label: 'Deposit', icon: 'deposit' },
  { href: '/wallet/withdraw', label: 'Withdraw', icon: 'withdraw' },
  { href: '/wallet/transfer', label: 'Transfer', icon: 'transfer' },
  { href: '/trade', label: 'Trade', icon: 'chart' },
];

const ALLOC_COLORS = ['#4f46e5', '#22c58b', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#94a3b8'];

function MarketRow({ m }: { m: MarketDTO }) {
  useTicker(m.symbol, m.ticker);
  return (
    <Link
      href={`/trade/${m.symbol}`}
      className="flex items-center gap-3 py-2.5 hover:bg-card-2 -mx-2 px-2 rounded-xl"
    >
      <CoinIcon symbol={m.base} url={m.logoUrl} size={30} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">
          {m.base}/{m.quote}
        </div>
        <div className="text-[11px] text-muted truncate">{m.baseName ?? m.base}</div>
      </div>
      <div className="text-right text-sm font-semibold">
        <LivePrice symbol={m.symbol} fallback={m.ticker?.c} />
      </div>
      <div className="w-[76px] text-right text-[13px]">
        <LiveChange symbol={m.symbol} fallback={m.ticker?.p} />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const me = useMe().data;
  const wallets = useWallets();
  const pf = useQuery({ queryKey: ['portfolio'], queryFn: () => get<Portfolio>('/portfolio') });
  const movers = useQuery({
    queryKey: ['movers', 'dash'],
    queryFn: async () => {
      const r = await get<{ gainers: MarketDTO[]; losers: MarketDTO[]; volume: MarketDTO[] }>(
        '/markets/movers',
        { limit: 5 },
      );
      seedTickers([...r.gainers, ...r.losers, ...r.volume].map((m) => m.ticker).filter(Boolean) as never);
      return r;
    },
  });
  const favs = useQuery({
    queryKey: ['markets', 'favorites', 'dash'],
    queryFn: () => get<{ items: MarketDTO[] }>('/markets', { category: 'favorites', pageSize: 6 }),
  });
  const trades = useQuery({
    queryKey: ['my-trades', 'dash'],
    queryFn: () =>
      get<{
        items: { id: string; symbol: string; side: string; price: string; qty: string; createdAt: string }[];
      }>('/trades', { pageSize: 5 }),
  });
  const txs = useQuery({
    queryKey: ['transactions', 'dash'],
    queryFn: () =>
      get<{
        items: {
          id: string;
          type: string;
          asset: string;
          amount: string;
          status: string;
          createdAt: string;
        }[];
      }>('/transactions', { pageSize: 5 }),
  });

  const p = pf.data;
  const w = wallets.data;
  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="lg:hidden text-[15px] text-muted">
        Hello, <span className="text-fg font-semibold">{me?.name}</span>
      </div>
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="lg:col-span-2 relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted">Total balance</p>
              {pf.isLoading ? (
                <Skeleton className="h-10 w-48 mt-1" />
              ) : (
                <p className="text-[34px] font-extrabold tracking-tight num mt-0.5">
                  {fmtUsd(p?.totalValue)}
                </p>
              )}
              <p className={cx('text-sm font-semibold num', signClass(p?.pnl24h))}>
                {p ? `${fmtUsd(p.pnl24h)} (${fmtPct(p.pnl24hPct)})` : '—'}{' '}
                <span className="text-muted font-normal">24h</span>
              </p>
            </div>
          </div>
          <div className="mt-2 -mx-2">
            <PerformanceChart />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 text-[13px]">
            <div>
              <p className="text-muted">Available</p>
              <p className="font-semibold num">{fmtUsd(w?.availableValue)}</p>
            </div>
            <div>
              <p className="text-muted">In orders</p>
              <p className="font-semibold num">{fmtUsd(w?.lockedValue)}</p>
            </div>
            <div>
              <p className="text-muted">Today&apos;s P&amp;L</p>
              <p className={cx('font-semibold num', signClass(p?.pnlToday))}>
                {p?.pnlToday ? fmtUsd(p.pnlToday) : '—'}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle>Quick actions</SectionTitle>
          <div className="grid grid-cols-4 lg:grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col lg:flex-row items-center gap-1.5 lg:gap-3 p-2 lg:p-3 rounded-xl hover:bg-card-2 text-center lg:text-left"
              >
                <span className="w-11 h-11 rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
                  <Icon name={a.icon} size={20} />
                </span>
                <span className="text-[12px] lg:text-sm font-semibold">{a.label}</span>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Link
              href="/trade?side=buy"
              className="h-10 rounded-xl bg-up text-white font-semibold text-sm flex items-center justify-center"
            >
              Quick buy
            </Link>
            <Link
              href="/trade?side=sell"
              className="h-10 rounded-xl bg-down text-white font-semibold text-sm flex items-center justify-center"
            >
              Quick sell
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-[13px]">
            <div>
              <p className="text-muted">Unrealized P&amp;L</p>
              <p className={cx('font-semibold num', signClass(p?.unrealizedPnl))}>
                {fmtUsd(p?.unrealizedPnl)}
              </p>
            </div>
            <div>
              <p className="text-muted">Total P&amp;L</p>
              <p className={cx('font-semibold num', signClass(p?.totalPnl))}>{fmtUsd(p?.totalPnl)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        <Card>
          <SectionTitle
            action={
              <Link href="/portfolio" className="text-[13px] text-accent font-semibold">
                Details
              </Link>
            }
          >
            Asset allocation
          </SectionTitle>
          {!p?.allocation.length ? (
            <Empty icon="portfolio" title="No assets yet" description="Deposit funds to start trading." />
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-4">
                {p.allocation.slice(0, 6).map((a, i) => (
                  <span key={a.asset} style={{ width: `${a.pct}%`, background: ALLOC_COLORS[i] }} />
                ))}
              </div>
              {p.allocation.slice(0, 6).map((a, i) => (
                <div key={a.asset} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ALLOC_COLORS[i] }} />
                  <span className="font-semibold flex-1">{a.asset}</span>
                  <span className="text-muted num">{fmtUsd(a.value)}</span>
                  <span className="w-14 text-right num">{a.pct}%</span>
                </div>
              ))}
            </>
          )}
        </Card>
        <Card>
          <SectionTitle
            action={
              <Link href="/markets" className="text-[13px] text-accent font-semibold">
                See all
              </Link>
            }
          >
            Market overview
          </SectionTitle>
          {movers.isLoading ? (
            <Skeleton className="h-48" />
          ) : movers.data?.volume.length ? (
            movers.data.volume.map((m) => <MarketRow key={m.symbol} m={m} />)
          ) : (
            <Empty icon="markets" title="No market data yet" />
          )}
        </Card>
        <Card>
          <SectionTitle
            action={
              <Link href="/markets" className="text-[13px] text-accent font-semibold">
                Manage
              </Link>
            }
          >
            Favorites
          </SectionTitle>
          {favs.isLoading ? (
            <Skeleton className="h-48" />
          ) : favs.data?.items.length ? (
            favs.data.items.map((m) => <MarketRow key={m.symbol} m={m} />)
          ) : (
            <Empty icon="star" title="No favorites" description="Star markets to pin them here." />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
        <Card>
          <SectionTitle>Top gainers</SectionTitle>
          {movers.data?.gainers.map((m) => <MarketRow key={m.symbol} m={m} />) ?? (
            <Skeleton className="h-40" />
          )}
        </Card>
        <Card>
          <SectionTitle>Top losers</SectionTitle>
          {movers.data?.losers.map((m) => <MarketRow key={m.symbol} m={m} />) ?? (
            <Skeleton className="h-40" />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
        <Card>
          <SectionTitle
            action={
              <Link href="/trades" className="text-[13px] text-accent font-semibold">
                History
              </Link>
            }
          >
            Recent trades
          </SectionTitle>
          {!trades.data?.items.length ? (
            <Empty icon="chart" title="No trades yet" />
          ) : (
            trades.data.items.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 text-sm border-b border-line last:border-0"
              >
                <div>
                  <span className={cx('font-semibold', t.side === 'buy' ? 'text-up' : 'text-down')}>
                    {t.side.toUpperCase()}
                  </span>{' '}
                  <span className="font-semibold">{t.symbol}</span>
                  <div className="text-[12px] text-muted">{fmtDateTime(t.createdAt)}</div>
                </div>
                <div className="text-right num">
                  <div>{fmtNum(t.qty, 8)}</div>
                  <div className="text-[12px] text-muted">@ {fmtNum(t.price, 8)}</div>
                </div>
              </div>
            ))
          )}
        </Card>
        <Card>
          <SectionTitle
            action={
              <Link href="/transactions" className="text-[13px] text-accent font-semibold">
                All
              </Link>
            }
          >
            Recent transactions
          </SectionTitle>
          {!txs.data?.items.length ? (
            <Empty icon="history" title="No transactions yet" />
          ) : (
            txs.data.items.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 text-sm border-b border-line last:border-0"
              >
                <div>
                  <span className="font-semibold capitalize">{t.type.replace('_', ' ')}</span>{' '}
                  <span className="text-muted">{t.asset}</span>
                  <div className="text-[12px] text-muted">{fmtDateTime(t.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="num font-semibold">{fmtNum(t.amount, 8)}</div>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
