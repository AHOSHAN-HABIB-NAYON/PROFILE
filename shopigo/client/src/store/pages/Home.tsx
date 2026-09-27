import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowRight, BadgeCheck, Copy, Flame, Gift, RotateCcw, ShieldCheck, Ticket, Truck, Zap } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { money } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useSettings, useStoreData } from '../../lib/settings';
import type { Banner, Combo, HomeSection, ProductCard as Card } from '../../lib/types';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Button, Countdown, Picture, Skeleton, toast } from '../../components/ui';
import { BannerSlider } from '../components/BannerSlider';
import { HomeHeader } from '../components/chrome';
import { ProductGrid, ProductGridSkeleton, ProductRail, SectionHeader } from '../components/ProductCard';

interface HomeData { banners: Banner[]; sections: HomeSection[] }

export default function Home() {
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData>('/api/public/home'), staleTime: 60_000 });
  return (
    <div>
      <HomeHeader />
      <div className="space-y-7 px-4 pt-4 md:space-y-10 md:px-0 md:pt-6">
        {isLoading ? <Skeleton className="aspect-[16/9] w-full rounded-[26px] sm:aspect-[21/8]" /> : <BannerSlider banners={data?.banners ?? []} />}
        <TrustStrip />
        {isLoading && <ProductGridSkeleton count={4} />}
        {data?.sections.map((s) => <Section key={s.key} s={s} />)}
      </div>
    </div>
  );
}

function TrustStrip() {
  const t = useT();
  const s = useSettings();
  const items = [
    { icon: <Truck className="size-4" />, text: t('cod') },
    { icon: <BadgeCheck className="size-4" />, text: t('genuine') },
    { icon: <RotateCcw className="size-4" />, text: t('easyReturn') },
    { icon: <ShieldCheck className="size-4" />, text: s.delivery_time_inside ? `${t('insideDhaka')} ${s.delivery_time_inside}` : t('freeDelivery') },
  ];
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:px-0">
      {items.map((i) => (
        <div key={i.text} className="flex shrink-0 items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink-2 shadow-[var(--shadow-soft)] md:justify-center md:rounded-2xl md:py-3">
          <span className="text-brand-500">{i.icon}</span>{i.text}
        </div>
      ))}
    </div>
  );
}

function Section({ s }: { s: HomeSection }) {
  switch (s.key) {
    case 'categories': return <CategoriesRow s={s} />;
    case 'flash_sale': return <FlashSection s={s} />;
    case 'combo_offers': return <CombosSection s={s} />;
    case 'free_delivery': return <FreeDeliverySection s={s} />;
    case 'coupon_highlight': return <CouponSection s={s} />;
    default: return <GridSection s={s} />;
  }
}

