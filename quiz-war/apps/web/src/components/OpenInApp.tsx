import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useConfig } from '../hooks/queries';
import { useT } from '../lib/i18n';
import { isNative } from '../lib/platform';
import { BrandMark } from './Splash';
import { Icon } from './Icon';

const PACKAGE = 'app.quizwar.bd';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.quizwar.bd';
const KEY = 'qw-open-in-app-hidden';

/**
 * Android browsers: "Open in the app". The intent:// link opens this exact page in the installed
 * app, or falls back to the Google Play listing when it isn't installed. (Browsers don't
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
  // Is the app on this phone? (Chrome on Android can tell, via the site's related app.)
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if (isNative || !android) return;
    const get = (navigator as any).getInstalledRelatedApps as undefined | (() => Promise<{ id?: string }[]>);
    void get?.call(navigator).then((apps) => setInstalled(apps.some((a) => a.id === PACKAGE))).catch(() => undefined);
  }, [android]);
  const here = `${window.location.host}${loc.pathname}${loc.search}`;
  // App installed: try to open it straight away (once per visit; some browsers allow it).
  useEffect(() => {
    if (!installed || isNative) return;
    try {
      if (sessionStorage.getItem('qw-tried-app')) return;
      sessionStorage.setItem('qw-tried-app', '1');
    } catch {
      return;
    }
    window.location.href = `intent://${here}#Intent;scheme=https;package=${PACKAGE};end`;
  }, [installed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isNative || !android || standalone || (hidden && !installed)) return null;
  if (/^\/(match|war-room|matchmaking|result|review)\b/.test(loc.pathname)) return null;

  const fallback = installed ? `https://${here}` : cfg?.playStoreUrl || PLAY_URL;
  const href = `intent://${here}#Intent;scheme=https;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
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
        <span>{installed ? t('The app is on this phone', 'অ্যাপটি এই ফোনে আছে') : t('Free on Google Play · smoother, with notifications', 'Google Play-তে ফ্রি · আরো স্মুথ, নোটিফিকেশন সহ')}</span>
      </div>
      <a className="btn sm primary" href={href}>
        {installed ? t('Open app', 'অ্যাপে খুলুন') : t('Get app', 'অ্যাপ নিন')}
      </a>
      <button className="btn icon sm ghost" onClick={hide} aria-label={t('Close', 'বন্ধ করুন')}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
