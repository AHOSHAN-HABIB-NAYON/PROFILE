import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Heart, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { useCart, useWishlist } from '../../lib/cart';
import { cx, money } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useQuote } from '../../lib/quote';
import { useSettings } from '../../lib/settings';
import { Button, Empty, Picture, QtyStepper, useConfirm } from '../../components/ui';
import { TopBar } from '../components/chrome';

export default function Cart() {
  const t = useT();
  const s = useSettings();
  const navigate = useNavigate();
  const { items, setQty, remove, clear, coupon, setCoupon } = useCart();
  const toggleWish = useWishlist((w) => w.toggle);
  const wished = useWishlist((w) => w.ids);
  const { data: q, isFetching } = useQuote(null);
  const [code, setCode] = useState(coupon ?? '');
  const { confirm, dialog } = useConfirm();
  useEffect(() => setCode(coupon ?? ''), [coupon]);

  if (!items.length) {
    return (
      <div>
        <TopBar title={t('myCart')} />
        <Empty icon={<ShoppingBag className="size-9" />} title={t('emptyCart')} action={<Link to="/"><Button>{t('continueShopping')}</Button></Link>} />
      </div>
    );
  }
  const lineFor = (key: string) => q?.lines.find((l) => l.key === key);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const deliveryPreview = q ? (q.freeDelivery ? 0 : q.deliveryOptions.insideDhaka) : null;
  return (
    <div>
      <TopBar title={t('myCart')} subtitle={`${count} ${t('items')}`} right={<button onClick={async () => { if (await confirm(t('clearAll') + '?', { danger: true })) clear(); }} className="px-3 text-[13px] font-bold text-brand-600">{t('clearAll')}</button>} />
      <div className="grid gap-5 px-4 md:grid-cols-[1fr_380px] md:px-0 md:pt-6">
        <div className="space-y-3">
          <h1 className="hidden text-[26px] font-extrabold tracking-tight md:block">{t('myCart')} <span className="text-[16px] font-semibold text-muted">({count} {t('items')})</span></h1>
          {items.map((it) => {
            const line = lineFor(it.key);
            const price = line?.unitPrice ?? it.price;
            return (
              <div key={it.key} className={cx('card flex gap-3 p-3', line?.error && 'ring-2 ring-danger/30')}>
                <Link to={it.comboId ? `/combo/${it.slug}` : `/product/${it.slug}`} className="shrink-0"><Picture path={line?.image ?? it.image} alt={it.name} size="thumb" className="size-[88px] rounded-2xl" /></Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start gap-2">
                    <Link to={it.comboId ? `/combo/${it.slug}` : `/product/${it.slug}`} className="line-clamp-2 flex-1 text-[14px] leading-snug font-semibold">{it.name}</Link>
                    {it.productId && <button onClick={() => toggleWish(it.productId!)} className={cx('p-1', wished.includes(it.productId) ? 'text-danger' : 'text-muted')} aria-label={t('wishlist')}><Heart className={cx('size-[18px]', wished.includes(it.productId) && 'fill-current')} /></button>}
                    <button onClick={() => remove(it.key)} className="p-1 text-muted hover:text-danger" aria-label={t('remove')}><Trash2 className="size-[18px]" /></button>
                  </div>
                  {it.variantLabel && <p className="text-[12px] text-muted">{it.variantLabel}</p>}
                  {line?.error && <p className="text-[12px] font-semibold text-danger">{line.error}</p>}
                  <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                    <div>
                      <span className="text-[16px] font-extrabold">{money(price, s.currency_symbol)}</span>
                      {line && line.regularPrice > price && <span className="ml-1.5 text-[12px] text-muted line-through">{money(line.regularPrice, s.currency_symbol)}</span>}
                    </div>
                    <QtyStepper size="sm" value={it.qty} onChange={(v) => setQty(it.key, v)} max={Math.max(1, line?.maxQty ?? s.max_order_quantity ?? 10)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 md:sticky md:top-28 md:self-start">
          {s.coupons_enabled && (
            <form className="card flex items-center gap-2 p-2 pl-4" onSubmit={(e) => { e.preventDefault(); setCoupon(code.trim().toUpperCase() || null); }}>
              <Tag className="size-5 shrink-0 text-brand-500" />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('couponPlaceholder')} className="min-w-0 flex-1 bg-transparent py-2 text-[14px] uppercase outline-none placeholder:normal-case" />
              {coupon ? <Button type="button" size="sm" variant="ghost" onClick={() => { setCoupon(null); setCode(''); }}>{t('remove')}</Button> : <Button size="sm" variant="soft">{t('apply')}</Button>}
            </form>
          )}
          {coupon && q?.couponError && <p className="px-2 text-[13px] font-semibold text-danger">{q.couponError}</p>}
          {coupon && q?.coupon && <p className="px-2 text-[13px] font-semibold text-green-700">✓ {t('couponApplied')}: {q.coupon.code}</p>}
          <div className={cx('card space-y-2.5 p-5 text-[14px] transition-opacity', isFetching && 'opacity-70')}>
            <Row label={t('subtotal')} value={money(q?.subtotal ?? 0, s.currency_symbol)} />
            {Boolean(q?.discount) && <Row label={t('discount')} value={`- ${money(q!.discount, s.currency_symbol)}`} className="text-danger" />}
            <Row label={t('deliveryCharge')} value={deliveryPreview === 0 ? t('freeDelivery') : deliveryPreview != null ? `${money(q!.deliveryOptions.insideDhaka, s.currency_symbol)} – ${money(q!.deliveryOptions.outsideDhaka, s.currency_symbol)}` : '—'} />
            <div className="h-px bg-line" />
            <Row label={<span className="text-[16px] font-bold text-ink">{t('total')}</span>} value={<span className="text-[20px] font-extrabold text-ink">{money((q?.subtotal ?? 0) - (q?.discount ?? 0) + (deliveryPreview ?? 0), s.currency_symbol)}</span>} />
          </div>
          <Button size="lg" block className="cta-glow" disabled={!q || q.lines.every((l) => l.error)} onClick={() => navigate('/checkout')}>{t('proceedCheckout')} <ArrowRight className="size-4" /></Button>
        </div>
      </div>
      {dialog}
    </div>
  );
}

function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return <div className={cx('flex items-center justify-between gap-3 text-ink-2', className)}><span>{label}</span><span className="font-semibold tabular-nums">{value}</span></div>;
}
