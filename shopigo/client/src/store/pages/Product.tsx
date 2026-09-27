import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { BadgeCheck, ChevronRight, Heart, Share2, ShoppingCart, Star, Truck, Wallet, X, Zap } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useWishlist } from '../../lib/cart';
import { cx, dateOnly, money } from '../../lib/format';
import { img } from '../../lib/image';
import { useT } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { track } from '../../lib/tracking';
import type { ProductDetail, Variant } from '../../lib/types';
import { Button, Countdown, Field, Input, PageSpinner, Picture, QtyStepper, Sheet, Tabs, Textarea, toast } from '../../components/ui';
import { CartButton, TopBar } from '../components/chrome';
import { ProductRail, SectionHeader, useAddToCart } from '../components/ProductCard';
import NotFound from './NotFound';

export default function Product() {
  const { slug = '' } = useParams();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['product', slug], queryFn: () => api.get<ProductDetail>(`/api/public/products/${slug}`), staleTime: 60_000 });
  useEffect(() => { if (p) track('view_item', { productId: p.id, value: p.salePrice, name: p.name, categoryId: p.category?.id }); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading) return <PageSpinner />;
  if ((error instanceof ApiError && error.status === 404) || !p) return <NotFound />;
  return <ProductView key={p.id} p={p} />;
}

