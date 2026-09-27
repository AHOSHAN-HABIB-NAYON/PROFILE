import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { ArrowUpDown, Search, X, Zap } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useSettings, useStoreData } from '../../lib/settings';
import { track } from '../../lib/tracking';
import type { ProductCard as Card } from '../../lib/types';
import { Button, Empty, Select } from '../../components/ui';
import { CartButton, TopBar } from '../components/chrome';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard';

interface Page { items: Card[]; total: number; page: number; limit: number; category: { id: number; name: string; slug: string; description: string | null } | null }

const SECTION_TITLES: Record<string, string> = { best_selling: 'Best Selling', new_arrivals: 'New Arrivals', featured: 'Featured Products', free_delivery: 'Free Delivery', recommended: 'Recommended For You', flash_sale: 'Flash Sale' };

export default function Listing() {
  const t = useT();
  const s = useSettings();
  const { categories } = useStoreData();
  const { slug } = useParams();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const isSearch = pathname === '/search';
  const isFlash = pathname === '/flash-sale';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? '';
  const section = isFlash ? 'flash_sale' : params.get('section') ?? '';
  const brand = params.get('brand') ?? '';
  const [input, setInput] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setInput(q), [q]);
  useEffect(() => { if (isSearch && !q) inputRef.current?.focus(); }, [isSearch, q]);

  const filters = { category: slug, q: q || undefined, sort: sort || undefined, section: section || undefined, brand: brand || undefined, limit: s.products_per_page || 20 };
  const enabled = !isSearch || q.length > 0;
  const query = useInfiniteQuery({
    queryKey: ['products', filters],
    queryFn: ({ pageParam }) => api.get<Page>(`/api/public/products${qs({ ...filters, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled,
  });
  const suggest = useQuery({
    queryKey: ['suggest', input],
    queryFn: () => api.get<{ products: Card[]; categories: Array<{ name: string; slug: string }> }>(`/api/public/search/suggest?q=${encodeURIComponent(input)}`),
    enabled: isSearch && input.length >= 2 && input !== q,
    staleTime: 60_000,
  });
  useEffect(() => { if (q) track('search', { term: q }); }, [q]);
  const first = query.data?.pages[0];
  useEffect(() => { if (first?.category) track('view_category', { categoryId: first.category.id }); }, [first?.category]);

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const sub = slug ? categories.filter((c) => c.parent_id && c.parent_id === first?.category?.id) : [];
  const title = isSearch ? t('search') : first?.category?.name ?? (section ? SECTION_TITLES[section] ?? t('allProducts') : brand ? brand : t('allProducts'));

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const setSort = (v: string) => { const p = new URLSearchParams(params); if (v) p.set('sort', v); else p.delete('sort'); setParams(p, { replace: true }); };

  return (
    <div>
      <TopBar title={isSearch ? undefined : title} subtitle={first ? `${first.total} ${t('items')}` : undefined} right={<CartButton />} />
      <div className="px-4 md:px-0 md:pt-6">
        {isSearch && (
          <form className="relative mb-4" onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (v) setParams({ q: v }); }}>
            <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} type="search" enterKeyHint="search" placeholder={t('searchPlaceholder')} className="h-12 w-full rounded-2xl bg-surface pr-10 pl-12 text-[15px] shadow-[var(--shadow-soft)] outline-none focus:ring-4 focus:ring-brand-100" />
            {input && <button type="button" onClick={() => { setInput(''); setParams({}); inputRef.current?.focus(); }} className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-soft" aria-label="Clear"><X className="size-4" /></button>}
            {suggest.data && input !== q && (suggest.data.products.length > 0 || suggest.data.categories.length > 0) && (
              <div className="absolute inset-x-0 top-14 z-20 overflow-hidden rounded-2xl bg-surface shadow-2xl">
                {suggest.data.categories.map((c) => <Link key={c.slug} to={`/category/${c.slug}`} className="block px-4 py-2.5 text-[14px] font-semibold text-brand-700 hover:bg-soft">{c.name}</Link>)}
                {suggest.data.products.map((p) => <Link key={p.id} to={`/product/${p.slug}`} className="block truncate px-4 py-2.5 text-[14px] hover:bg-soft">{p.name}</Link>)}
              </div>
            )}
          </form>
        )}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className={isSearch ? 'text-[15px] font-semibold text-muted' : 'hidden text-[26px] font-extrabold tracking-tight md:block'}>
              {isSearch ? (q ? `“${q}” — ${first?.total ?? 0} ${t('items')}` : '') : <span className="flex items-center gap-2">{isFlash && <Zap className="size-6 fill-brand-500 text-brand-500" />}{title}</span>}
            </h1>
            {first?.category?.description && <p className="mt-1 hidden text-[14px] text-muted md:block">{first.category.description}</p>}
          </div>
          <label className="relative flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-2">
            <ArrowUpDown className="size-4 text-muted" />
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!h-10 !rounded-full !py-0 !pl-3 !text-[13px]">
              <option value="">{t('sortNew')}</option>
              <option value="popular">{t('sortPopular')}</option>
              <option value="price_asc">{t('sortPriceAsc')}</option>
              <option value="price_desc">{t('sortPriceDesc')}</option>
              <option value="rating">{t('sortRating')}</option>
            </Select>
          </label>
        </div>
        {sub.length > 0 && (
          <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {sub.map((c) => <Link key={c.id} to={`/category/${c.slug}`} className="shrink-0 rounded-full bg-surface px-4 py-2 text-[13px] font-semibold shadow-[var(--shadow-soft)] hover:text-brand-600">{c.name}</Link>)}
          </div>
        )}
        {!enabled ? (
          <Empty icon={<Search className="size-9" />} title={t('searchPlaceholder')} />
        ) : query.isLoading ? (
          <ProductGridSkeleton />
        ) : items.length === 0 ? (
          <Empty icon={<Search className="size-9" />} title={t('noProducts')} action={<Link to="/"><Button variant="soft">{t('goHome')}</Button></Link>} />
        ) : (
          <>
            <ProductGrid products={items} priorityCount={4} />
            <div ref={sentinel} className="h-4" />
            {query.isFetchingNextPage && <div className="mt-3"><ProductGridSkeleton count={4} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
