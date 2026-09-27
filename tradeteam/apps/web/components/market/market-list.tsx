'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketDTO } from '@tradeteam/shared';
import { get, post, del } from '@/lib/api';
import { seedTickers } from '@/lib/realtime';
import { fmtCompact } from '@/lib/format';
import { CoinIcon } from '@/components/ui/coin';
import { Icon } from '@/components/ui/icons';
import { Empty, ErrorBox, Pills, Skeleton, cx } from '@/components/ui/primitives';
import { LiveChange, LivePrice, useTicker } from './live';

interface Page {
  items: MarketDTO[];
  total: number;
  page: number;
  pageSize: number;
  quotes: { quote: string; count: number }[];
}

type Sort = 'volume' | 'change' | 'price' | 'marketcap' | 'name';

const Row = memo(function Row({
  m,
  onOpen,
  onFav,
  authed,
}: {
  m: MarketDTO;
  onOpen: (s: string) => void;
  onFav: (m: MarketDTO) => void;
  authed: boolean;
}) {
  const t = useTicker(m.symbol, m.ticker); // subscribes only while this row is rendered (visible)
  return (
    <div
      className="flex items-center gap-3 h-[64px] px-3 sm:px-4 hover:bg-card-2 cursor-pointer active:bg-card-2"
      onClick={() => onOpen(m.symbol)}
    >
      {authed && (
        <button
          className={cx('shrink-0', m.favorite ? 'text-warn' : 'text-faint hover:text-muted')}
          onClick={(e) => {
            e.stopPropagation();
            onFav(m);
          }}
          aria-label={m.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Icon name="star" size={17} fill={m.favorite ? 'currentColor' : 'none'} />
        </button>
      )}
      <CoinIcon symbol={m.base} url={m.logoUrl} size={34} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[15px] truncate">
          {m.base}
          <span className="text-muted font-normal text-[13px]">/{m.quote}</span>
        </div>
        <div className="text-[12px] text-muted truncate">
          {m.baseName ?? m.base} · Vol {fmtCompact(t?.q)}
          {m.status === 'halted' && <span className="text-warn ml-1">· halted</span>}
        </div>
      </div>
      <div className="hidden md:block w-28 text-right text-[13px] text-muted num">
        {fmtCompact(t?.h)} / {fmtCompact(t?.l)}
      </div>
      <div className="hidden sm:block w-28 text-right text-[13px] text-muted num">
        {m.marketCap ? `$${fmtCompact(m.marketCap)}` : '—'}
      </div>
      <div className="w-28 text-right font-semibold text-[15px]">
        <LivePrice symbol={m.symbol} fallback={t?.c} />
      </div>
      <div className="w-[82px] text-right">
        <LiveChange symbol={m.symbol} fallback={t?.p} pill />
      </div>
    </div>
  );
});

/**
 * Complete dynamic market list: server-side category/search/sort + infinite pagination, rendered
 * with a virtualised list so thousands of pairs never freeze the browser. Only the rows actually
 * on screen hold live WebSocket subscriptions.
 */
export function MarketList({
  authed,
  initialCategory = 'USDT',
  compact,
}: {
  authed: boolean;
  initialCategory?: string;
  compact?: boolean;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<Sort>('volume');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const key = ['markets', category, debounced, sort, dir];
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await get<Page>('/markets', {
        category,
        q: debounced,
        sort,
        dir,
        page: pageParam,
        pageSize: 60,
      });
      seedTickers(r.items.map((m) => m.ticker).filter(Boolean) as never);
      return r;
    },
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    staleTime: 10_000,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const quotes = query.data?.pages[0]?.quotes ?? [];

  const fav = useMutation({
    mutationFn: (m: MarketDTO) =>
      m.favorite ? del(`/markets/${m.symbol}/favorite`) : post(`/markets/${m.symbol}/favorite`),
    onMutate: (m) => {
      qc.setQueriesData<{ pages: Page[] }>({ queryKey: ['markets'] }, (d) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p) => ({
                ...p,
                items: p.items.map((x) => (x.symbol === m.symbol ? { ...x, favorite: !m.favorite } : x)),
              })),
            }
          : d,
      );
    },
    onSettled: () => category === 'favorites' && qc.invalidateQueries({ queryKey: ['markets', 'favorites'] }),
  });

  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 64,
    overscan: 6,
  });
  const items = v.getVirtualItems();
  useEffect(() => {
    const last = items[items.length - 1];
    if (last && last.index >= rows.length - 10 && query.hasNextPage && !query.isFetchingNextPage)
      query.fetchNextPage();
  }, [items, rows.length, query]);

  const cats = [
    ...(authed
      ? [
          {
            value: 'favorites',
            label: (
              <span className="inline-flex items-center gap-1">
                <Icon name="star" size={13} />
                Favorites
              </span>
            ),
          },
        ]
      : []),
    { value: 'all', label: 'All' },
    ...['USDT', 'USDC', 'BTC', 'ETH', 'FDUSD', 'BNB', 'EUR', 'TRY']
      .filter((c) => !quotes.length || quotes.some((x) => x.quote === c))
      .map((c) => ({ value: c, label: c })),
    { value: 'spot', label: 'Spot' },
  ];

  const header = (label: string, s: Sort, cls: string) => (
    <button
      className={cx('flex items-center gap-1 justify-end', cls, sort === s && 'text-fg')}
      onClick={() => {
        if (sort === s) setDir(dir === 'desc' ? 'asc' : 'desc');
        else {
          setSort(s);
          setDir(s === 'name' ? 'asc' : 'desc');
        }
      }}
    >
      {label}
      {sort === s && <Icon name="chevronDown" size={12} className={dir === 'asc' ? 'rotate-180' : ''} />}
    </button>
  );

  return (
    <div className="flex flex-col min-h-0">
      <div className="space-y-3 mb-3">
        <div className="flex items-center gap-2 h-11 px-3.5 rounded-xl bg-card border border-line">
          <Icon name="search" size={18} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coin, pair or name…"
            className="flex-1 bg-transparent outline-none text-[15px]"
            aria-label="Search markets"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-muted" aria-label="Clear search">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <Pills value={category} onChange={setCategory} items={cats} />
      </div>
      <div className="bg-card rounded-2xl border border-line shadow-card overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-3 sm:px-4 h-10 text-[12px] font-medium text-muted border-b border-line">
          <div className="flex-1">{header('Name', 'name', 'justify-start')}</div>
          <div className="hidden md:block w-28 text-right">24h High / Low</div>
          {header('Mkt cap', 'marketcap', 'hidden sm:flex w-28')}
          {header('Price', 'price', 'w-28')}
          {header('24h', 'change', 'w-[82px]')}
        </div>
        {query.isError ? (
          <div className="p-4">
            <ErrorBox message="Could not load markets." onRetry={() => query.refetch()} />
          </div>
        ) : query.isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty
            icon="search"
            title={category === 'favorites' ? 'No favorites yet' : 'No markets found'}
            description={
              category === 'favorites'
                ? 'Tap the star next to any market to add it here.'
                : 'Try another name, symbol or pair.'
            }
          />
        ) : (
          <div
            ref={parent}
            className={cx('overflow-y-auto', compact ? 'h-[420px]' : 'h-[calc(100dvh-300px)] min-h-[360px]')}
          >
            <div style={{ height: v.getTotalSize(), position: 'relative' }}>
              {items.map((it) => (
                <div
                  key={rows[it.index]!.symbol}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${it.start}px)`,
                  }}
                >
                  <Row
                    m={rows[it.index]!}
                    authed={authed}
                    onOpen={(s) => router.push(`/trade/${s}`)}
                    onFav={(m) => fav.mutate(m)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {total > 0 && (
          <div className="px-4 py-2 text-[12px] text-muted border-t border-line num">
            {total.toLocaleString()} markets
          </div>
        )}
      </div>
    </div>
  );
}
