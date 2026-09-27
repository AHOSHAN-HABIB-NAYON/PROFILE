import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Heart, ShoppingCart, Star, Truck, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { useCart, useWishlist } from '../../lib/cart';
import { cx, money } from '../../lib/format';
import { img } from '../../lib/image';
import { useT } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { track } from '../../lib/tracking';
import type { ProductCard as Card, ProductDetail } from '../../lib/types';
import { Picture, toast } from '../../components/ui';

/** Small "fly to cart" animation from the product image to the cart icon. */
export function flyToCart(from: HTMLElement | null, image: string | null) {
  if (!from || !image || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector('[aria-label="Cart"]:not([hidden])') as HTMLElement | null;
  const a = from.getBoundingClientRect();
  const b = target?.getBoundingClientRect() ?? { left: window.innerWidth - 60, top: window.innerHeight - 60, width: 30, height: 30 };
  const ghost = document.createElement('img');
  ghost.src = img(image, 'thumb');
  Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, borderRadius: '20px', objectFit: 'cover', zIndex: '120', pointerEvents: 'none', transition: 'transform .6s cubic-bezier(.5,-.2,.7,1), opacity .6s ease', boxShadow: '0 10px 30px rgba(0,0,0,.2)' });
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.12)`;
    ghost.style.opacity = '.4';
  });
  setTimeout(() => ghost.remove(), 650);
}

export function useAddToCart() {
  const add = useCart((s) => s.add);
  const navigate = useNavigate();
  const t = useT();
  return (p: { id: number; name: string; slug: string; image: string | null; price: number }, opts: { variantId?: number | null; variantLabel?: string | null; qty?: number; buyNow?: boolean; from?: HTMLElement | null } = {}) => {
    add({ productId: p.id, variantId: opts.variantId ?? null, name: p.name, image: p.image, slug: p.slug, price: p.price, variantLabel: opts.variantLabel ?? null, qty: opts.qty ?? 1 });
    track('add_to_cart', { productId: p.id, value: p.price * (opts.qty ?? 1), qty: opts.qty ?? 1, name: p.name });
    if (opts.buyNow) { navigate('/checkout'); return; }
    flyToCart(opts.from ?? null, p.image);
    toast.success(t('addedToCart'), { label: t('viewCart'), onClick: () => navigate('/cart') });
  };
}

export function ProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  const t = useT();
  const s = useSettings();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const addToCart = useAddToCart();
  const wished = useWishlist((w) => w.ids.includes(p.id));
  const toggleWish = useWishlist((w) => w.toggle);
  const needsOptions = p.hasVariants || p.sizeRequired;
  const prefetch = () => qc.prefetchQuery({ queryKey: ['product', p.slug], queryFn: () => api.get<ProductDetail>(`/api/public/products/${p.slug}`), staleTime: 60_000 });

  const onAdd = (e: React.MouseEvent<HTMLButtonElement>, buyNow: boolean) => {
    e.preventDefault();
    if (!p.inStock) return;
    if (needsOptions) { navigate(`/product/${p.slug}${buyNow ? '?buy=1' : ''}`); return; }
    const card = (e.currentTarget.closest('[data-card]') as HTMLElement | null)?.querySelector('picture') as HTMLElement | null;
    addToCart({ id: p.id, name: p.name, slug: p.slug, image: p.image, price: p.salePrice }, { buyNow, from: card });
  };

  return (
    <div data-card className="group relative flex flex-col overflow-hidden rounded-[22px] bg-surface shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-22px_rgb(56_32_16/0.35)]">
      <Link to={`/product/${p.slug}`} onMouseEnter={prefetch} onTouchStart={prefetch} className="relative block">
        <Picture path={p.image} alt={p.name} className="aspect-square" priority={priority} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" />
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {p.discount > 0 && <span className="chip bg-danger text-white shadow-sm">-{p.discount}%</span>}
          {p.flash && <span className="chip bg-ink text-white"><Zap className="size-3 fill-current" />Flash</span>}
        </div>
        {!p.inStock && <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-[1px]"><span className="chip bg-ink px-3 py-1.5 text-[12px] text-white">{t('outOfStock')}</span></div>}
      </Link>
      <button onClick={() => toggleWish(p.id)} className={cx('press absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur', wished ? 'text-danger' : 'text-ink-2')} aria-label={t('wishlist')}>
        <Heart className={cx('size-4', wished && 'fill-current')} />
      </button>
      <div className="flex flex-1 flex-col p-3 pt-2.5">
        <Link to={`/product/${p.slug}`} className="line-clamp-2 min-h-[2.5em] text-[13.5px] leading-[1.25] font-semibold text-ink hover:text-brand-600">{p.name}</Link>
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
          {p.ratingCount > 0 && <span className="inline-flex items-center gap-0.5 font-semibold text-ink-2"><Star className="size-3 fill-amber-400 text-amber-400" />{p.rating.toFixed(1)}</span>}
          {p.ratingCount > 0 && <span>({p.ratingCount})</span>}
          {p.freeDelivery && <span className="inline-flex items-center gap-0.5 font-semibold text-green-700"><Truck className="size-3" />{t('freeDelivery')}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[16px] font-extrabold text-ink">{money(p.salePrice, s.currency_symbol)}</span>
          {p.price > p.salePrice && <span className="text-[12px] text-muted line-through">{money(p.price, s.currency_symbol)}</span>}
        </div>
        {s.show_stock && p.inStock && p.stock <= 5 && <p className="mt-0.5 text-[11px] font-semibold text-danger">{t('onlyLeft', { n: p.stock })}</p>}
        <div className="mt-auto flex gap-1.5 pt-2.5">
          <button onClick={(e) => onAdd(e, false)} disabled={!p.inStock} className="press grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 disabled:opacity-40" aria-label={t('addToCart')}>
            <ShoppingCart className="size-[18px]" />
          </button>
          <button onClick={(e) => onAdd(e, true)} disabled={!p.inStock} className="press cta-glow flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-b from-brand-400 to-brand-500 text-[13px] font-bold text-white shadow-[0_8px_18px_-8px_rgb(242_107_58/0.8)] disabled:from-[#e8ddd4] disabled:to-[#e8ddd4] disabled:text-muted disabled:shadow-none">
            {t('orderNow')} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ products, columns = 2, priorityCount = 0 }: { products: Card[]; columns?: number; priorityCount?: number }) {
  const cols: Record<number, string> = {
    1: 'grid-cols-1 sm:grid-cols-2',
    2: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
    3: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    4: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5',
    5: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6',
    6: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6',
  };
  return (
    <div className={cx('grid gap-3 sm:gap-4', cols[columns] ?? cols[2])}>
      {products.map((p, i) => <ProductCard key={p.id} p={p} priority={i < priorityCount} />)}
    </div>
  );
}

export function ProductRail({ products }: { products: Card[] }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-5">
      {products.map((p) => <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] md:w-auto"><ProductCard p={p} /></div>)}
    </div>
  );
}

export function SectionHeader({ title, subtitle, to, icon, right }: { title: string; subtitle?: string | null; to?: string; icon?: React.ReactNode; right?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[18px] font-extrabold tracking-tight md:text-[21px]">{icon}{title}</h2>
        {subtitle && <p className="text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right}
        {to && <Link to={to} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-muted hover:text-brand-600">{t('viewAll')} <ArrowRight className="size-3.5" /></Link>}
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-[22px] bg-surface p-0 shadow-[var(--shadow-card)]">
          <div className="aspect-square animate-pulse bg-[#f1e6dc]" />
          <div className="space-y-2 p-3"><div className="h-3 w-4/5 animate-pulse rounded bg-[#f1e6dc]" /><div className="h-3 w-1/2 animate-pulse rounded bg-[#f1e6dc]" /><div className="h-9 animate-pulse rounded-xl bg-[#f1e6dc]" /></div>
        </div>
      ))}
    </div>
  );
}