function CategoriesRow({ s }: { s: HomeSection }) {
  const { categories } = useStoreData();
  const t = useT();
  const roots = categories.filter((c) => !c.parent_id).slice(0, s.limit || 10);
  if (!roots.length) return null;
  return (
    <section>
      <SectionHeader title={s.title === 'Categories' ? t('categories') : s.title} to="/categories" />
      <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-8 md:gap-3 md:px-0 lg:grid-cols-10">
        {roots.map((c) => (
          <Link key={c.id} to={`/category/${c.slug}`} className="group flex w-[68px] shrink-0 flex-col items-center gap-2 md:w-auto">
            <span className="grid size-[62px] place-items-center rounded-[22px] bg-surface text-brand-500 shadow-[var(--shadow-soft)] transition group-hover:-translate-y-0.5 group-hover:bg-brand-50">
              <CategoryIcon type={c.icon_type} value={c.icon_value} name={c.name} />
            </span>
            <span className="line-clamp-2 text-center text-[11.5px] leading-tight font-semibold text-ink-2">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FlashSection({ s }: { s: HomeSection }) {
  const t = useT();
  if (!s.products?.length) return null;
  return (
    <section className="rounded-[26px] bg-gradient-to-br from-[#fff0e6] to-[#ffe2d0] p-4 md:p-6">
      <SectionHeader
        title={s.title === 'Flash Sale' ? t('flashSale') : s.title}
        subtitle={s.subtitle}
        icon={<Zap className="size-5 fill-brand-500 text-brand-500" />}
        to="/flash-sale"
        right={s.endsAt ? <span className="hidden items-center gap-2 text-[12px] font-semibold text-muted sm:flex">{t('endsIn')} <Countdown to={s.endsAt} compact /></span> : undefined}
      />
      {s.endsAt && <div className="-mt-1 mb-3 flex items-center gap-2 text-[12px] font-semibold text-muted sm:hidden">{t('endsIn')} <Countdown to={s.endsAt} compact /></div>}
      <ProductRail products={s.products} />
    </section>
  );
}

function CombosSection({ s }: { s: HomeSection }) {
  const t = useT();
  const combos = s.combos ?? [];
  if (!combos.length) return null;
  return (
    <section>
      <SectionHeader title={s.title === 'Combo Offers' ? t('combos') : s.title} subtitle={s.subtitle} icon={<Gift className="size-5 text-brand-500" />} to="/combos" />
      <div className="grid gap-3 md:grid-cols-2">
        {combos.map((c) => <ComboCard key={c.id} c={c} />)}
      </div>
    </section>
  );
}

export function ComboCard({ c }: { c: Combo }) {
  const t = useT();
  const s = useSettings();
  const pct = c.regularPrice > 0 ? Math.round((c.savings / c.regularPrice) * 100) : 0;
  return (
    <Link to={`/combo/${c.slug}`} className="group relative flex overflow-hidden rounded-[26px] bg-gradient-to-br from-[#ffb088] via-[#ff9a6c] to-[#f26b3a] p-5 text-white shadow-[var(--shadow-float)]">
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <span className="chip w-fit bg-white/25 text-white backdrop-blur">{t('combos')}</span>
        <h3 className="mt-2 line-clamp-2 text-[19px] leading-tight font-extrabold">{c.name}</h3>
        <p className="mt-1 text-[12.5px] text-white/85">{t('save')} {money(c.savings, s.currency_symbol)} {pct > 0 && `(${pct}%)`}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[22px] font-extrabold">{money(c.price, s.currency_symbol)}</span>
          <span className="text-[13px] text-white/70 line-through">{money(c.regularPrice, s.currency_symbol)}</span>
        </div>
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12.5px] font-bold text-brand-600">{t('shopNow')} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
      <div className="relative -my-2 -mr-2 w-[42%] shrink-0">
        {c.items.slice(0, 3).map((it, i) => (
          <div key={it.id} className="absolute" style={{ right: `${i * 26}%`, top: `${10 + (i % 2) * 22}%`, zIndex: 3 - i }}>
            <Picture path={it.image} alt={it.name} size="thumb" className="size-[92px] rounded-[20px] border-4 border-white/40 shadow-lg" />
          </div>
        ))}
      </div>
    </Link>
  );
}

function FreeDeliverySection({ s }: { s: HomeSection }) {
  const t = useT();
  const st = useSettings();
  return (
    <section>
      <div className="mb-4 flex items-center gap-3 rounded-[22px] bg-gradient-to-r from-[#e8f7ee] to-[#f3fbf6] p-4 ring-1 ring-green-100">
        <span className="grid size-11 place-items-center rounded-2xl bg-white text-green-600 shadow-sm"><Truck className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-green-800">{s.title === 'Free Delivery' ? t('freeDelivery') : s.title}</p>
          <p className="text-[12.5px] text-green-700/80">{st.free_delivery_min_order > 0 ? `${t('minOrder')} ${money(st.free_delivery_min_order, st.currency_symbol)}` : s.subtitle}</p>
        </div>
        <Link to="/products?section=free_delivery" className="text-[12px] font-bold text-green-700">{t('viewAll')}</Link>
      </div>
      {s.products && s.products.length > 0 && <ProductGrid products={s.products} columns={s.columns} />}
    </section>
  );
}

function CouponSection({ s }: { s: HomeSection }) {
  const t = useT();
  const st = useSettings();
  const [copied, setCopied] = useState<string | null>(null);
  if (!s.coupons?.length) return null;
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {s.coupons.map((c) => (
        <div key={c.code} className="relative flex items-center gap-4 overflow-hidden rounded-[22px] bg-ink p-4 text-white">
          <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-canvas" />
          <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-canvas" />
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-500"><Ticket className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-extrabold">{c.type === 'percent' ? `${c.value}% ${t('off')}` : `${money(c.value, st.currency_symbol)} ${t('off')}`}</p>
            <p className="truncate text-[12px] text-white/70">{c.description || `${t('minOrder')} ${money(c.min_order, st.currency_symbol)}`}</p>
          </div>
          <button
            onClick={() => { void navigator.clipboard?.writeText(c.code); setCopied(c.code); toast.success(t('copied')); }}
            className="press flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-white/40 px-3 py-2 font-mono text-[13px] font-bold"
          >
            {c.code} <Copy className="size-3.5" />{copied === c.code && <span className="sr-only">{t('copied')}</span>}
          </button>
        </div>
      ))}
    </section>
  );
}

function GridSection({ s }: { s: HomeSection }) {
  const t = useT();
  const perPage = Math.max(1, s.perPage || s.limit);
  const q = useInfiniteQuery({
    queryKey: ['home-section', s.key, perPage],
    queryFn: ({ pageParam }) => api.get<{ items: Card[]; total: number; page: number; limit: number }>(`/api/public/products${qs({ section: s.key, page: pageParam, limit: perPage })}`),
    initialPageParam: 2,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: false,
  });
  const extra = q.data?.pages.flatMap((p) => p.items) ?? [];
  const products = [...(s.products ?? []), ...extra.filter((e) => !(s.products ?? []).some((p) => p.id === e.id))];
  if (!s.products?.length) return null;
  const canLoadMore = s.products.length >= perPage && (q.data ? q.hasNextPage : true);
  const icons: Record<string, React.ReactNode> = { best_selling: <Flame className="size-5 text-brand-500" /> };
  return (
    <section>
      <SectionHeader title={s.title} subtitle={s.subtitle} icon={icons[s.key]} to={`/products?section=${s.key}`} />
      <ProductGrid products={products} columns={s.columns} />
      {canLoadMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="soft" loading={q.isFetching} onClick={() => void q.fetchNextPage()}>{t('loadMore')}</Button>
        </div>
      )}
    </section>
  );
}
