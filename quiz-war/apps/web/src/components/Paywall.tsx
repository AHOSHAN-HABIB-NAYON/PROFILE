import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useConfig } from '../hooks/queries';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { restorePremium, setPremiumConfig, usePaywall, type PremiumFeature } from '../lib/premium';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';

const WHY: Record<PremiumFeature, { icon: IconName; en: string; bn: string }> = {
  calls: { icon: 'phone', en: 'Calls are a Premium feature', bn: 'কল করা প্রিমিয়াম ফিচার' },
  voiceMessages: { icon: 'mic', en: 'Voice messages are a Premium feature', bn: 'ভয়েস মেসেজ প্রিমিয়াম ফিচার' },
  photos: { icon: 'image', en: 'Sending photos is a Premium feature', bn: 'ছবি পাঠানো প্রিমিয়াম ফিচার' },
  liveMic: { icon: 'mic', en: 'Talking live is a Premium feature', bn: 'লাইভ কথা বলা প্রিমিয়াম ফিচার' },
};

/** One "Premium needed" sheet for the whole app (opened by needPremium / handlePremiumError). */
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
  return (
    <Sheet open={!!feature} onClose={close} title={t('Premium', 'প্রিমিয়াম')} icon="crown">
      {why && (
        <div className="paywall">
          <span className="pw-ic" aria-hidden><Icon name={why.icon} size={30} /><i><Icon name="crown" size={14} /></i></span>
          <h3>{t(why.en, why.bn)}</h3>
          <p className="small muted">
            {feature === 'liveMic'
              ? t('You can still hear everyone. Get Premium to talk too — plus calls, voice messages and photos.', 'আপনি সবার কথা শুনতে পাবেন। নিজে কথা বলতে প্রিমিয়াম নিন — সাথে কল, ভয়েস মেসেজ আর ছবি পাঠানো।')
              : t('Get Premium for a small monthly price: calls, voice messages, photos and live talk in games.', 'অল্প টাকায় এক মাসের প্রিমিয়াম নিন: কল, ভয়েস মেসেজ, ছবি পাঠানো আর খেলায় লাইভ কথা।')}
          </p>
          <button className="btn pm-cta block" onClick={() => (haptic('tap'), close(), nav('/premium'))}><Icon name="crown" /> {t('See Premium', 'প্রিমিয়াম দেখুন')}</button>
          <button className="btn ghost block" onClick={close}>{t('Not now', 'এখন না')}</button>
        </div>
      )}
    </Sheet>
  );
}
