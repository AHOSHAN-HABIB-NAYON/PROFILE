'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { MarketDTO } from '@tradeteam/shared';
import { Brand } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/app-shell';
import { Button, Skeleton } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';
import { CoinIcon } from '@/components/ui/coin';
import { LiveChange, LivePrice, useTicker } from '@/components/market/live';
import { get } from '@/lib/api';
import { seedTickers } from '@/lib/realtime';
import { useConfig, useMe, useSetting } from '@/lib/hooks';

function MoverRow({ m }: { m: MarketDTO }) {
  useTicker(m.symbol, m.ticker);
  return (
    <Link
      href={`/trade/${m.symbol}`}
      className="flex items-center gap-3 py-3 px-1 hover:bg-card-2 rounded-xl"
    >
      <CoinIcon symbol={m.base} url={m.logoUrl} size={32} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">
          {m.base}
          <span className="text-muted font-normal text-sm">/{m.quote}</span>
        </div>
        <div className="text-[12px] text-muted truncate">{m.baseName ?? m.base}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold">
          <LivePrice symbol={m.symbol} fallback={m.ticker?.c} />
        </div>
        <div className="text-[12px]">
          <LiveChange symbol={m.symbol} fallback={m.ticker?.p} />
        </div>
      </div>
    </Link>
  );
}

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'health',
    title: 'Real-time everything',
    body: 'Live prices, order books, trades and candles streamed over a single multiplexed WebSocket.',
  },
  {
    icon: 'markets',
    title: 'Every market',
    body: 'All pairs from the connected market provider, synced automatically as coins list and delist.',
  },
  {
    icon: 'shield',
    title: 'Security first',
    body: 'Passkeys, authenticator 2FA, device management and step-up verification for withdrawals.',
  },
  {
    icon: 'layers',
    title: 'Precise by design',
    body: 'Server-side decimal math, atomic settlement and an immutable ledger behind every balance.',
  },
];

export default function Landing() {
  const siteName = useSetting('site.name', 'TradeTeam');
  const tagline = useSetting('site.tagline', 'Trade Together • Grow Together');
  const cfg = useConfig();
  const me = useMe().data;
  const movers = useQuery({
    queryKey: ['movers'],
    enabled: cfg.data?.installed === true,
    queryFn: async () => {
      const r = await get<{ volume: MarketDTO[]; gainers: MarketDTO[] }>('/markets/movers', { limit: 6 });
      seedTickers([...r.volume, ...r.gainers].map((m) => m.ticker).filter(Boolean) as never);
      return r;
    },
  });
  return (
    <div className="min-h-dvh pt-safe">
      <header className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Brand name={siteName} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {me ? (
            <Link href="/dashboard">
              <Button size="sm">Open app</Button>
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block">
                <Button size="sm" variant="ghost">
                  Log in
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </header>
      <section className="max-w-6xl mx-auto px-5 pt-8 sm:pt-16 pb-12 grid lg:grid-cols-2 gap-10 items-center">
        <div className="page-enter">
          <p className="text-accent font-semibold text-sm mb-3">{tagline}</p>
          <h1 className="text-[40px] sm:text-[56px] leading-[1.05] font-extrabold tracking-tight">
            Smarter trading.
            <br />
            <span className="bg-gradient-to-r from-up to-accent bg-clip-text text-transparent">
              Bigger opportunities.
            </span>
          </h1>
          <p className="text-muted text-lg mt-5 max-w-lg">
            Your team&apos;s private trading platform for crypto and more — live markets, a professional
            terminal and bank-grade account security.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Link href={me ? '/dashboard' : '/register'}>
              <Button size="lg" className="w-full sm:w-auto px-8">
                Get started
              </Button>
            </Link>
            <Link href="/markets">
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                Explore markets
              </Button>
            </Link>
          </div>
          <div className="flex gap-5 mt-8 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <Icon name="lock" size={15} /> Secure
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="health" size={15} /> Fast
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="users" size={15} /> Team focused
            </span>
          </div>
        </div>
        <div className="bg-card border border-line shadow-card rounded-3xl p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Top markets by volume</h2>
            <Link href="/markets" className="text-sm text-accent font-semibold">
              See all
            </Link>
          </div>
          {movers.isLoading || !cfg.data ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : movers.data?.volume.length ? (
            movers.data.volume.map((m) => <MoverRow key={m.symbol} m={m} />)
          ) : (
            <p className="text-sm text-muted py-8 text-center">
              Markets will appear here as soon as the market-data provider is connected.
            </p>
          )}
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-5 pb-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-card border border-line rounded-2xl p-5 shadow-card">
            <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center mb-3">
              <Icon name={f.icon} />
            </div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-muted mt-1">{f.body}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-line py-6 text-center text-[13px] text-muted">
        © {new Date().getFullYear()} {siteName}. Trading digital assets involves risk.
      </footer>
    </div>
  );
}
