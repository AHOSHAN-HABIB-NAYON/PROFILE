'use client';
import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MarketDTO } from '@tradeteam/shared';
import { get, post, del } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { seedTickers } from '@/lib/realtime';
import { fmtCompact, fmtPct, fmtPrice, signClass } from '@/lib/format';
import { CandleChart } from '@/components/market/candle-chart';
import { OrderBook } from '@/components/market/order-book';
import { RecentTrades } from '@/components/market/recent-trades';
import { OrderForm } from '@/components/market/order-form';
import { MarketOrders } from '@/components/market/open-orders';
import { MarketList } from '@/components/market/market-list';
import { LivePrice, useTicker } from '@/components/market/live';
import { CoinIcon } from '@/components/ui/coin';
import { Icon } from '@/components/ui/icons';
import { Sheet } from '@/components/ui/sheet';
import { ErrorBox, Skeleton, Tabs, cx, InfoBox } from '@/components/ui/primitives';

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[13px] font-semibold num truncate">{value}</div>
    </div>
  );
}

function Terminal({ symbol }: { symbol: string }) {
  const me = useMe().data;
  const authed = Boolean(me);
  const qc = useQueryClient();
  const initialSide = useSearchParams().get('side') === 'sell' ? 'sell' : 'buy';
  const [picker, setPicker] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trades'>('chart');
  const [sheetSide, setSheetSide] = useState<'buy' | 'sell' | null>(null);
  const q = useQuery({
    queryKey: ['market', symbol],
    queryFn: async () => {
      const r = await get<{ market: MarketDTO }>(`/markets/${symbol}`);
      if (r.market.ticker) seedTickers([r.market.ticker]);
      return r.market;
    },
  });
  const m = q.data;
  const t = useTicker(symbol, m?.ticker);
  useEffect(() => {
    try {
      localStorage.setItem('tt-last-market', symbol);
    } catch {
      /* ignore */
    }
    document.title = `${symbol} · Trade`;
  }, [symbol]);
  const fav = useMutation({
    mutationFn: () =>
      m?.favorite ? del(`/markets/${symbol}/favorite`) : post(`/markets/${symbol}/favorite`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['market', symbol] }),
  });

  if (q.isError) return <ErrorBox message="This market is not available." onRetry={() => q.refetch()} />;
  if (!m) return <Skeleton className="h-[70vh]" />;

  const header = (
    <div className="bg-card rounded-2xl border border-line shadow-card px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <button onClick={() => setPicker(true)} className="flex items-center gap-2.5 min-w-0">
        <CoinIcon symbol={m.base} url={m.logoUrl} size={34} />
        <div className="text-left">
          <div className="font-bold text-[17px] flex items-center gap-1">
            {m.base}/{m.quote} <Icon name="chevronDown" size={16} className="text-muted" />
          </div>
          <div className="text-[12px] text-muted">{m.baseName ?? m.base}</div>
        </div>
      </button>
      {authed && (
        <button
          onClick={() => fav.mutate()}
          className={cx(m.favorite ? 'text-warn' : 'text-faint')}
          aria-label="Favorite"
        >
          <Icon name="star" size={20} fill={m.favorite ? 'currentColor' : 'none'} />
        </button>
      )}
      <div>
        <div className={cx('text-[24px] font-extrabold leading-none', signClass(t?.p))}>
          <LivePrice symbol={symbol} fallback={t?.c} precision={m.pricePrecision} />
        </div>
        <div className={cx('text-[13px] font-semibold num mt-1', signClass(t?.p))}>
          {fmtPct(t?.p)} <span className="text-muted font-normal">24h</span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:flex gap-x-6 gap-y-1 w-full sm:w-auto">
        <Stat label="24h High" value={fmtPrice(t?.h, m.pricePrecision)} />
        <Stat label="24h Low" value={fmtPrice(t?.l, m.pricePrecision)} />
        <Stat label={`24h Vol (${m.base})`} value={fmtCompact(t?.v)} />
        <Stat label={`24h Vol (${m.quote})`} value={fmtCompact(t?.q)} className="hidden sm:block" />
        <Stat
          label="Fees (maker/taker)"
          value={`${(Number(m.makerFee) * 100).toFixed(2)}% / ${(Number(m.takerFee) * 100).toFixed(2)}%`}
          className="hidden md:block"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-3 lg:space-y-4 -mx-1 sm:mx-0">
      {header}
      {m.status !== 'trading' && (
        <InfoBox tone="warn">
          Trading on this market is currently {m.status}. You can view data but new orders are not accepted.
        </InfoBox>
      )}

      {/* Desktop trading workspace */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_300px_320px] gap-4">
        <CandleChart symbol={symbol} pricePrecision={m.pricePrecision} height={520} />
        <OrderBook
          symbol={symbol}
          pricePrecision={m.pricePrecision}
          qtyPrecision={m.qtyPrecision}
          tickSize={m.tickSize}
          depth={12}
          quote={m.quote}
          base={m.base}
        />
        <div className="space-y-4">
          <OrderForm market={m} authed={authed} initialSide={initialSide} />
          <RecentTrades
            symbol={symbol}
            pricePrecision={m.pricePrecision}
            qtyPrecision={m.qtyPrecision}
            rows={14}
          />
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-3">
        <Tabs
          value={mobileTab}
          onChange={setMobileTab}
          items={[
            { value: 'chart', label: 'Chart' },
            { value: 'book', label: 'Order book' },
            { value: 'trades', label: 'Trades' },
          ]}
        />
        {mobileTab === 'chart' && (
          <CandleChart symbol={symbol} pricePrecision={m.pricePrecision} height={380} />
        )}
        {mobileTab === 'book' && (
          <OrderBook
            symbol={symbol}
            pricePrecision={m.pricePrecision}
            qtyPrecision={m.qtyPrecision}
            tickSize={m.tickSize}
            depth={10}
            quote={m.quote}
            base={m.base}
          />
        )}
        {mobileTab === 'trades' && (
          <RecentTrades
            symbol={symbol}
            pricePrecision={m.pricePrecision}
            qtyPrecision={m.qtyPrecision}
            rows={24}
          />
        )}
      </div>

      {authed && <MarketOrders symbol={symbol} />}

      {/* Sticky mobile trade controls */}
      <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom))] z-30 px-4 pb-2 pt-2 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSheetSide('buy')}
            className="h-12 rounded-2xl bg-up text-white font-bold shadow-pop"
          >
            Buy
          </button>
          <button
            onClick={() => setSheetSide('sell')}
            className="h-12 rounded-2xl bg-down text-white font-bold shadow-pop"
          >
            Sell
          </button>
        </div>
      </div>
      <Sheet
        open={sheetSide !== null}
        onClose={() => setSheetSide(null)}
        title={`${sheetSide === 'sell' ? 'Sell' : 'Buy'} ${m.base}`}
      >
        {sheetSide && <OrderForm market={m} authed={authed} initialSide={sheetSide} compact />}
      </Sheet>
      <Sheet open={picker} onClose={() => setPicker(false)} title="Select market" size="lg">
        <MarketList authed={authed} compact />
      </Sheet>
    </div>
  );
}

export default function TradePage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  return (
    <Suspense>
      <Terminal symbol={symbol.toUpperCase()} />
    </Suspense>
  );
}
