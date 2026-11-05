import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic, isNative, PUBLIC_WEB_URL, share } from '../lib/platform';
import { billing, buyPremium, manageUrl, restorePremium } from '../lib/premium';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

type Referral = { enabled: boolean; days: number; bigCount: number; bigDays: number; joined: number; played: number };
type Info = {
  enabled: boolean;
  productId: string;
  premium: boolean;
  until: string | null;
  forever: boolean;
  canBuy: boolean;
  subscribed?: boolean;
  referral?: Referral;
  plans?: { monthly: string; yearly: string };
};
type PlanId = 'monthly' | 'yearly';

export const PREMIUM_PERKS: { icon: IconName; en: string; bn: string; den: string; dbn: string }[] = [
  { icon: 'video', en: 'Video calls', bn: 'ভিডিও কল', den: 'HD video with friends, groups up to 4. Phone to phone, never recorded.', dbn: 'বন্ধুদের সাথে HD ভিডিও, ৪ জন পর্যন্ত গ্রুপ। সরাসরি ফোনে ফোনে, রেকর্ড হয় না।' },
  { icon: 'phone', en: 'Audio & group calls', bn: 'অডিও ও গ্রুপ কল', den: 'Call any friend; rings even on a locked phone. Add up to 4 people.', dbn: 'যেকোনো বন্ধুকে কল; লক ফোনেও রিং হয়। ৪ জন পর্যন্ত যোগ করুন।' },
  { icon: 'mic', en: 'Talk live in quiz & Ludo', bn: 'কুইজ ও লুডুতে লাইভ কথা', den: 'Turn on your mic in matches and rooms. Everyone can always listen.', dbn: 'ম্যাচ আর রুমে নিজের মাইক চালু করুন। শোনা সবার জন্য ফ্রি।' },
  { icon: 'message', en: 'Voice messages', bn: 'ভয়েস মেসেজ', den: 'Hold the mic in chat to send a voice message.', dbn: 'চ্যাটে মাইক চেপে ধরে ভয়েস মেসেজ পাঠান।' },
  { icon: 'image', en: 'Photos in chat', bn: 'চ্যাটে ছবি', den: 'Send photos from the gallery or camera.', dbn: 'গ্যালারি বা ক্যামেরা থেকে ছবি পাঠান।' },
  { icon: 'book', en: 'Premium collections', bn: 'প্রিমিয়াম কালেকশন', den: 'All previous-year question sets unlocked.', dbn: 'আগের বছরের সব প্রশ্নের সেট খোলা।' },
  { icon: 'crown', en: 'Gold premium badge', bn: 'সোনালি প্রিমিয়াম ব্যাজ', den: 'A gold badge next to your name everywhere.', dbn: 'সব জায়গায় নামের পাশে সোনালি ব্যাজ।' },
];

