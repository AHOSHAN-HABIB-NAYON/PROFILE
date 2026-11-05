import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Icon, type IconName } from '../components/Icon';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic, isNative } from '../lib/platform';
import { billing, buyPremium, manageUrl, restorePremium } from '../lib/premium';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

type Info = { enabled: boolean; productId: string; premium: boolean; until: string | null; forever: boolean; canBuy: boolean; subscribed?: boolean };

export const PREMIUM_PERKS: { icon: IconName; en: string; bn: string; soon?: boolean }[] = [
  { icon: 'phone', en: 'Audio calls — groups up to 4', bn: 'অডিও কল — ৪ জন পর্যন্ত গ্রুপ কল' },
  { icon: 'mic', en: 'Talk live in quiz & Ludo games', bn: 'কুইজ ও লুডু খেলায় লাইভ কথা' },
  { icon: 'message', en: 'Voice messages in chat', bn: 'চ্যাটে ভয়েস মেসেজ' },
  { icon: 'image', en: 'Send photos in chat', bn: 'চ্যাটে ছবি পাঠানো' },
  { icon: 'book', en: 'All premium question collections', bn: 'সব প্রিমিয়াম প্রশ্ন কালেকশন' },
  { icon: 'crown', en: 'Gold premium badge by your name', bn: 'নামের পাশে সোনালি প্রিমিয়াম ব্যাজ' },
  { icon: 'video', en: 'Video calls (groups up to 4)', bn: 'ভিডিও কল (৪ জন পর্যন্ত)' },
];

const PERIOD: Record<string, [string, string]> = { P1W: ['week', 'সপ্তাহ'], P1M: ['month', 'মাস'], P3M: ['3 months', '৩ মাস'], P6M: ['6 months', '৬ মাস'], P1Y: ['year', 'বছর'] };

