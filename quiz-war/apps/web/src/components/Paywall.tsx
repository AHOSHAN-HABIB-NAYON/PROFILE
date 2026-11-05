import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useConfig } from '../hooks/queries';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { restorePremium, setPremiumConfig, usePaywall, type PremiumFeature } from '../lib/premium';
import { Icon, type IconName } from './Icon';
import { Modal } from './Sheet';

const WHY: Record<PremiumFeature, { icon: IconName; c: string; en: string; bn: string; den: string; dbn: string }> = {
  calls: { icon: 'video', c: 'pink', en: 'Calls are a Premium feature', bn: 'কল প্রিমিয়াম ফিচার', den: 'Get Premium to make audio & HD video calls. Answering calls is free for everyone.', dbn: 'বন্ধুকে অডিও ও HD ভিডিও কল করতে প্রিমিয়াম নিন। কল ধরা সবার জন্য ফ্রি।' },
  voiceMessages: { icon: 'mic', c: 'orange', en: 'Voice messages are Premium', bn: 'ভয়েস মেসেজ প্রিমিয়াম ফিচার', den: 'Get Premium to send voice messages. Listening is free.', dbn: 'ভয়েস মেসেজ পাঠাতে প্রিমিয়াম নিন। শোনা সবার জন্য ফ্রি।' },
  photos: { icon: 'image', c: 'blue', en: 'Sending photos is Premium', bn: 'ছবি পাঠানো প্রিমিয়াম ফিচার', den: 'Get Premium to send photos from your gallery or camera.', dbn: 'গ্যালারি বা ক্যামেরা থেকে ছবি পাঠাতে প্রিমিয়াম নিন।' },
  liveMic: { icon: 'mic', c: 'green', en: 'Premium needed to talk', bn: 'কথা বলতে প্রিমিয়াম লাগবে', den: 'Get Premium to turn on your own mic in games.', dbn: 'খেলার মাঝে নিজের মাইক চালু করতে প্রিমিয়াম নিন।' },
};

/** One "Premium needed" popup for the whole app (opened by needPremium / handlePremiumError). */
export function Paywall() {
  const t = useT();
  const nav = useNavigate();
  const cfg = useConfig().data;
  const feature = usePaywall((s) => s.feature);
  const close = usePaywall((s) => s.close);
  useEffect(() => void setPremiumConfig(cfg), [cfg]);
  // Renewals / a new phone: quietly bring back premium bought with this Google account.
  useEffect(() => {
    if (cfg?.premiumEnabled) void restorePremium();
  }, [cfg?.premiumEnabled]);
  const why = feature ? WHY[feature] : null;
  const invite = !!cfg?.premiumEnabled && cfg?.referralEnabled !== false;
  const go = (to: string) => (haptic('tap'), close(), nav(to));
  return (
    <Modal open={!!feature} onClose={close} label={t('Premium', 'প্রিমিয়াম')}>
      {why && (
        <div className="pw2">
          <button type="button" className="pq-x" onClick={close} aria-label={t('Close', 'বন্ধ করুন')}><Icon name="close" size={18} /></button>
          <span className={`pw2-ic ${why.c}`} aria-hidden><Icon name={why.icon} size={28} /><i><Icon name="crown" size={13} /></i></span>
          <h3>{t(why.en, why.bn)}</h3>
          <p>{t(why.den, why.dbn)}</p>
          {feature === 'liveMic' && <p className="pw2-ok"><Icon name="headset" size={16} /> {t("Don't worry, you can hear everyone", 'চিন্তা নেই, সবার কথা আপনি শুনতে পাবেন')}</p>}
          <button className="pv2-cta" onClick={() => go('/premium')}><Icon name="crown" size={18} /> {t(`Get Premium · ${cfg?.premiumPriceMonthly ?? '৳150'}/month`, `প্রিমিয়াম নিন · ${cfg?.premiumPriceMonthly ?? '৳150'}/মাস`)}</button>
          {invite && <button type="button" className="pw2-inv" onClick={() => go('/premium?tab=invite')}><Icon name="gift" size={16} /> {t('Invite friends, get it free', 'বন্ধু ইনভাইট করে ফ্রি নিন')}</button>}
          <button type="button" className="pg-cancel" onClick={close}>{t('Not now', 'এখন না')}</button>
        </div>
      )}
    </Modal>
  );
}
