import { useState } from 'react';
import { useLocation } from 'react-router';
import { useConfig } from '../hooks/queries';
import { useT } from '../lib/i18n';
import { isNative } from '../lib/platform';
import { BrandMark } from './Splash';
import { Icon } from './Icon';

const PACKAGE = 'app.quizwar.bd';
const APK_URL = 'https://github.com/AHOSHAN-HABIB-NAYON/PROFILE/releases/download/app-latest/QuizWar.apk';
const KEY = 'qw-open-in-app-hidden';

/**
 * Android browsers: "Open in the app". The intent:// link opens this exact page in the installed
 * app, or falls back to the Play Store / APK download when it isn't installed. (Browsers don't
 * allow switching apps without a tap, so this is one tap instead of an automatic jump.)
 */
export function OpenInApp() {
  const t = useT();
  const loc = useLocation();
  const cfg = useConfig().data;
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(KEY) ?? 0) > Date.now();
    } catch {
      return false;
    }
  });
  const android = /Android/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  if (isNative || !android || standalone || hidden) return null;
  if (/^\/(match|war-room|matchmaking|result|review)\b/.test(loc.pathname)) return null;

  const fallback = cfg?.playStoreUrl || APK_URL;
  const href = `intent://${window.location.host}${loc.pathname}${loc.search}#Intent;scheme=https;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, String(Date.now() + 3 * 24 * 3600 * 1000));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="open-app" role="region" aria-label={t('Open in the app', 'অ্যাপে খুলুন')}>
      <BrandMark size={38} animate={false} />
      <div className="grow">
        <b>QUIZ WAR</b>
        <span>{t('Smoother in the app — notifications, music, offline.', 'অ্যাপে আরো স্মুথ — নোটিফিকেশন, মিউজিক সহ।')}</span>
      </div>
      <a className="btn sm primary" href={href}>
        {t('Open app', 'অ্যাপে খুলুন')}
      </a>
      <button className="btn icon sm ghost" onClick={hide} aria-label={t('Close', 'বন্ধ করুন')}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
