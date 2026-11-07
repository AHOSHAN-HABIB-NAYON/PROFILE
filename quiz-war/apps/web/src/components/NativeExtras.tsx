import { App as CapApp } from '@capacitor/app';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { appVersionCode, isNative } from '../lib/platform';
import { enablePush, pushPermission } from '../lib/push';
import { useSettings } from '../lib/settings';
import { setMusicSources } from '../lib/sound';
import { toast } from '../lib/toast';
import { Icon, IconTile } from './Icon';
import { Modal } from './Sheet';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.quizwar.bd';

/** Asks Google Play whether a newer version is published (null = not on Play / unknown). */
async function playUpdateCode(): Promise<number | null> {
  try {
    const { AppUpdate, AppUpdateAvailability } = await import('@capawesome/capacitor-app-update');
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return null;
    return Number(info.availableVersionCode) || null;
  } catch {
    return null;
  }
}

/** Opens Google Play's own update screen; falls back to the Play listing. */
async function openPlayUpdate(url: string) {
  try {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update');
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.immediateUpdateAllowed) {
      await AppUpdate.performImmediateUpdate();
      return;
    }
    await AppUpdate.openAppStore();
    return;
  } catch {
    window.location.href = url;
  }
}

/**
 * Android app update prompt. Google Play tells us when a newer version is live (optional update);
 * the admin's minimum version forces it. Updates always go through the Play Store.
 */
function UpdatePrompt() {
  const cfg = useConfig().data;
  const t = useT();
  const [playCode, setPlayCode] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Number(localStorage.getItem('qw-update-dismissed') ?? 0);
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    if (!isNative) return;
    const id = setTimeout(() => void playUpdateCode().then(setPlayCode), 4000);
    return () => clearTimeout(id);
  }, []);
  // Dev only: /?previewUpdate=1 (or =force) shows the popup in a browser.
  const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('previewUpdate') : null;
  if ((!isNative && !preview) || !cfg) return null;
  const code = preview ? 1 : appVersionCode();
  if (!code) return null;
  const latest = Math.max(cfg.latestAppVersionCode, playCode ?? 0, preview ? 2 : 0);
  const forced = preview === 'force' || code < cfg.minAppVersionCode || (cfg.forceUpdate && code < cfg.latestAppVersionCode);
  const optional = !forced && code < latest && dismissed < latest;
  if (!forced && !optional) return null;
  const url = cfg.playStoreUrl || PLAY_URL;
  // Admin writes "what's new" one item per line; a single sentence stays a sentence.
  const lines = (cfg.updateMessage ?? '').split(/\n+/).map((l) => l.replace(/^[\s•\-*✓✔]+/, '').trim()).filter(Boolean);
  const list = lines.length > 1 ? lines.slice(0, 5) : [];
  const intro = lines.length === 1 ? lines[0] : null;
  const defaults: [string, string, string][] = [
    ['bolt', t('Faster and smoother', 'আরও দ্রুত আর স্মুথ'), 'c0'],
    ['shield-check', t('Bugs fixed', 'সমস্যা ঠিক করা হয়েছে'), 'c1'],
    ['sparkles', t('New features', 'নতুন ফিচার'), 'c2'],
  ];
  const later = () => (document.querySelector('dialog.modal[open]') as HTMLDialogElement | null)?.dispatchEvent(new Event('cancel', { cancelable: true }));
  return (
    <Modal
      open
      dismissible={!forced}
      label={t('Update available', 'আপডেট এসেছে')}
      onClose={() => {
        try {
          localStorage.setItem('qw-update-dismissed', String(latest));
        } catch {
          /* ignore */
        }
        setDismissed(latest);
      }}
    >
      <div className={`pq upd${forced ? ' must' : ''}`}>
        <div className="pq-top">
          {!forced && <button type="button" className="pq-x" onClick={later} aria-label={t('Close', 'বন্ধ করুন')}><Icon name="close" size={18} /></button>}
          <span className="pq-chip"><Icon name={forced ? 'shield' : 'sparkles'} size={14} /> {forced ? t('Important update', 'জরুরি আপডেট') : t('New update', 'নতুন আপডেট')}</span>
          <div className="pq-row">
            <div className="grow">
              <h3>{forced ? t('Please update QUIZ WAR', 'QUIZ WAR আপডেট করুন') : t('A new version is here!', 'নতুন ভার্সন এসেছে!')}</h3>
              <p>{intro ?? (forced ? t('This version is no longer supported. Update to keep playing.', 'এই ভার্সনটি আর চলবে না। খেলা চালিয়ে যেতে আপডেট করুন।') : t('Update now for the best experience.', 'সেরা অভিজ্ঞতার জন্য এখনই আপডেট করুন।'))}</p>
            </div>
            <span className="pq-big"><Icon name="rocket" size={34} /></span>
          </div>
        </div>
        <div className="pq-body">
          <b className="upd-h">{t("What's new", 'নতুন যা আছে')}</b>
          {list.length ? (
            <ul className="upd-list">
              {list.map((l, i) => (
                <li key={i}><i><Icon name="check" size={14} /></i>{l}</li>
              ))}
            </ul>
          ) : (
            <div className="pq-perks">
              {defaults.map(([ic, label, c]) => (
                <span key={c}><i className={c}><Icon name={ic} size={17} /></i>{label}</span>
              ))}
            </div>
          )}
          <button className="pv2-cta upd-cta" onClick={() => void openPlayUpdate(url)}>
            <Icon name="download" size={20} /> {t('Update on Google Play', 'Google Play-তে আপডেট করুন')}
          </button>
          <small className="upd-note"><Icon name="shield-check" size={13} /> {t('Free · safe from Google Play · your data stays', 'ফ্রি · Google Play থেকে নিরাপদ · আপনার সব ডেটা থাকবে')}</small>
          {!forced && <button className="pg-cancel" onClick={later}>{t('Later', 'পরে')}</button>}
        </div>
      </div>
    </Modal>
  );
}

