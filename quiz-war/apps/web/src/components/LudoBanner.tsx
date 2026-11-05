import { useNavigate } from 'react-router';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { Icon } from './Icon';

/** Small "Play Ludo" banner (Home and Battle). */
export function LudoBanner() {
  const t = useT();
  const nav = useNavigate();
  return (
    <button type="button" className="ludo-banner-card" onClick={() => (haptic('tap'), nav('/ludo'))}>
      <span className="lbc-art" aria-hidden>
        <svg viewBox="0 0 40 40">
          <rect x="1" y="1" width="18" height="18" rx="3" fill="#e53935" />
          <rect x="21" y="1" width="18" height="18" rx="3" fill="#43a047" />
          <rect x="21" y="21" width="18" height="18" rx="3" fill="#fbc02d" />
          <rect x="1" y="21" width="18" height="18" rx="3" fill="#1e88e5" />
          <rect x="13" y="13" width="14" height="14" rx="3.5" fill="#fff" />
          <circle cx="17" cy="17" r="1.6" fill="#1e293b" /><circle cx="23" cy="23" r="1.6" fill="#1e293b" /><circle cx="20" cy="20" r="1.6" fill="#e53935" />
        </svg>
      </span>
      <span className="grow">
        <b>{t('Ludo', 'লুডু')} <em>{t('New', 'নতুন')}</em></b>
        <small>{t('Play with the computer or friends on one phone', 'কম্পিউটার বা এক ফোনে বন্ধুদের সাথে খেলুন')}</small>
      </span>
      <Icon name="chevron" size={20} />
    </button>
  );
}
