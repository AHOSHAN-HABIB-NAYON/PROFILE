import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Modal, Sheet } from '../components/Sheet';
import { Icon, type IconName } from '../components/Icon';
import { useConfig } from '../hooks/queries';
import { api, ApiError, friendlyError } from '../lib/api';
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
  const [codeErr, setCodeErr] = useState('');
  const [allPerks, setAllPerks] = useState(false);
  const [gift, setGift] = useState(false);
  const [help, setHelp] = useState(false);
  const [params, setParams] = useSearchParams();
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
      setCodeErr('');
      setGift(false);
      sfx('reward');
      haptic('success');
      toast.success(t(`${r.days} days of Premium added!`, `${num(r.days, lang)} দিনের প্রিমিয়াম যোগ হয়েছে!`), undefined, 'gift');
      void qc.invalidateQueries({ queryKey: ['premium'] });
    } catch (e) {
      haptic('error');
      setCodeErr(codeError(e, t));
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
  const inviteOn = !!ref?.enabled;
  const tab: 'premium' | 'invite' = inviteOn && params.get('tab') === 'invite' ? 'invite' : 'premium';
  const setTab = (v: 'premium' | 'invite') => {
    haptic('tap');
    setParams(v === 'invite' ? { tab: 'invite' } : {}, { replace: true });
    window.scrollTo({ top: 0 });
  };
  const perks = allPerks ? PREMIUM_PERKS : PREMIUM_PERKS.slice(0, 4);
  const close = () => (window.history.length > 1 ? nav(-1) : nav('/', { replace: true }));
  const friends = useInfiniteQuery({
    queryKey: ['premium-referrals'],
    queryFn: ({ pageParam }) => api<{ items: Friend[]; more: boolean }>(`/premium/referrals?page=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.more ? all.length : undefined),
    enabled: tab === 'invite',
  });
  const list = friends.data?.pages.flatMap((p) => p.items) ?? [];
  const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const email = cfg?.supportEmail || 'support.quizwarbd@gmail.com';
  const buyBar = tab === 'premium' && canBuy;

  return (
    <div className={`pv2 ${tab}${buyBar ? ' has-buy' : ''}`}>
      <header className="pv2-hd">
        <button type="button" className="pv2-x" onClick={close} aria-label={t('Close', 'বন্ধ করুন')}><Icon name="close" size={20} /></button>
        {tab === 'premium' ? (
          <>
            <h1>{t('Unlock everything', 'সব সুবিধা খুলে দিন')}</h1>
            <p>{t('Video calls, live talk and much more — one Premium.', 'ভিডিও কল, লাইভ কথা আর আরও অনেক কিছু — এক প্রিমিয়ামে।')}</p>
          </>
        ) : (
          <>
            <h1>{t('Bring friends, get Premium free', 'বন্ধু আনুন, ফ্রি প্রিমিয়াম নিন')}</h1>
            <p>{t(`Each friend who plays 1 game: +${ref?.days ?? 7} days. ${ref?.bigCount ?? 100} friends: ${(ref?.bigDays ?? 365) >= 365 ? '1 year' : `${ref?.bigDays} days`} free!`, `প্রতি বন্ধু ১টা খেলা খেললেই +${num(ref?.days ?? 7, lang)} দিন। ${num(ref?.bigCount ?? 100, lang)} জন হলে ${(ref?.bigDays ?? 365) >= 365 ? '১ বছর' : `${num(ref?.bigDays ?? 0, lang)} দিন`} ফ্রি!`)}</p>
          </>
        )}
      </header>

      <main className="pv2-card">
        {inviteOn && (
          <div className="pv2-seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'premium'} className={tab === 'premium' ? 'on' : ''} onClick={() => setTab('premium')}>{t('Premium', 'প্রিমিয়াম')}</button>
            <button type="button" role="tab" aria-selected={tab === 'invite'} className={tab === 'invite' ? 'on' : ''} onClick={() => setTab('invite')}>{t('Invite & earn', 'ইনভাইট ও আয়')}</button>
          </div>
        )}

        {tab === 'premium' ? (
          <>
            {premium ? (
              <p className="pv2-status">
                <Icon name="check-circle" size={18} />
                {me.premiumForever
                  ? t('Premium for good', 'আজীবন প্রিমিয়াম')
                  : me.premiumTrial
                    ? t(`Free trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, `ফ্রি ট্রায়াল · আর ${num(daysLeft, lang)} দিন`)
                    : t(`Premium until ${dateText}`, `${dateText} পর্যন্ত প্রিমিয়াম`)}
              </p>
            ) : (
              <p className="pv2-tag">{t('For those who love to talk with friends while playing', 'যারা বন্ধুদের সাথে কথা বলে খেলতে ভালোবাসেন')}</p>
            )}
            <h3 className="pv2-lab">{t('What you get', 'যা যা পাবেন')}</h3>
            <ul className="pv2-perks">
              {perks.map((p, i) => (
                <li key={p.en}>
                  <span className={`pv2-ic c${i % 7}`}><Icon name={p.icon} size={17} /></span>
                  <span className="grow">
                    <b>{t(p.en, p.bn)}</b>
                    {allPerks && <small>{t(p.den, p.dbn)}</small>}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="pv2-more" onClick={() => (haptic('tap'), setAllPerks((v) => !v))} aria-expanded={allPerks}>
              {allPerks ? t('Show less', 'কম দেখুন') : t(`See ${PREMIUM_PERKS.length - 4} more benefits`, `আরও ${num(PREMIUM_PERKS.length - 4, lang)}টি সুবিধা দেখুন`)}
              <Icon name="chevron-down" size={16} className={allPerks ? 'up' : ''} />
            </button>
            <p className="pv2-free"><Icon name="message" size={14} /> {t('Text chat and all games stay free for everyone.', 'টেক্সট চ্যাট আর সব খেলা সবার জন্য ফ্রি।')}</p>
            {(cfg?.monthlyPremiumTop ?? 0) > 0 && (
              <p className="pv2-free"><Icon name="trophy" size={14} /> {t(`The top ${cfg!.monthlyPremiumTop} players of each month get 1 month free.`, `প্রতি মাসের সেরা ${num(cfg!.monthlyPremiumTop ?? 0, lang)} জন ১ মাস ফ্রি পায়।`)}</p>
            )}
            {off && <p className="pv2-note">{t('Premium is not on sale yet. Everything is free for now!', 'প্রিমিয়াম এখনো বিক্রি শুরু হয়নি। এখন সব ফ্রি!')}</p>}
            {!off && premium && info.data?.subscribed && (
              <button className="btn outline block" onClick={() => void window.open(manageUrl(productId), '_blank', 'noopener')}><Icon name="settings" /> {t('Manage subscription in Google Play', 'Google Play-তে সাবস্ক্রিপশন দেখুন')}</button>
            )}
            {isNative && !off && (
              <button className="pv2-restore" disabled={busy !== null} onClick={() => void restore()}>
                {busy === 'restore' ? <span className="spinner" /> : <Icon name="refresh" size={15} />} {t('Restore purchase', 'আগের কেনা ফিরিয়ে আনুন')}
              </button>
            )}
            {!buyBar && <Links onGift={() => setGift(true)} onHelp={() => setHelp(true)} />}
          </>
        ) : (
          <>
            <div className="pv2-code">
              <span className="grow"><small>{t('Your invite code', 'আপনার ইনভাইট কোড')}</small><b>{me.uid}</b></span>
              <button type="button" className="pv2-pill" onClick={copyCode}><Icon name="copy" size={15} /> {t('Copy', 'কপি')}</button>
              <button type="button" className="pv2-pill share" onClick={() => void shareInvite()}><Icon name="share" size={15} /> {t('Share', 'শেয়ার')}</button>
            </div>
            {ref && (
              <>
                <div className="pv2-prog">
                  <span>{t(`${ref.played} / ${ref.bigCount} played`, `${num(ref.played, lang)} / ${num(ref.bigCount, lang)} জন খেলেছে`)}</span>
                  <em>+{num(ref.played * ref.days, lang)} {t('days earned', 'দিন পেয়েছেন')}</em>
                </div>
                <div className="pv2-bar"><span style={{ width: `${Math.min(100, (ref.played / ref.bigCount) * 100)}%` }} /></div>
              </>
            )}
            <h3 className="pv2-lab">{t(`Your invites (${ref?.joined ?? 0})`, `আপনার ইনভাইট (${num(ref?.joined ?? 0, lang)})`)}</h3>
            {friends.isLoading ? (
              <div className="pv2-empty"><span className="spinner" /></div>
            ) : list.length === 0 ? (
              <div className="pv2-empty">
                <Icon name="user-plus" size={30} />
                <p>{t('No one yet. Share your code — friends enter it when they set up their profile.', 'এখনো কেউ নেই। কোড শেয়ার করুন — বন্ধুরা প্রোফাইল খোলার সময় কোডটি দেবে।')}</p>
              </div>
            ) : (
              <ul className="pv2-list">
                {list.map((f) => (
                  <li key={f.uid} onClick={() => nav(`/u/${f.uid}`)}>
                    <Avatar name={f.name} src={f.avatar} size={38} />
                    <span className="grow">
                      <b>{f.name}</b>
                      <small>{t('Joined', 'যোগ দিয়েছে')} {fmt.format(new Date(f.joinedAt))}</small>
                    </span>
                    {f.rewarded ? (
                      <span className="pv2-st ok">{t(`Played · +${ref?.days ?? 7} days`, `খেলেছে · +${num(ref?.days ?? 7, lang)} দিন`)}</span>
                    ) : f.played ? (
                      <span className="pv2-st same">{t('Same phone', 'একই ফোন')}</span>
                    ) : (
                      <span className="pv2-st wait">{t('Yet to play', 'খেলার অপেক্ষায়')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {friends.hasNextPage && (
              <button type="button" className="pv2-more inv" disabled={friends.isFetchingNextPage} onClick={() => (haptic('tap'), void friends.fetchNextPage())}>
                {friends.isFetchingNextPage ? <span className="spinner" /> : t('See 10 more', 'আরও ১০ জন দেখুন')} <Icon name="chevron-down" size={16} />
              </button>
            )}
            <p className="pv2-free"><Icon name="info" size={14} /> {t('One reward per phone.', 'এক ফোন থেকে একবারই পুরস্কার।')}</p>
            <Links onGift={() => setGift(true)} onHelp={() => setHelp(true)} />
          </>
        )}
      </main>

      {buyBar && (
        <div className="pv2-buy">
          <div className="pv2-plans" role="radiogroup" aria-label={t('Choose a plan', 'প্ল্যান বাছাই করুন')}>
            {(['monthly', 'yearly'] as const).map((id) => (
              <button key={id} type="button" role="radio" aria-checked={plan === id} className={`pv2-plan${plan === id ? ' on' : ''}`} onClick={() => (haptic('tap'), setPlan(id))}>
                <small>{id === 'monthly' ? t('1 month', '১ মাস') : t('1 year', '১ বছর')}</small>
                <b>{priceOf(id)}<i>/{id === 'monthly' ? t('month', 'মাস') : t('year', 'বছর')}</i></b>
                {id === 'yearly' && save > 0 && <em>{t(`Save ${save}%`, `${num(save, lang)}% সাশ্রয়`)}</em>}
              </button>
            ))}
          </div>
          {isNative ? (
            <button className="pv2-cta" disabled={busy !== null} onClick={() => void buy()}>
              {busy === 'buy' ? <span className="spinner" /> : t(`Get Premium · ${priceOf(plan)}`, `প্রিমিয়াম নিন · ${priceOf(plan)}`)}
            </button>
          ) : (
            <button className="pv2-cta" onClick={() => void window.open(cfg?.playStoreUrl || 'https://play.google.com/store/apps/details?id=app.quizwar.bd', '_blank', 'noopener')}>
              <Icon name="smartphone" size={18} /> {t('Get Premium in the app', 'অ্যাপে প্রিমিয়াম নিন')}
            </button>
          )}
          <p className="pv2-fine">
            {t('Renews automatically · cancel any time in Google Play', 'নিজে থেকে রিনিউ হয় · Google Play থেকে যেকোনো সময় বন্ধ করা যায়')} ·{' '}
            <a href="/legal/terms" onClick={(e) => (e.preventDefault(), nav('/legal/terms'))}>{t('Terms', 'শর্তাবলি')}</a> · <a href="/legal/privacy" onClick={(e) => (e.preventDefault(), nav('/legal/privacy'))}>{t('Privacy', 'প্রাইভেসি')}</a>
          </p>
          <Links onGift={() => setGift(true)} onHelp={() => setHelp(true)} />
        </div>
      )}

      <Modal open={gift} onClose={() => (setGift(false), setCodeErr(''))} label={t('Gift code', 'গিফট কোড')}>
        <form className="pv2-gift" onSubmit={(e) => (e.preventDefault(), void redeem())}>
          <span className="pg-ic"><Icon name="gift" size={28} /></span>
          <h3>{t('Gift code', 'গিফট কোড')}</h3>
          <p>{t('Enter the code and tap Apply', 'কোড বসিয়ে "প্রয়োগ করুন" চাপুন')}</p>
          <input className={`pg-in${codeErr ? ' bad' : ''}`} value={code} onChange={(e) => (setCode(e.target.value.toUpperCase()), setCodeErr(''))} placeholder={t('ENTER CODE', 'কোড লিখুন')} maxLength={24} autoCapitalize="characters" autoFocus aria-label={t('Gift code', 'গিফট কোড')} aria-invalid={!!codeErr} />
          {codeErr && <p className="pg-err" role="alert"><Icon name="alert-circle" size={15} /> {codeErr}</p>}
          <button className="pv2-cta" disabled={busy !== null || code.trim().length < 4}>{busy === 'redeem' ? <span className="spinner" /> : t('Apply', 'প্রয়োগ করুন')}</button>
          <button type="button" className="pg-cancel" onClick={() => (setGift(false), setCodeErr(''))}>{t('Cancel', 'বাতিল')}</button>
        </form>
      </Modal>

      <Sheet open={help} onClose={() => setHelp(false)} title={t('Priority support', 'প্রায়োরিটি সাপোর্ট')} icon="headset">
        <p className="small muted" style={{ margin: '0 0 12px' }}>{t('We are here for any problem. Premium members get answers first.', 'যেকোনো সমস্যায় আমরা আছি। প্রিমিয়াম সদস্যরা আগে উত্তর পান।')}</p>
        <a className="pv2-sup wa" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">
          <span className="si"><Icon name="whatsapp" size={24} /></span>
          <span className="grow"><b>{t('Message on WhatsApp', 'WhatsApp এ মেসেজ করুন')}</b><small>+880 1757-827996</small></span>
          <Icon name="chevron" size={18} />
        </a>
        <a className="pv2-sup ml" href={`mailto:${email}?subject=${encodeURIComponent(`QUIZ WAR support — ${me.uid}`)}`}>
          <span className="si"><Icon name="mail" size={22} /></span>
          <span className="grow"><b>{t('Send an email', 'ইমেইল করুন')}</b><small>{email}</small></span>
          <Icon name="chevron" size={18} />
        </a>
      </Sheet>
    </div>
  );
}

const WHATSAPP = '8801757827996';
type Friend = { uid: string; name: string; avatar: string | null; joinedAt: string; played: boolean; rewarded: boolean };

function codeError(e: unknown, t: (en: string, bn: string) => string) {
  const c = e instanceof ApiError ? e.code : '';
  if (c === 'code_not_found') return t('This code is wrong', 'কোডটি ভুল');
  if (c === 'code_expired') return t('This code has expired', 'কোডটির মেয়াদ শেষ');
  if (c === 'code_used') return t('This code has already been used', 'কোডটি আগেই ব্যবহার হয়ে গেছে');
  if (c === 'code_used_by_you') return t('You already used this code', 'আপনি এই কোড আগেই ব্যবহার করেছেন');
  return friendlyError(e);
}

function Links({ onGift, onHelp }: { onGift: () => void; onHelp: () => void }) {
  const t = useT();
  return (
    <div className="pv2-links">
      <button type="button" onClick={() => (haptic('tap'), onGift())}><Icon name="gift" size={16} /> {t('Have a gift code?', 'গিফট কোড আছে?')}</button>
      <button type="button" onClick={() => (haptic('tap'), onHelp())}><Icon name="headset" size={16} /> {t('Priority support', 'প্রায়োরিটি সাপোর্ট')}</button>
    </div>
  );
}