export default function Premium() {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const cfg = useConfig().data;
  const info = useQuery({ queryKey: ['premium'], queryFn: () => api<Info>('/premium') });
  const productId = info.data?.productId ?? cfg?.premiumProductId ?? 'premium_monthly';
  const price = useQuery({ queryKey: ['premium-price', productId], queryFn: () => billing!.details({ productId }), enabled: !!billing && !!info.data?.enabled, staleTime: 10 * 60_000, retry: 1 });
  const [busy, setBusy] = useState<'buy' | 'redeem' | 'restore' | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    void restorePremium().then((ok) => ok && void info.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const premium = !!me.premium;
  const until = me.premiumUntil ? new Date(me.premiumUntil) : null;
  const dateText = until ? new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(until) : '';
  const period = PERIOD[price.data?.period ?? 'P1M'] ?? PERIOD.P1M!;

  const buy = async () => {
    haptic('tap');
    setBusy('buy');
    try {
      const r = await buyPremium(productId);
      if (r.ok) {
        sfx('reward');
        haptic('success');
        toast.success(t('Welcome to Premium!', 'প্রিমিয়ামে স্বাগতম!'), t('Everything is unlocked now.', 'এখন সব চালু হয়ে গেছে।'), 'crown');
      } else if (r.pending) toast.info(t('Payment pending', 'পেমেন্ট অপেক্ষায়'), t('Premium starts as soon as Google Play confirms the payment.', 'Google Play পেমেন্ট নিশ্চিত করলেই প্রিমিয়াম চালু হবে।'), 'hourglass');
      void qc.invalidateQueries({ queryKey: ['premium'] });
    } catch (e: any) {
      if (e?.code !== 'cancelled') toast.error(t('Could not buy', 'কেনা গেল না'), e?.code === 'already_owned' ? t('You already have it — tap Restore.', 'আগেই কেনা আছে — Restore চাপুন।') : friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const redeem = async () => {
    if (code.trim().length < 6) return;
    setBusy('redeem');
    try {
      const r = await api<{ days: number; user: any }>('/premium/redeem', { body: { code: code.trim() } });
      if (r.user) useAuth.getState().setUser(r.user);
      setCode('');
      sfx('reward');
      haptic('success');
      toast.success(t(`${r.days} days of Premium added!`, `${num(r.days, lang)} দিনের প্রিমিয়াম যোগ হয়েছে!`), undefined, 'gift');
      void qc.invalidateQueries({ queryKey: ['premium'] });
    } catch (e) {
      haptic('error');
      toast.error(t('Code not accepted', 'কোডটি কাজ করেনি'), friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const restore = async () => {
    setBusy('restore');
    const ok = await restorePremium(true);
    setBusy(null);
    toast.info(ok ? t('Premium restored', 'প্রিমিয়াম ফিরে এসেছে') : t('No active subscription found', 'চালু কোনো সাবস্ক্রিপশন পাওয়া যায়নি'), undefined, ok ? 'crown' : 'info');
  };

  return (
    <div className="page stack premium-page">
      <PageHeader title={t('Premium', 'প্রিমিয়াম')} back />
      <section className={`pm-hero${premium ? ' on' : ''}`}>
        <span className="pm-crown" aria-hidden><Icon name="crown" size={44} strokeWidth={1.8} /></span>
        <h1>QUIZ WAR <b>Premium</b></h1>
        {premium ? (
          <p className="pm-status"><Icon name="check" size={16} /> {me.premiumForever ? t('Premium for good', 'আজীবন প্রিমিয়াম') : t(`Active until ${dateText}`, `${dateText} পর্যন্ত চালু`)}</p>
        ) : (
          <p className="pm-sub">{t('Talk, call and share — unlock everything for a small monthly price.', 'কথা বলুন, কল করুন, ছবি পাঠান — অল্প টাকায় এক মাস সব চালু।')}</p>
        )}
      </section>

      <ul className="pm-perks">
        {PREMIUM_PERKS.map((p) => (
          <li key={p.en}>
            <span className="pm-ic"><Icon name={p.icon} size={20} /></span>
            <span className="grow">{t(p.en, p.bn)}</span>
            {p.soon ? <span className="pm-soon">{t('Soon', 'শীঘ্রই')}</span> : <Icon name="check" size={18} className="pm-tick" />}
          </li>
        ))}
      </ul>
      <p className="xs muted pm-free"><Icon name="message" size={14} /> {t('Text chat and all games stay free for everyone.', 'টেক্সট চ্যাট আর সব খেলা সবার জন্য ফ্রি থাকবে।')}</p>

      {info.data?.enabled === false ? (
        <p className="card small muted" style={{ textAlign: 'center' }}>{t('Premium is not on sale yet. Everything is free for now!', 'প্রিমিয়াম এখনো বিক্রি শুরু হয়নি। এখন সব ফ্রি!')}</p>
      ) : premium && info.data?.subscribed ? (
        <button className="btn outline block" onClick={() => void window.open(manageUrl(productId), '_blank', 'noopener')}><Icon name="settings" /> {t('Manage subscription in Google Play', 'Google Play-তে সাবস্ক্রিপশন দেখুন')}</button>
      ) : !premium && isNative ? (
        <div className="pm-buy">
          <button className="btn pm-cta block" disabled={busy !== null} onClick={() => void buy()}>
            {busy === 'buy' ? <span className="spinner" /> : <Icon name="crown" />}{' '}
            {price.data?.price ? t(`Get Premium · ${price.data.price}/${period[0]}`, `প্রিমিয়াম নিন · ${price.data.price}/${period[1]}`) : t('Get Premium', 'প্রিমিয়াম নিন')}
          </button>
          <p className="xs muted" style={{ textAlign: 'center' }}>
            {t('Paid through Google Play. Renews every month until you cancel in Google Play.', 'Google Play-এর মাধ্যমে পেমেন্ট। Google Play থেকে বন্ধ না করা পর্যন্ত প্রতি মাসে নিজে থেকে রিনিউ হবে।')}
          </p>
          <button className="btn ghost sm" style={{ alignSelf: 'center' }} disabled={busy !== null} onClick={() => void restore()}>
            {busy === 'restore' ? <span className="spinner" /> : <Icon name="refresh" size={16} />} {t('Restore purchase', 'আগের কেনা ফিরিয়ে আনুন')}
          </button>
        </div>
      ) : !premium || !isNative ? (
        !premium && <p className="card small" style={{ textAlign: 'center' }}>
          <Icon name="smartphone" size={18} /> {t('Buy Premium in the QUIZ WAR app from Google Play.', 'Google Play থেকে QUIZ WAR অ্যাপে প্রিমিয়াম কিনুন।')}
        </p>
      ) : null}

      <section className="card pm-redeem">
        <h3 className="row gap-sm"><Icon name="gift" size={18} /> {t('Have a code?', 'কোড আছে?')}</h3>
        <form className="row" onSubmit={(e) => (e.preventDefault(), void redeem())}>
          <input className="input grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Enter code', 'কোড লিখুন')} maxLength={24} autoCapitalize="characters" aria-label={t('Premium code', 'প্রিমিয়াম কোড')} />
          <button className="btn primary" disabled={busy !== null || code.trim().length < 6}>{busy === 'redeem' ? <span className="spinner" /> : t('Redeem', 'নিন')}</button>
        </form>
        <p className="xs muted">{t('Win codes in our giveaways. Days are added to your Premium.', 'আমাদের গিভঅ্যাওয়েতে কোড জিতুন। দিনগুলো আপনার প্রিমিয়ামে যোগ হবে।')}</p>
      </section>
      {(cfg?.monthlyPremiumTop ?? 0) > 0 && (
        <p className="xs muted" style={{ textAlign: 'center' }}><Icon name="trophy" size={14} /> {t(`The top ${cfg!.monthlyPremiumTop} players of each month get 30 days free.`, `প্রতি মাসের সেরা ${num(cfg!.monthlyPremiumTop ?? 0, lang)} জন প্লেয়ার ৩০ দিন ফ্রি পায়।`)}</p>
      )}
    </div>
  );
}