export default function Premium() {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const cfg = useConfig().data;
  const info = useQuery({ queryKey: ['premium'], queryFn: () => api<Info>('/premium') });
  const productId = info.data?.productId ?? cfg?.premiumProductId ?? 'quizwar_premium';
  const play = useQuery({ queryKey: ['premium-price', productId], queryFn: () => billing!.details({ productId }), enabled: !!billing && !!info.data?.enabled, staleTime: 10 * 60_000, retry: 1 });
  const [plan, setPlan] = useState<PlanId>('yearly');
  const [busy, setBusy] = useState<'buy' | 'redeem' | 'restore' | null>(null);
  const [code, setCode] = useState('');
  const [allPerks, setAllPerks] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    void restorePremium().then((ok) => ok && void info.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const premium = !!me.premium;
  const until = me.premiumUntil ? new Date(me.premiumUntil) : null;
  const daysLeft = until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400_000)) : 0;
  const dateText = until ? new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(until) : '';
  const playPlan = (id: PlanId) => play.data?.plans?.find((p) => p.basePlanId === id || (id === 'yearly' ? p.period === 'P1Y' : p.period === 'P1M'));
  const priceOf = (id: PlanId) => playPlan(id)?.price ?? (id === 'monthly' ? info.data?.plans?.monthly ?? '৳150' : info.data?.plans?.yearly ?? '৳1200');
  const save = (() => {
    const m = playPlan('monthly')?.micros, y = playPlan('yearly')?.micros;
    const pct = m && y ? Math.round((1 - y / (m * 12)) * 100) : 33;
    return pct > 0 ? pct : 0;
  })();
  const ref = info.data?.referral;
  const inviteLink = `${PUBLIC_WEB_URL.replace(/\/$/, '')}/?ref=${me.uid}`;

  const buy = async () => {
    haptic('tap');
    setBusy('buy');
    try {
      const r = await buyPremium(productId, playPlan(plan)?.basePlanId ?? plan);
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
  const copyCode = () => void navigator.clipboard?.writeText(me.uid).then(() => (haptic('tap'), toast.success(t('Code copied', 'কোড কপি হয়েছে'), me.uid, 'copy')));
  const shareInvite = async () => {
    haptic('tap');
    const r = await share({
      title: 'QUIZ WAR Bangladesh',
      text: t(
        `Play quiz & Ludo with me on QUIZ WAR! Use my invite code ${me.uid} when you sign up — new players get ${cfg?.premiumTrialDays ?? 7} days of Premium free.`,
        `QUIZ WAR-এ আমার সাথে কুইজ আর লুডু খেলো! অ্যাকাউন্ট খোলার সময় আমার ইনভাইট কোড ${me.uid} দিও — নতুনরা ${cfg?.premiumTrialDays ?? 7} দিন প্রিমিয়াম ফ্রি পায়।`,
      ),
      url: inviteLink,
    });
    if (r === 'copied') toast.success(t('Copied — paste it anywhere', 'কপি হয়েছে — যেকোনো জায়গায় পেস্ট করুন'), undefined, 'copy');
  };

  const off = info.data?.enabled === false;
  const canBuy = !off && !info.data?.subscribed && !me.premiumForever && (!premium || me.premiumTrial || daysLeft <= 7);
  const perks = allPerks ? PREMIUM_PERKS : PREMIUM_PERKS.slice(0, 3);
  const close = () => (window.history.length > 1 ? nav(-1) : nav('/', { replace: true }));
  return (
    <div className={`pm2${canBuy ? ' has-buy' : ''}`}>
      <header className="pm2-top">
        <button type="button" className="pm2-x" onClick={close} aria-label={t('Close', 'বন্ধ করুন')}><Icon name="close" size={22} /></button>
        <span className="pm2-logo"><Icon name="crown" size={26} /></span>
        <span className="pm2-x ghost" />
      </header>
      <h1 className="pm2-title">{t('One subscription.', 'একটা সাবস্ক্রিপশন।')}<br />{t('Everything unlocked.', 'সব সুবিধা চালু।')}</h1>
      {premium ? (
        <p className="pm2-status">
          <Icon name="check" size={16} />{' '}
          {me.premiumForever
            ? t('Premium for good', 'আজীবন প্রিমিয়াম')
            : me.premiumTrial
              ? t(`Free trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, `ফ্রি ট্রায়াল · আর ${num(daysLeft, lang)} দিন`)
              : t(`Premium until ${dateText}`, `${dateText} পর্যন্ত প্রিমিয়াম`)}
        </p>
      ) : (
        <p className="pm2-sub">{t('Video calls, voice and live talk in QUIZ WAR.', 'QUIZ WAR-এ ভিডিও কল, ভয়েস আর লাইভ কথা।')}</p>
      )}

      <section className="pm2-perks">
        <p className="pm2-label"><Icon name="crown" size={14} /> {t('Premium benefits', 'প্রিমিয়াম সুবিধা')}</p>
        <ul>
          {perks.map((p) => (
            <li key={p.en}>
              <span className="pm-ic"><Icon name={p.icon} size={20} /></span>
              <span className="grow">
                <b>{t(p.en, p.bn)}</b>
                {allPerks && <small>{t(p.den, p.dbn)}</small>}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="pm2-more" onClick={() => (haptic('tap'), setAllPerks((v) => !v))} aria-expanded={allPerks}>
          {allPerks ? t('Show less', 'কম দেখুন') : t(`See all ${PREMIUM_PERKS.length} benefits`, `সব ${num(PREMIUM_PERKS.length, lang)}টি সুবিধা দেখুন`)}
          <Icon name="chevron-down" size={18} className={allPerks ? 'up' : ''} />
        </button>
        <p className="xs muted pm-free"><Icon name="message" size={14} /> {t('Text chat and all games stay free for everyone.', 'টেক্সট চ্যাট আর সব খেলা সবার জন্য ফ্রি।')}</p>
      </section>

      {off && <p className="pm2-note">{t('Premium is not on sale yet. Everything is free for now!', 'প্রিমিয়াম এখনো বিক্রি শুরু হয়নি। এখন সব ফ্রি!')}</p>}
      {!off && premium && info.data?.subscribed && (
        <button className="btn outline block pm2-manage" onClick={() => void window.open(manageUrl(productId), '_blank', 'noopener')}><Icon name="settings" /> {t('Manage subscription in Google Play', 'Google Play-তে সাবস্ক্রিপশন দেখুন')}</button>
      )}

      {ref?.enabled && (
        <section className="pm-invite">
          <div className="pi-head">
            <span className="pi-ic" aria-hidden><Icon name="gift" size={26} /></span>
            <div className="grow">
              <h3>{t('Invite friends, get Premium free', 'বন্ধু ইনভাইট করুন, প্রিমিয়াম ফ্রি নিন')}</h3>
              <p>{t(`Each friend who joins with your code and plays 1 game: +${ref.days} days. ${ref.bigCount} friends: ${ref.bigDays >= 365 ? '1 year' : `${ref.bigDays} days`} free!`, `আপনার কোড দিয়ে কেউ যোগ দিয়ে ১টা খেলা খেললেই +${num(ref.days, lang)} দিন। ${num(ref.bigCount, lang)} জন হলে ${ref.bigDays >= 365 ? '১ বছর' : `${num(ref.bigDays, lang)} দিন`} ফ্রি!`)}</p>
            </div>
          </div>
          <div className="pi-code">
            <span className="grow"><small>{t('Your invite code', 'আপনার ইনভাইট কোড')}</small><b>{me.uid}</b></span>
            <button type="button" className="btn sm soft" onClick={copyCode}><Icon name="copy" size={16} /> {t('Copy', 'কপি')}</button>
            <button type="button" className="btn sm pi-share" onClick={() => void shareInvite()}><Icon name="share" size={16} /> {t('Share', 'শেয়ার')}</button>
          </div>
          <div className="pi-progress" role="progressbar" aria-valuemin={0} aria-valuemax={ref.bigCount} aria-valuenow={ref.played} aria-label={t('Friends who played', 'যে বন্ধুরা খেলেছে')}>
            <span style={{ width: `${Math.min(100, (ref.played / ref.bigCount) * 100)}%` }} />
          </div>
          <div className="pi-stats">
            <span><b>{num(ref.joined, lang)}</b> {t('joined', 'জন যোগ দিয়েছে')}</span>
            <span><b>{num(ref.played, lang)}</b>/{num(ref.bigCount, lang)} {t('played', 'জন খেলেছে')}</span>
            <span><b>+{num(ref.played * ref.days, lang)}</b> {t('days earned', 'দিন পেয়েছেন')}</span>
          </div>
          <p className="xs pi-note">{t('One reward per phone. Friends enter your code when they set up their profile.', 'এক ফোন থেকে একবারই পুরস্কার। বন্ধুরা প্রোফাইল খোলার সময় আপনার কোড দেবে।')}</p>
        </section>
      )}

      <section className="pm2-redeem">
        <p className="pm2-label"><Icon name="ticket" size={14} /> {t('Have a premium code?', 'প্রিমিয়াম কোড আছে?')}</p>
        <form className="row" onSubmit={(e) => (e.preventDefault(), void redeem())}>
          <input className="input grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Enter code', 'কোড লিখুন')} maxLength={24} autoCapitalize="characters" aria-label={t('Premium code', 'প্রিমিয়াম কোড')} />
          <button className="btn primary" disabled={busy !== null || code.trim().length < 6}>{busy === 'redeem' ? <span className="spinner" /> : t('Redeem', 'নিন')}</button>
        </form>
        {(cfg?.monthlyPremiumTop ?? 0) > 0 && (
          <p className="xs muted"><Icon name="trophy" size={14} /> {t(`The top ${cfg!.monthlyPremiumTop} players of each month get 30 days free.`, `প্রতি মাসের সেরা ${num(cfg!.monthlyPremiumTop ?? 0, lang)} জন প্লেয়ার ৩০ দিন ফ্রি পায়।`)}</p>
        )}
        {isNative && !off && (
          <button className="btn ghost sm" disabled={busy !== null} onClick={() => void restore()}>
            {busy === 'restore' ? <span className="spinner" /> : <Icon name="refresh" size={16} />} {t('Restore purchase', 'আগের কেনা ফিরিয়ে আনুন')}
          </button>
        )}
      </section>

      {canBuy && (
        <div className="pm2-buy">
          <div className="pm2-plans" role="radiogroup" aria-label={t('Choose a plan', 'প্ল্যান বাছাই করুন')}>
            {(['monthly', 'yearly'] as const).map((id) => (
              <button key={id} type="button" role="radio" aria-checked={plan === id} className={`pm2-plan${plan === id ? ' on' : ''}`} onClick={() => (haptic('tap'), setPlan(id))}>
                <span className="pp-line"><b>{priceOf(id)}</b> <small>{id === 'monthly' ? t('monthly', 'মাসিক') : t('yearly', 'বাৎসরিক')}</small></span>
                {id === 'yearly' ? (
                  <span className="pp-sub">{t('12 months', '১২ মাস')}{save > 0 && <em> · {t(`Save ${save}%`, `${num(save, lang)}% সাশ্রয়`)}</em>}</span>
                ) : (
                  <span className="pp-sub">{t('1 month', '১ মাস')}</span>
                )}
              </button>
            ))}
          </div>
          {isNative ? (
            <button className="btn pm2-cta block" disabled={busy !== null} onClick={() => void buy()}>
              {busy === 'buy' ? <span className="spinner" /> : <Icon name="crown" />} {t('Get Premium', 'প্রিমিয়াম নিন')}
            </button>
          ) : (
            <button className="btn pm2-cta block" onClick={() => void window.open(cfg?.playStoreUrl || 'https://play.google.com/store/apps/details?id=app.quizwar.bd', '_blank', 'noopener')}>
              <Icon name="smartphone" /> {t('Get Premium in the app', 'অ্যাপে প্রিমিয়াম নিন')}
            </button>
          )}
          <p className="pm2-legal">{t('Paid through Google Play. Renews automatically until you cancel in Google Play.', 'Google Play-এর মাধ্যমে পেমেন্ট। Google Play থেকে বন্ধ না করা পর্যন্ত নিজে থেকে রিনিউ হবে।')}</p>
        </div>
      )}
    </div>
  );
}
