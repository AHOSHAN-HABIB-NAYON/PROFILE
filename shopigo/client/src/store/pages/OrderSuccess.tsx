import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { Headset, PackageSearch, ShoppingBag } from 'lucide-react';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { Button, Empty, PageSpinner, Picture } from '../../components/ui';
import { FaIcon } from '../../components/CategoryIcon';
import { whatsappLink } from '../components/chrome';
import { CourierAnimation } from '../components/CourierAnimation';

interface PublicOrder {
  orderNo: string; status: string; statusLabel: string; customerName: string; phone: string; district: string; upazila: string; address: string;
  subtotal: number; discount: number; deliveryCharge: number; total: number; itemCount: number; createdAt: string;
  items: Array<{ name: string; size: string | null; color: string | null; image: string | null; unitPrice: number; qty: number; lineTotal: number }>;
}

export default function OrderSuccess() {
  const t = useT();
  const s = useSettings();
  const { orderNo = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const token = params.get('token') || (() => { try { return sessionStorage.getItem(`sg_order_${orderNo}`) ?? ''; } catch { return ''; } })();
  const [animating, setAnimating] = useState(params.get('celebrate') === '1');
  const { data: o, isLoading, error } = useQuery({ queryKey: ['order', orderNo, token], queryFn: () => api.get<PublicOrder>(`/api/public/orders/${orderNo}?token=${encodeURIComponent(token)}`), enabled: Boolean(token) });
  const finish = useCallback(() => {
    setAnimating(false);
    const p = new URLSearchParams(params);
    p.delete('celebrate');
    setParams(p, { replace: true });
  }, [params, setParams]);

  if (animating) return <CourierAnimation onDone={finish} label={s.language === 'bn' ? 'আপনার অর্ডার প্রস্তুত হচ্ছে…' : 'Preparing your order…'} />;
  if (isLoading) return <PageSpinner />;
  if (!o || error) return <Empty icon={<PackageSearch className="size-9" />} title={t('notFound')} action={<Link to="/track"><Button>{t('trackOrder')}</Button></Link>} />;

  const message = (s.whatsapp_order_message || 'Order ID: {order_id}').replace(/\{order_id\}/g, o.orderNo);
  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-10 md:pt-12">
      <div className="relative mx-auto mb-2 grid h-44 w-56 place-items-center">
        <Confetti />
        <div className="relative animate-[var(--animate-pop)]">
          <svg width="150" height="130" viewBox="0 0 150 130" aria-hidden="true">
            <defs>
              <linearGradient id="bx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd9b8" /><stop offset="1" stopColor="#f2b27f" /></linearGradient>
              <linearGradient id="bxs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#eaa06a" /><stop offset="1" stopColor="#d98b54" /></linearGradient>
            </defs>
            <ellipse cx="75" cy="122" rx="52" ry="6" fill="#c9824f" opacity=".2" />
            <path d="M20 52 L75 34 L130 52 L130 104 L75 122 L20 104 Z" fill="url(#bx)" />
            <path d="M75 70 L130 52 L130 104 L75 122 Z" fill="url(#bxs)" />
            <path d="M20 52 L75 70 L130 52 L75 34 Z" fill="#ffe7d2" />
            <path d="M20 52 L6 70 L61 88 L75 70 Z" fill="#ffcfa6" />
            <path d="M130 52 L144 70 L89 88 L75 70 Z" fill="#f0b07c" />
          </svg>
          <span className="absolute -top-4 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[var(--shadow-float)] ring-4 ring-white">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: 'draw .5s .25s ease-out forwards' }} /></svg>
          </span>
        </div>
        <style>{'@keyframes draw { to { stroke-dashoffset: 0 } }'}</style>
      </div>
      <div className="bn text-center">
        <h1 className="text-[27px] font-bold text-ink">অর্ডার নিশ্চিত হয়েছে</h1>
        <p className="mt-1 text-[16px] text-ink-2">আমাদের সাথে শপিং করার জন্য ধন্যবাদ ❤️</p>
        <p className="mt-0.5 text-[14px] text-muted">আমাদের একজন প্রতিনিধি আপনাকে কল করবেন।</p>
      </div>

      <div className="card mt-6 p-5 text-[14px]">
        <dl className="space-y-2">
          <div className="flex justify-between gap-3"><dt className="text-muted">{t('orderId')}</dt><dd className="font-bold tabular-nums">#{o.orderNo}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">{t('customerName')}</dt><dd className="font-semibold">{o.customerName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">{t('phone')}</dt><dd className="font-semibold tabular-nums">{o.phone}</dd></div>
        </dl>
        <p className="mt-4 mb-2 font-bold">{t('orderedProducts')}</p>
        <ul className="space-y-2.5">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3">
              <Picture path={it.image} alt={it.name} size="thumb" className="size-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1"><span className="line-clamp-1 font-medium">{it.name}</span>{(it.size || it.color) && <span className="text-[12px] text-muted">{[it.color, it.size].filter(Boolean).join(' · ')}</span>}</span>
              <span className="text-muted">× {it.qty}</span>
              <span className="w-20 text-right font-semibold tabular-nums">{money(it.lineTotal, s.currency_symbol)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-ink-2">
          {o.discount > 0 && <div className="flex justify-between"><span>{t('discount')}</span><span className="tabular-nums">- {money(o.discount, s.currency_symbol)}</span></div>}
          <div className="flex justify-between"><span>{t('deliveryCharge')}</span><span className="tabular-nums">{o.deliveryCharge ? money(o.deliveryCharge, s.currency_symbol) : t('freeDelivery')}</span></div>
          <div className="flex justify-between pt-1 text-ink"><span className="text-[15px] font-bold">{t('total')}</span><span className="text-[19px] font-extrabold tabular-nums">{money(o.total, s.currency_symbol)}</span></div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Link to="/" className="block"><Button size="lg" block className="cta-glow" icon={<ShoppingBag className="size-5" />}>{t('shoppingContinue')}</Button></Link>
        {s.whatsapp_number && (
          <a href={whatsappLink(s.whatsapp_number, message)} target="_blank" rel="noopener noreferrer" className="press flex items-center gap-3 rounded-2xl border-2 border-[#25D366] bg-surface px-4 py-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#25D366] text-white"><FaIcon name="fa-brands fa-whatsapp" className="text-[22px]" /></span>
            <span className="flex-1"><span className="block font-bold text-[#128C4B]">{t('whatsappSupport')}</span><span className="text-[12px] text-muted">{t('clickToMessage')}</span></span>
          </a>
        )}
        <Link to="/contact" className="block"><Button variant="ghost" block icon={<Headset className="size-5" />}>{t('support')}</Button></Link>
      </div>
      <p className="bn mt-6 text-center text-[14px] text-muted">ধন্যবাদ, আবার আসবেন! ❤️</p>
    </div>
  );
}

function Confetti() {
  const colors = ['#f26b3a', '#ffb088', '#34c38f', '#5b8def', '#f7c948', '#e05297'];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <style>{'@keyframes sg-conf { 0% { transform: translate(0,0) scale(.4); opacity: 0 } 25% { opacity: 1 } 100% { transform: translate(var(--x), var(--y)) scale(1) rotate(200deg); opacity: 0 } }'}</style>
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const r = 90 + (i % 3) * 18;
        return (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-sm"
            style={{ width: i % 2 ? 6 : 8, height: i % 2 ? 10 : 6, background: colors[i % colors.length], ['--x' as string]: `${Math.cos(angle) * r}px`, ['--y' as string]: `${Math.sin(angle) * r * 0.7}px`, animation: `sg-conf 1.4s ${0.1 + (i % 5) * 0.05}s cubic-bezier(.2,.8,.3,1) both` }}
          />
        );
      })}
    </div>
  );
}
