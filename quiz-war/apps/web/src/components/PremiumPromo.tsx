import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useConfig } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { Icon } from './Icon';
import { Modal } from './Sheet';

const KEY = 'qw-premium-promo';

/**
 * Now and then on Home: "Get Premium" or "Invite friends, win Premium" (alternating). Never for
 * premium players (trial users see how many days are left), never during games.
 */
export function PremiumPromo() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const cfg = useConfig().data;
  const me = useAuth((s) => s.user);
  const [open, setOpen] = useState<null | 'buy' | 'invite'>(null);
  const every = cfg?.premiumPromoDays ?? 2;
  const eligible = !!cfg?.premiumEnabled && every > 0 && !!me && !me.needsOnboarding && (!me.premium || !!me.premiumTrial);

  useEffect(() => {
    if (!eligible || pathname !== '/' || open) return;
    let last = { at: 0, kind: 'invite' as 'buy' | 'invite' };
    try {
      last = { ...last, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      /* ignore */
    }
    // First time: a day after joining at the earliest (the trial is new then).
    if (!last.at) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now() - (every - 1) * 86400_000, kind: 'invite' }));
      } catch {
        /* ignore */
      }
      return;
    }
    if (Date.now() - last.at < every * 86400_000) return;
    const timer = window.setTimeout(() => {
      if (document.querySelector('dialog[open]')) return;
      const referral = cfg?.referralEnabled !== false && !!cfg?.premiumEnabled;
      const kind = !referral ? 'buy' : last.kind === 'buy' ? 'invite' : 'buy';
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), kind }));
      } catch {
        /* ignore */
      }
      setOpen(kind);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [eligible, pathname, open, every, cfg?.referralEnabled]);

  const daysLeft = me?.premiumUntil ? Math.max(0, Math.ceil((new Date(me.premiumUntil).getTime() - Date.now()) / 86400_000)) : 0;
  const go = () => (haptic('tap'), setOpen(null), nav(open === 'invite' ? '/premium?tab=invite' : '/premium'));
  const invite = open === 'invite';
  const trial = !invite && !!me?.premiumTrial;
  const refDays = cfg?.referralDays ?? 7;
  const big = cfg?.referralBigCount ?? 100;
  const bigDays = cfg?.referralBigDays ?? 365;
  return (
    <Modal open={!!open} onClose={() => setOpen(null)} label={t('Premium', 'প্রিমিয়াম')}>
      <div className={`pq ${invite ? 'inv' : 'buy'}`}>
        <div className="pq-top">
          <button type="button" className="pq-x" onClick={() => setOpen(null)} aria-label={t('Close', 'বন্ধ করুন')}><Icon name="close" size={18} /></button>
          <span className={`pq-chip${trial ? ' warn' : ''}`}>
            <Icon name={invite ? 'gift' : 'crown'} size={14} /> {invite ? t('Free Premium', 'ফ্রি প্রিমিয়াম') : trial ? t('Trial ending', 'ট্রায়াল শেষ হচ্ছে') : t('Premium', 'প্রিমিয়াম')}
          </span>
          <div className="pq-row">
            <div className="grow">
              <h3>
                {invite
                  ? t('Bring friends, win free Premium', 'বন্ধু আনুন, ফ্রি প্রিমিয়াম জিতুন')
                  : trial
                    ? t(`Your free trial has ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, `আপনার ফ্রি ট্রায়াল আর ${num(daysLeft, lang)} দিন`)
                    : t('Video call your friends', 'বন্ধুর সাথে ভিডিও কল করুন')}
              </h3>
              <p>
                {invite
                  ? t('More friends, more free days.', 'যত বন্ধু, তত দিন ফ্রি।')
                  : trial
                    ? t('After it ends, calls, video and live talk stop. Get Premium to keep them.', 'শেষ হলে কল, ভিডিও আর লাইভ কথা বন্ধ হয়ে যাবে। চালু রাখতে প্রিমিয়াম নিন।')
                    : t('Calls, video and live talk in games — all in one Premium.', 'কল, ভিডিও আর খেলায় লাইভ কথা — সব এক প্রিমিয়ামে।')}
              </p>
            </div>
            <span className="pq-big"><Icon name={invite ? 'gift' : 'crown'} size={34} /></span>
          </div>
        </div>
        <div className="pq-body">
          {invite ? (
            <>
              <ol className="pq-steps">
                <li><i>{num(1, lang)}</i>{t('Send your code to a friend', 'আপনার কোড বন্ধুকে পাঠান')}</li>
                <li><i>{num(2, lang)}</i>{t('They join with it and play 1 game', 'বন্ধু কোড দিয়ে যোগ দিয়ে ১টা খেলা খেলবে')}</li>
                <li><i>{num(3, lang)}</i>{t(`You get +${refDays} days of Premium`, `আপনি পাবেন +${num(refDays, lang)} দিন প্রিমিয়াম`)}</li>
              </ol>
              <div className="pq-goal"><span>{t(`${big} friends`, `${num(big, lang)} বন্ধু হলে`)}</span><b>{bigDays >= 365 ? t('1 year free!', '১ বছর ফ্রি!') : t(`${bigDays} days free!`, `${num(bigDays, lang)} দিন ফ্রি!`)}</b></div>
            </>
          ) : (
            <>
              <div className="pq-perks">
                <span><i className="c0"><Icon name="video" size={17} /></i>{t('Video call', 'ভিডিও কল')}</span>
                <span><i className="c1"><Icon name="phone" size={17} /></i>{t('Group call', 'গ্রুপ কল')}</span>
                <span><i className="c2"><Icon name="mic" size={17} /></i>{t('Live talk', 'লাইভ কথা')}</span>
              </div>
              <div className="pq-price">
                <b>{cfg?.premiumPriceMonthly ?? '৳150'}</b><small>/{t('month', 'মাস')}</small>
                <em>{t(`${cfg?.premiumPriceYearly ?? '৳1200'} a year`, `বছরে ${cfg?.premiumPriceYearly ?? '৳1200'}`)}</em>
              </div>
            </>
          )}
          <button className="pv2-cta" onClick={go}>{invite ? t('Invite friends', 'ইনভাইট করুন') : t('See Premium', 'প্রিমিয়াম দেখুন')}</button>
          <button className="pg-cancel" onClick={() => setOpen(null)}>{t('Maybe later', 'পরে দেখব')}</button>
        </div>
      </div>
    </Modal>
  );
}