/** Explains why we ask for notifications before the system prompt (Play Store best practice). */
function PushExplainer() {
  const cfg = useConfig().data;
  const t = useT();
  const loc = useLocation();
  const asked = useSettings((s) => s.pushAsked);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (asked || !cfg?.notificationsEnabled || loc.pathname !== '/') return;
    let alive = true;
    const id = setTimeout(async () => {
      if (!isNative && !cfg.vapidPublicKey) return;
      if ((await pushPermission()) === 'prompt' && alive) setShow(true);
    }, 2500);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [asked, cfg, loc.pathname]);
  if (!show) return null;
  const close = () => {
    useSettings.getState().set({ pushAsked: true });
    setShow(false);
  };
  return (
    <Modal open label={t('Turn on notifications', 'নোটিফিকেশন চালু করুন')} onClose={close}>
      <div className="m-art">
        <IconTile name="bell-ring" tone="primary" size={76} anim="ring" />
      </div>
      <h2>{t('Never miss a challenge', 'কোনো চ্যালেঞ্জ মিস করবেন না')}</h2>
      <p>{t('Get notified when a friend challenges you, your streak is about to end, or a reward is ready to claim.', 'বন্ধু চ্যালেঞ্জ করলে, স্ট্রিক শেষ হতে চললে বা রিওয়ার্ড Claim করার সময় হলে সাথে সাথে জানতে পারবেন।')}</p>
      <ul className="perm-list">
        <li><Icon name="swords" size={18} /> {t('Battle invitations', 'ব্যাটল আমন্ত্রণ')}</li>
        <li><Icon name="gift" size={18} /> {t('Rewards and missions', 'রিওয়ার্ড ও মিশন')}</li>
        <li><Icon name="fire" size={18} /> {t('Streak reminders', 'স্ট্রিক রিমাইন্ডার')}</li>
      </ul>
      <div className="modal-actions">
        <button className="btn outline" onClick={close}>{t('Not now', 'এখন না')}</button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await enablePush(cfg?.vapidPublicKey ?? null).catch(() => 'denied' as const);
            setBusy(false);
            close();
            if (r === 'granted') toast.success(t('Notifications are on', 'নোটিফিকেশন চালু হয়েছে'), undefined, 'bell');
          }}
        >
          {busy ? <span className="spinner" /> : <Icon name="bell" />} {t('Allow', 'চালু করুন')}
        </button>
      </div>
    </Modal>
  );
}

