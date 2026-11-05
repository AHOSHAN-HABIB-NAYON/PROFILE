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
      const referral = cfg?.referralEnabled !== false;
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
  const go = () => (haptic('tap'), setOpen(null), nav('/premium'));
  return (
    <Modal open={!!open} onClose={() => setOpen(null)} label={t('Premium', 'প্রিমিয়াম')}>
      <div className={`pp-pop ${open ?? ''}`}>
        <div className="ppp-top">
          <button type="button" className="ppp-x" onClick={() => setOpen(null)} aria-label={t('Close', 'বন্ধ করুন')}><Icon name="close" size={20} /></button>
          <span className="ppp-chip"><Icon name="bolt" size={14} /> {open === 'invite' ? t('FREE PREMIUM', 'ফ্রি প্রিমিয়াম') : me?.premiumTrial ? t('TRIAL ENDING', 'ট্রায়াল শেষ হচ্ছে') : t('PREMIUM', 'প্রিমিয়াম')}</span>
          <div className="ppp-big">
            <span className="ppp-ic"><Icon name={open === 'invite' ? 'gift' : 'crown'} size={36} /></span>
            {open === 'invite' ? (
              <span className="ppp-num"><b>+{num(cfg?.referralDays ?? 7, lang)}</b><small>{t('DAYS FREE', 'দিন ফ্রি')}</small></span>
            ) : (
              <span className="ppp-num"><b>{cfg?.premiumPriceMonthly ?? '৳150'}</b><small>{t('PER MONTH', 'প্রতি মাসে')}</small></span>
            )}
          </div>
          <i className="ppp-conf c1" /><i className="ppp-conf c2" /><i className="ppp-conf c3" />
        </div>
        <div className="ppp-body">
          {open === 'invite' ? (
            <>
              <h3>{t('Invite friends, win Premium!', 'বন্ধু ইনভাইট করে প্রিমিয়াম জিতুন!')}</h3>
              <p>{t(`Each friend who joins with your code and plays 1 game gives you ${cfg?.referralDays ?? 7} days. ${cfg?.referralBigCount ?? 100} friends = 1 year free!`, `আপনার কোড দিয়ে কেউ যোগ দিয়ে ১টা খেলা খেললেই ${num(cfg?.referralDays ?? 7, lang)} দিন। ${num(cfg?.referralBigCount ?? 100, lang)} জন হলে ১ বছর ফ্রি!`)}</p>
            </>
          ) : (
            <>
              <h3>{me?.premiumTrial ? t(`Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, `আপনার ফ্রি ট্রায়াল আর ${num(daysLeft, lang)} দিন`) : t('Unlock video calls & live talk', 'ভিডিও কল আর লাইভ কথা চালু করুন')}</h3>
              <p>{t('Video & audio calls, voice messages, photos and live talk in quiz & Ludo — all in one Premium.', 'ভিডিও ও অডিও কল, ভয়েস মেসেজ, ছবি আর কুইজ-লুডুতে লাইভ কথা — সব এক প্রিমিয়ামে।')}</p>
            </>
          )}
          <button className="btn ppp-cta block" onClick={go}>
            <Icon name={open === 'invite' ? 'gift' : 'crown'} /> {open === 'invite' ? t('Invite & win', 'ইনভাইট করে জিতুন') : t('Get Premium', 'প্রিমিয়াম নিন')}
          </button>
          <button className="btn ghost block" onClick={() => setOpen(null)}>{t('Maybe later', 'পরে দেখব')}</button>
        </div>
      </div>
    </Modal>
  );
}
