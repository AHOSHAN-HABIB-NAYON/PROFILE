import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Gift, Lock, ShoppingBag, Sparkles, Truck, UserCheck, Wallet } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { cartPayload, useCart } from '../../lib/cart';
import { deviceId } from '../../lib/device';
import { cx, money } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useQuote } from '../../lib/quote';
import { useSettings } from '../../lib/settings';
import { fbCookies, newEventId, track, trackPurchase } from '../../lib/tracking';
import type { District } from '../../lib/types';
import { Button, Empty, Field, Input, Picture, Select, Textarea, toast } from '../../components/ui';
import { TopBar } from '../components/chrome';

interface Form { name: string; phone: string; district: string; upazila: string; address: string; note: string }
const DRAFT_KEY = 'sg_checkout_draft';

function loadDraft(): Form {
  try { return { name: '', phone: '', district: '', upazila: '', address: '', note: '', ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') }; } catch { return { name: '', phone: '', district: '', upazila: '', address: '', note: '' }; }
}

const toAscii = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));
const validPhone = (p: string) => /^01[3-9]\d{8}$/.test(toAscii(p).replace(/[^\d]/g, '').replace(/^880/, '0'));

export default function Checkout() {
  const t = useT();
  const s = useSettings();
  const navigate = useNavigate();
  const items = useCart((st) => st.items);
  const coupon = useCart((st) => st.coupon);
  const clear = useCart((st) => st.clear);
  const [form, setForm] = useState<Form>(loadDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [returning, setReturning] = useState<null | { trusted: boolean }>(null);
  const eventId = useRef(newEventId('purchase'));
  const geo = useQuery({ queryKey: ['geo'], queryFn: () => api.get<District[]>('/api/public/geo'), staleTime: Infinity });
  const { data: q, isFetching } = useQuote(form.district || null);
  const upazilas = useMemo(() => geo.data?.find((d) => d.name === form.district)?.upazilas ?? [], [geo.data, form.district]);
  const bn = s.language === 'bn';

  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, note: '' })); } catch { /* ignore */ } }, [form]);
  useEffect(() => { if (q) track('begin_checkout', { value: q.total, items: q.lines.filter((l) => !l.error).map((l) => ({ id: l.productId ?? `combo-${l.comboId}`, name: l.name, price: l.unitPrice, qty: l.qty })) }); }, [Boolean(q)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning customer: look up by phone once it is complete.
  const lastLookup = useRef('');
  useEffect(() => {
    const phone = toAscii(form.phone).replace(/[^\d]/g, '').replace(/^880/, '0');
    if (!validPhone(phone) || lastLookup.current === phone) return;
    lastLookup.current = phone;
    api.post<{ found: boolean; trusted?: boolean; suggestions?: Array<{ name: string; district: string; upazila: string; address: string }> }>('/api/public/customers/lookup', { phone, device: deviceId() })
      .then((r) => {
        if (!r.found || !r.suggestions?.[0]) return;
        const sgt = r.suggestions[0];
        setReturning({ trusted: Boolean(r.trusted) });
        setForm((f) => ({
          ...f,
          name: f.name || (r.trusted ? sgt.name : f.name),
          district: f.district || sgt.district,
          upazila: f.upazila || sgt.upazila,
          address: f.address || (r.trusted ? sgt.address : f.address),
        }));
      })
      .catch(() => { /* optional feature */ });
  }, [form.phone]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v, ...(k === 'district' ? { upazila: '' } : {}) }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (form.name.trim().length < 2) e.name = bn ? 'আপনার নাম লিখুন' : 'Please enter your name';
    if (!validPhone(form.phone)) e.phone = bn ? 'সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)' : 'Enter a valid mobile number (01XXXXXXXXX)';
    if (!form.district) e.district = t('selectDistrict');
    if (!form.upazila) e.upazila = t('selectUpazila');
    if (form.address.trim().length < 5) e.address = bn ? 'সম্পূর্ণ ঠিকানা লিখুন' : 'Please enter your full address';
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return !first;
  };

  const order = useMutation({
    mutationFn: () => api.post<{ orderNo: string; token: string; total: number }>('/api/public/checkout', {
      name: form.name.trim(), phone: toAscii(form.phone), district: form.district, upazila: form.upazila, address: form.address.trim(), note: form.note.trim() || null,
      couponCode: coupon, items: cartPayload(items), device: deviceId(), eventId: eventId.current, ...fbCookies(),
    }),
    onSuccess: (r) => {
      const lines = q?.lines.filter((l) => !l.error) ?? [];
      trackPurchase(r.orderNo, r.total, lines.map((l) => ({ id: String(l.productId ?? `combo-${l.comboId}`), name: l.name, price: l.unitPrice, qty: l.qty })), eventId.current);
      try { sessionStorage.setItem(`sg_order_${r.orderNo}`, r.token); localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, note: '' })); } catch { /* ignore */ }
      clear();
      navigate(`/order/${r.orderNo}?token=${encodeURIComponent(r.token)}&celebrate=1`, { replace: true });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.code === 'BAD_REQUEST' && e.details && typeof e.details === 'object') setErrors(e.details as Record<string, string>);
      toast.error(e.message);
    },
  });

  if (!items.length && !order.isSuccess) {
    return (
      <div>
        <TopBar title={t('checkout')} />
        <Empty icon={<ShoppingBag className="size-9" />} title={t('emptyCart')} action={<Link to="/"><Button>{t('continueShopping')}</Button></Link>} />
      </div>
    );
  }

  const deliveryLabel = q?.deliveryCharge == null ? (q ? `${money(q.deliveryOptions.insideDhaka, s.currency_symbol)} / ${money(q.deliveryOptions.outsideDhaka, s.currency_symbol)}` : '—') : q.deliveryCharge === 0 ? t('freeDelivery') : money(q.deliveryCharge, s.currency_symbol);
  const inside = (s.dhaka_districts ?? ['Dhaka']).includes(form.district);

  return (
    <div>
      <TopBar title={t('checkout')} />
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (validate()) order.mutate(); }} className="grid gap-5 px-4 md:grid-cols-[1fr_400px] md:px-0 md:pt-6">
        <div className="space-y-5">
          <h1 className="hidden text-[26px] font-extrabold tracking-tight md:block">{t('checkout')}</h1>
          <section className="card p-5">
            <h2 className="mb-4 text-[16px] font-bold">{t('deliveryInfo')}</h2>
            {returning && (
              <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-green-50 p-3 text-[13px] text-green-800">
                <UserCheck className="mt-0.5 size-4 shrink-0" />
                <span>{returning.trusted ? t('previousCustomer') : t('previousCustomerPartial')}</span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('phone')} required error={errors.phone}>
                <Input name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={set('phone')} invalid={Boolean(errors.phone)} maxLength={16} />
              </Field>
              <Field label={t('fullName')} required error={errors.name}>
                <Input name="name" autoComplete="name" value={form.name} onChange={set('name')} invalid={Boolean(errors.name)} maxLength={120} />
              </Field>
              <Field label={t('district')} required error={errors.district}>
                <Select name="district" value={form.district} onChange={set('district')} invalid={Boolean(errors.district)}>
                  <option value="">{t('selectDistrict')}</option>
                  {geo.data?.map((d) => <option key={d.name} value={d.name}>{bn && d.bn ? `${d.bn} (${d.name})` : d.name}</option>)}
                </Select>
              </Field>
              <Field label={t('upazila')} required error={errors.upazila}>
                <Select name="upazila" value={form.upazila} onChange={set('upazila')} disabled={!form.district} invalid={Boolean(errors.upazila)}>
                  <option value="">{t('selectUpazila')}</option>
                  {upazilas.map((u) => <option key={u.name} value={u.name}>{bn && u.bn ? `${u.bn} (${u.name})` : u.name}</option>)}
                </Select>
              </Field>
              <Field label={t('address')} required error={errors.address} className="sm:col-span-2">
                <Input name="address" autoComplete="street-address" placeholder={bn ? 'বাসা/হোল্ডিং, রোড, এলাকা' : 'House, road, area'} value={form.address} onChange={set('address')} invalid={Boolean(errors.address)} maxLength={500} />
              </Field>
              <Field label={t('note')} className="sm:col-span-2">
                <Textarea name="note" rows={2} className="min-h-[64px]" placeholder={t('notePlaceholder')} value={form.note} onChange={set('note')} maxLength={1000} />
              </Field>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-[16px] font-bold">{t('deliveryMethod')}</h2>
            <div className="space-y-2.5">
              <label className="flex items-center gap-3 rounded-2xl border-2 border-brand-400 bg-brand-50/60 p-3.5">
                <span className="grid size-5 place-items-center rounded-full border-2 border-brand-500"><span className="size-2.5 rounded-full bg-brand-500" /></span>
                <Wallet className="size-5 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">{t('cod')}</p>
                  <p className="text-[12px] text-muted">{t('insideDhaka')} {money(s.delivery_inside_dhaka, s.currency_symbol)} · {t('outsideDhaka')} {money(s.delivery_outside_dhaka, s.currency_symbol)}</p>
                </div>
                <span className="chip bg-brand-500 text-white">{t('mostPopular')}</span>
              </label>
              {(q?.freeDelivery || s.free_delivery_min_order > 0) && (
                <div className={cx('flex items-center gap-3 rounded-2xl border p-3.5', q?.freeDelivery ? 'border-green-300 bg-green-50' : 'border-line')}>
                  <Gift className="size-5 text-green-600" />
                  <div>
                    <p className="text-[14px] font-bold text-green-800">{t('freeDelivery')}</p>
                    {s.free_delivery_min_order > 0 && <p className="text-[12px] text-muted">{t('minOrder')} {money(s.free_delivery_min_order, s.currency_symbol)}</p>}
                  </div>
                </div>
              )}
              {s.cod_note && <p className="flex items-center gap-2 px-1 text-[12.5px] text-muted"><Truck className="size-4" />{s.cod_note}{form.district && ` · ${inside ? s.delivery_time_inside : s.delivery_time_outside}`}</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-3 md:sticky md:top-28 md:self-start">
          <section className={cx('card p-5 transition-opacity', isFetching && 'opacity-75')}>
            <h2 className="mb-3 text-[16px] font-bold">{t('orderSummary')}</h2>
            <ul className="space-y-3">
              {(q?.lines ?? []).map((l) => (
                <li key={l.key} className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <Picture path={l.image} alt={l.name} size="thumb" className="size-14 rounded-xl" />
                    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{l.qty}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] font-semibold">{l.name}</p>
                    {(l.size || l.color) && <p className="text-[11.5px] text-muted">{[l.color, l.size].filter(Boolean).join(' · ')}</p>}
                    {l.error && <p className="text-[11.5px] font-semibold text-danger">{l.error}</p>}
                  </div>
                  <span className="text-[13.5px] font-bold tabular-nums">{money(l.lineTotal, s.currency_symbol)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 border-t border-line pt-3 text-[14px] text-ink-2">
              <div className="flex justify-between"><span>{t('subtotal')} ({q?.itemCount ?? 0} {t('items')})</span><span className="font-semibold tabular-nums">{money(q?.subtotal ?? 0, s.currency_symbol)}</span></div>
              {Boolean(q?.discount) && <div className="flex justify-between text-danger"><span>{t('discount')} {q?.coupon && `(${q.coupon.code})`}</span><span className="font-semibold tabular-nums">- {money(q!.discount, s.currency_symbol)}</span></div>}
              <div className="flex justify-between"><span>{t('deliveryCharge')}</span><span className="font-semibold tabular-nums">{deliveryLabel}</span></div>
              <div className="flex items-center justify-between border-t border-line pt-3 text-ink"><span className="text-[16px] font-bold">{t('total')}</span><span className="text-[22px] font-extrabold tabular-nums">{money(q?.deliveryCharge == null ? (q?.subtotal ?? 0) - (q?.discount ?? 0) : q.total, s.currency_symbol)}</span></div>
            </div>
            {coupon && q?.couponError && <p className="mt-2 text-[12.5px] font-semibold text-danger">{q.couponError}</p>}
          </section>
          <Button type="submit" size="lg" block className="cta-glow h-14 text-[16px]" loading={order.isPending} disabled={!q || q.errors.length > 0} icon={!order.isPending ? <Sparkles className="size-5" /> : undefined}>
            {order.isPending ? t('placingOrder') : t('confirmOrder')}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted"><Lock className="size-3.5" /> {t('cod')} · {s.site_name}</p>
        </aside>
      </form>
    </div>
  );
}