/** Unverified email: a friendly popup (at most once a day) with "resend"; closes itself once verified. */
export function VerifyEmailPrompt() {
  const t = useT();
  const cfg = useConfig().data;
  const user = useAuth((s) => s.user);
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(0);
  const need = !!(cfg?.emailEnabled && user?.email && !user.emailVerified);
  const inGame = /^\/(match|war-room|matchmaking|result)\//.test(loc.pathname) || loc.pathname === '/matchmaking';

  useEffect(() => {
    if (!need || inGame) return;
    const key = 'qw-verify-asked';
    const today = new Date().toDateString();
    let asked: string | null = null;
    try {
      asked = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    if (asked === today) return;
    const id = setTimeout(() => {
      setOpen(true);
      try {
        localStorage.setItem(key, today);
      } catch {
        /* ignore */
      }
    }, 9000);
    return () => clearTimeout(id);
  }, [need, inGame]);

  // While open, notice when the link was clicked (in the mail app / browser).
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => void useAuth.getState().loadMe().catch(() => undefined), 8000);
    return () => clearInterval(id);
  }, [open]);
  useEffect(() => {
    if (open && user?.emailVerified) {
      setOpen(false);
      toast.success(t('Email verified', 'ইমেইল নিশ্চিত হয়েছে'), t('Thanks! Your account is secured.', 'ধন্যবাদ! আপনার অ্যাকাউন্ট সুরক্ষিত।'), 'verified');
    }
  }, [open, user?.emailVerified, t]);
  useEffect(() => {
    if (cool <= 0) return;
    const id = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cool]);

  const resend = async () => {
    setBusy(true);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setCool(60);
      toast.success(t('Email sent', 'ইমেইল পাঠানো হয়েছে'), user?.email ?? undefined, 'mail');
    } catch (e) {
      toast.error(t('Could not send', 'পাঠানো যায়নি'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!need || !open || inGame) return null;
  // A small card above the bottom bar — easy to act on, easy to dismiss.
  return (
    <div className="verify-pop" role="dialog" aria-label={t('Verify your email', 'ইমেইল নিশ্চিত করুন')}>
      <IconTile name="mail" tone="warning" size={38} anim="float" />
      <div className="grow">
        <b>{t('Verify your email', 'ইমেইল নিশ্চিত করুন')}</b>
        <p className="xs muted">
          {cool > 0 ? t('Sent! Check Inbox or Spam.', 'পাঠানো হয়েছে! Inbox বা Spam দেখুন।') : t('Tap the link we sent to secure your account.', 'পাঠানো লিংকে চাপ দিয়ে অ্যাকাউন্ট সুরক্ষিত করুন।')}
        </p>
      </div>
      <button className="btn sm primary" disabled={busy || cool > 0} onClick={() => void resend()}>
        {busy ? <span className="spinner" /> : cool > 0 ? `${cool}s` : t('Resend', 'আবার পাঠান')}
      </button>
      <button className="btn icon sm ghost" aria-label={t('Close', 'বন্ধ করুন')} onClick={() => setOpen(false)}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

/** Small reminder card (Home) while the email is unverified. */
export function VerifyEmailBanner() {
  const t = useT();
  const cfg = useConfig().data;
  const user = useAuth((s) => s.user);
  const [sent, setSent] = useState(false);
  if (!cfg?.emailEnabled || !user?.email || user.emailVerified) return null;
  return (
    <div className="verify-banner" role="status">
      <IconTile name="mail" tone="warning" size={40} />
      <div className="grow">
        <b>{t('Verify your email', 'ইমেইল যাচাই করুন')}</b>
        <p className="xs muted">{sent ? t('Sent! Check your inbox and Spam.', 'পাঠানো হয়েছে! ইনবক্স ও Spam দেখুন।') : t('Secure your account and recover it anytime.', 'অ্যাকাউন্ট সুরক্ষিত রাখুন, পাসওয়ার্ড ভুলে গেলেও ফিরে পাবেন।')}</p>
      </div>
      <button
        className="btn sm primary"
        disabled={sent}
        onClick={() =>
          void api('/auth/resend-verification', { method: 'POST' })
            .then(() => setSent(true))
            .catch((e) => toast.error(t('Could not send', 'পাঠানো যায়নি'), friendlyError(e)))
        }
      >
        {sent ? <Icon name="check" /> : <Icon name="mail" />} {sent ? t('Sent', 'পাঠানো হয়েছে') : t('Send link', 'লিংক পাঠান')}
      </button>
    </div>
  );
}

/** App-wide extras for signed-in players: music sources, language sync, update + permission prompts. */
export function NativeExtras() {
  const cfg = useConfig().data;
  const user = useAuth((s) => s.user);
  const lang = useSettings((s) => s.lang);

  useEffect(() => {
    if (cfg?.music) setMusicSources(cfg.music);
  }, [cfg?.music]);

  // The device's language choice wins; keep the server (notifications/emails) in sync.
  useEffect(() => {
    if (user && user.lang !== lang) {
      useAuth.getState().patchUser({ lang });
      void api('/me/preferences', { method: 'PATCH', body: { lang } }).catch(() => undefined);
    }
  }, [user, lang]);

  // Refresh account data when the app returns to the foreground.
  useEffect(() => {
    if (!isNative) return;
    const h = CapApp.addListener('resume', () => void useAuth.getState().loadMe().catch(() => undefined));
    return () => void h.then((x) => x.remove());
  }, []);

  return (
    <>
      <UpdatePrompt />
      <PushExplainer />
      <VerifyEmailPrompt />
    </>
  );
}