function ProductView({ p }: { p: ProductDetail }) {
  const t = useT();
  const s = useSettings();
  const [params] = useSearchParams();
  const addToCart = useAddToCart();
  const wished = useWishlist((w) => w.ids.includes(p.id));
  const toggleWish = useWishlist((w) => w.toggle);

  const colors = useMemo(() => [...new Map(p.variants.filter((v) => v.color).map((v) => [v.color!, v.colorHex])).entries()], [p.variants]);
  const sizes = useMemo(() => [...new Set(p.variants.filter((v) => v.size).map((v) => v.size!))], [p.variants]);
  const [color, setColor] = useState<string | null>(colors.find(([c]) => p.variants.some((v) => v.color === c && v.stock > 0))?.[0] ?? colors[0]?.[0] ?? null);
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0]! : null);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [tab, setTab] = useState<'desc' | 'spec' | 'reviews'>('desc');
  const sizeRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const variant: Variant | null = useMemo(() => {
    if (!p.variants.length) return null;
    return p.variants.find((v) => (sizes.length ? v.size === size : true) && (colors.length ? v.color === color : true)) ?? null;
  }, [p.variants, size, color, sizes.length, colors.length]);

  const price = variant?.price ?? p.salePrice;
  const regular = variant?.regularPrice ?? p.price;
  const stock = variant ? variant.stock : p.stock;
  const needsSize = sizes.length > 0;
  const maxQty = Math.max(1, Math.min(stock, s.max_order_quantity || 10, p.flash?.remaining ?? 999));

  useEffect(() => {
    if (params.get('buy') === '1' && needsSize) {
      setTimeout(() => sizeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }
  }, [params, needsSize]);

  const submit = (buyNow: boolean) => {
    if (needsSize && !size) {
      setSizeError(true);
      sizeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setSizeError(false), 1600);
      toast.error(t('selectSize'));
      return;
    }
    if (p.variants.length && !variant) { toast.error(t('selectSize')); return; }
    if (stock <= 0) return;
    const label = [variant?.color, variant?.size].filter(Boolean).join(' · ') || null;
    addToCart({ id: p.id, name: p.name, slug: p.slug, image: p.images[0]?.path ?? null, price }, { variantId: variant?.id ?? null, variantLabel: label, qty, buyNow, from: galleryRef.current?.querySelector('picture') as HTMLElement | null });
  };

  const share = async () => {
    const url = location.href.split('?')[0]!;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('copied')); }
    } catch { /* cancelled */ }
  };

  const discount = regular > price ? Math.round(((regular - price) / regular) * 100) : 0;
  return (
    <div className="pb-24 md:pb-0">
      <TopBar
        right={
          <div className="flex items-center">
            <button onClick={() => toggleWish(p.id)} className={cx('press grid size-10 place-items-center rounded-full', wished ? 'text-danger' : 'text-ink')} aria-label={t('wishlist')}><Heart className={cx('size-[22px]', wished && 'fill-current')} /></button>
            <button onClick={() => void share()} className="press grid size-10 place-items-center rounded-full" aria-label={t('share')}><Share2 className="size-[21px]" /></button>
          </div>
        }
      />
      <nav className="hidden items-center gap-1 pt-5 pb-3 text-[13px] text-muted md:flex">
        <Link to="/" className="hover:text-brand-600">{t('home')}</Link>
        {p.category && <><ChevronRight className="size-3.5" /><Link to={`/category/${p.category.slug}`} className="hover:text-brand-600">{p.category.name}</Link></>}
        <ChevronRight className="size-3.5" /><span className="truncate text-ink-2">{p.name}</span>
      </nav>
      <div className="grid gap-5 md:grid-cols-2 md:gap-10">
        <div ref={galleryRef} className="px-4 md:px-0"><Gallery images={p.images} name={p.name} /></div>
        <div className="px-4 md:px-0">
          {p.flash && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-ink to-[#3d2a20] px-4 py-2.5 text-white">
              <span className="flex items-center gap-1.5 text-[13px] font-bold"><Zap className="size-4 fill-brand-400 text-brand-400" />{p.flash.title || t('flashSale')}</span>
              <span className="text-ink"><Countdown to={p.flash.endsAt} compact /></span>
            </div>
          )}
          {p.brand && <Link to={`/products?brand=${p.brand.slug}`} className="text-[12.5px] font-bold tracking-wide text-brand-600 uppercase">{p.brand.name}</Link>}
          <h1 className="mt-1 text-[22px] leading-tight font-extrabold tracking-tight md:text-[28px]">{p.name}</h1>
          {p.shortDescription && <p className="mt-1 text-[13.5px] text-muted">{p.shortDescription}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            {p.ratingCount > 0 && (
              <button onClick={() => { setTab('reviews'); document.getElementById('tabs')?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-1">
                <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx('size-4', i <= Math.round(p.rating) ? 'fill-amber-400 text-amber-400' : 'text-[#e6dbd1]')} />)}</span>
                <span className="font-semibold">{p.rating.toFixed(1)}</span><span className="text-muted">({p.ratingCount} {t('reviews').toLowerCase()})</span>
              </button>
            )}
            {p.sku && <span className="text-muted">SKU: {variant?.sku || p.sku}</span>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[30px] font-extrabold tracking-tight">{money(price, s.currency_symbol)}</span>
            {regular > price && <span className="text-[16px] text-muted line-through">{money(regular, s.currency_symbol)}</span>}
            {discount > 0 && <span className="chip bg-danger px-2.5 py-1 text-[12px] text-white">-{discount}%</span>}
            <span className={cx('ml-auto flex items-center gap-1.5 text-[13px] font-semibold', stock > 0 ? 'text-green-700' : 'text-danger')}>
              <span className={cx('size-2 rounded-full', stock > 0 ? 'bg-green-500' : 'bg-danger')} />
              {stock <= 0 ? t('outOfStock') : s.show_stock && stock <= 10 ? t('onlyLeft', { n: stock }) : t('inStock')}
            </span>
          </div>

          {colors.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[14px] font-semibold">{t('color')}: <span className="text-muted">{color}</span></p>
              <div className="flex flex-wrap gap-2.5">
                {colors.map(([c, hex]) => {
                  const available = p.variants.some((v) => v.color === c && v.stock > 0);
                  return (
                    <button key={c} onClick={() => setColor(c)} title={c} aria-label={c} className={cx('press relative grid size-10 place-items-center rounded-full ring-offset-2 transition', color === c ? 'ring-2 ring-brand-500' : 'ring-1 ring-line', !available && 'opacity-40')}>
                      <span className="size-8 rounded-full border border-black/10" style={{ background: hex || '#ddd' }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div ref={sizeRef} className={cx('mt-5 rounded-2xl transition', sizeError && 'animate-[pop_.3s] bg-red-50 p-3 ring-2 ring-danger/40')}>
              <p className="mb-2 text-[14px] font-semibold">{size ? <>{t('size')}: <span className="text-muted">{size}</span></> : <span className={sizeError ? 'text-danger' : ''}>{t('selectSize')} <span className="text-danger">*</span></span>}</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((sz) => {
                  const v = p.variants.find((x) => x.size === sz && (colors.length ? x.color === color : true));
                  const out = !v || v.stock <= 0;
                  return (
                    <button key={sz} disabled={out} onClick={() => { setSize(sz); setSizeError(false); }} className={cx('press h-10 min-w-12 rounded-xl border px-3.5 text-[14px] font-bold transition', size === sz ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-200', out && 'cursor-not-allowed line-through opacity-40')}>
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-4">
            <span className="text-[14px] font-semibold">{t('quantity')}</span>
            <QtyStepper value={Math.min(qty, maxQty)} onChange={setQty} max={maxQty} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2.5 rounded-2xl bg-surface p-3 shadow-[var(--shadow-soft)]">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><Wallet className="size-[18px]" /></span>
              <span className="text-[12.5px] leading-tight font-semibold">{t('cod')}</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-2xl bg-surface p-3 shadow-[var(--shadow-soft)]">
              <span className="grid size-9 place-items-center rounded-xl bg-green-50 text-green-600"><Truck className="size-[18px]" /></span>
              <span className="text-[12.5px] leading-tight font-semibold">
                {p.freeDelivery ? t('freeDelivery') : <>{t('insideDhaka')} {money(s.delivery_inside_dhaka, s.currency_symbol)}<br /><span className="font-normal text-muted">{t('outsideDhaka')} {money(s.delivery_outside_dhaka, s.currency_symbol)}</span></>}
              </span>
            </div>
          </div>
          {(s.delivery_time_inside || s.delivery_time_outside) && <p className="mt-2 text-[12.5px] text-muted">{t('deliveryTime')}: {t('insideDhaka')} {s.delivery_time_inside} · {t('outsideDhaka')} {s.delivery_time_outside}</p>}

          <div className="mt-5 hidden gap-3 md:flex">
            <Button variant="outline" size="lg" className="flex-1" icon={<ShoppingCart className="size-5" />} disabled={stock <= 0} onClick={() => submit(false)}>{t('addToCart')}</Button>
            <Button size="lg" className="cta-glow flex-1" icon={<Zap className="size-5 fill-current" />} disabled={stock <= 0} onClick={() => submit(true)}>{stock <= 0 ? t('outOfStock') : t('orderNow')}</Button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted"><BadgeCheck className="size-4 text-green-600" />{t('genuine')} · {t('easyReturn')}</div>
        </div>
      </div>

      <div id="tabs" className="mt-8 px-4 md:px-0">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'desc', label: t('description') }, ...(p.specifications.length ? [{ value: 'spec' as const, label: t('specifications') }] : []), ...(s.reviews_enabled ? [{ value: 'reviews' as const, label: `${t('reviews')} (${p.ratingCount})` }] : [])]} />
        <div className="card mt-3 p-5">
          {tab === 'desc' && (p.description ? <div className="prose-shop" dangerouslySetInnerHTML={{ __html: p.description }} /> : <p className="text-muted">—</p>)}
          {tab === 'spec' && (
            <dl className="divide-y divide-line text-[14px]">
              {p.specifications.map((sp, i) => <div key={i} className="grid grid-cols-[40%_1fr] gap-3 py-2.5"><dt className="text-muted">{sp.label}</dt><dd className="font-semibold">{sp.value}</dd></div>)}
            </dl>
          )}
          {tab === 'reviews' && <Reviews slug={p.slug} />}
        </div>
      </div>

      {p.related.length > 0 && (
        <section className="mt-8 px-4 md:px-0">
          <SectionHeader title={t('related')} to={p.category ? `/category/${p.category.slug}` : undefined} />
          <ProductRail products={p.related} />
        </section>
      )}

      {/* Sticky mobile action bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-3 pt-2.5 pb-2.5 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-2">
          <CartButton className="size-12 shrink-0 rounded-2xl bg-soft" />
          <Button variant="outline" size="lg" className="flex-1 !px-3" disabled={stock <= 0} onClick={() => submit(false)}>{t('addToCart')}</Button>
          <Button size="lg" className="cta-glow flex-1 !px-3" icon={<Zap className="size-4 fill-current" />} disabled={stock <= 0} onClick={() => submit(true)}>{stock <= 0 ? t('outOfStock') : t('orderNow')}</Button>
        </div>
      </div>
    </div>
  );
}

function Gallery({ images, name }: { images: ProductDetail['images']; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const trackRef = useRef<HTMLDivElement>(null);
  const go = (i: number) => { setIndex(i); trackRef.current?.scrollTo({ left: i * trackRef.current.clientWidth, behavior: 'smooth' }); };
  if (!images.length) return <div className="grid aspect-square place-items-center rounded-[26px] bg-soft text-muted">No image</div>;
  return (
    <div>
      <div className="relative">
        <div ref={trackRef} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-[26px] bg-surface shadow-[var(--shadow-card)]">
          {images.map((im, i) => (
            <button key={im.id} onClick={() => setZoom(true)} className="w-full shrink-0 snap-center cursor-zoom-in" aria-label="Zoom">
              <Picture path={im.path} alt={im.alt || name} size="lg" className="aspect-square" priority={i === 0} sizes="(max-width: 768px) 100vw, 50vw" />
            </button>
          ))}
        </div>
        {images.length > 1 && <span className="absolute right-3 bottom-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-bold text-white">{index + 1}/{images.length}</span>}
      </div>
      {images.length > 1 && (
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
          {images.map((im, i) => (
            <button key={im.id} onClick={() => go(i)} className={cx('size-16 shrink-0 overflow-hidden rounded-2xl ring-2 transition md:size-20', i === index ? 'ring-brand-500' : 'ring-transparent opacity-80 hover:opacity-100')}>
              <Picture path={im.path} alt="" size="thumb" className="size-full" />
            </button>
          ))}
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-[95] flex flex-col bg-black/95" onClick={() => setZoom(false)}>
          <button className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Close"><X className="size-5" /></button>
          <div className="flex flex-1 items-center justify-center overflow-hidden" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}>
            <img src={img(images[index]!.path, 'lg')} alt={name} className="max-h-full max-w-full object-contain transition-transform duration-200 hover:scale-[1.8]" style={{ transformOrigin: origin }} />
          </div>
          <div className="flex justify-center gap-2 p-4" onClick={(e) => e.stopPropagation()}>
            {images.map((im, i) => <button key={im.id} onClick={() => setIndex(i)} className={cx('size-2.5 rounded-full', i === index ? 'bg-white' : 'bg-white/30')} aria-label={`Image ${i + 1}`} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Reviews({ slug }: { slug: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ['reviews', slug], queryFn: () => api.get<{ items: Array<{ id: number; customer_name: string; rating: number; comment: string | null; created_at: string }> }>(`/api/public/products/${slug}/reviews`) });
  const [form, setForm] = useState({ name: '', rating: 5, comment: '' });
  const m = useMutation({
    mutationFn: () => api.post<{ pending: boolean }>(`/api/public/products/${slug}/reviews`, form),
    onSuccess: (r) => { setOpen(false); setForm({ name: '', rating: 5, comment: '' }); toast.success(r.pending ? t('reviewThanks') : '✓'); void refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button size="sm" variant="soft" onClick={() => setOpen(true)}>{t('writeReview')}</Button></div>
      {!data?.items.length ? <p className="py-4 text-center text-muted">{t('noReviews')}</p> : (
        <ul className="divide-y divide-line">
          {data.items.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.customer_name}</span>
                <span className="text-[12px] text-muted">{dateOnly(r.created_at)}</span>
              </div>
              <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx('size-3.5', i <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-[#e6dbd1]')} />)}</span>
              {r.comment && <p className="mt-1 text-[14px] text-ink-2">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('writeReview')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => <button type="button" key={i} onClick={() => setForm({ ...form, rating: i })} aria-label={`${i}`}><Star className={cx('size-8', i <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-[#e6dbd1]')} /></button>)}
          </div>
          <Field label={t('yourName')} required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} /></Field>
          <Field label={t('reviews')}><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} maxLength={2000} /></Field>
          <Button block size="lg" loading={m.isPending}>{t('submit')}</Button>
        </form>
      </Sheet>
    </div>
  );
}
