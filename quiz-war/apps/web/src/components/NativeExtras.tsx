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

/** Android app update prompt (forced when the installed build is below the minimum). */
function UpdatePrompt() {
  const cfg = useConfig().data;
  const t = useT();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Number(localStorage.getItem('qw-update-dismissed') ?? 0);
    } catch {
      return 0;
    }
  });
  if (!isNative || !cfg) return null;
  const code = appVersionCode();
  if (!code) return null;
  const forced = code < cfg.minAppVersionCode || (cfg.forceUpdate && code < cfg.latestAppVersionCode);
  const optional = !forced && code < cfg.latestAppVersionCode && dismissed < cfg.latestAppVersionCode;
  if (!forced && !optional) return null;
  const open = () => {
    const url = cfg.playStoreUrl || 'https://play.google.com/store/apps/details?id=app.quizwar.bd';
    window.location.href = url;
  };
  return (
    <Modal
      open
      dismissible={!forced}
      label={t('Update available', 'আপডেট এসেছে')}
      onClose={() => {
        try {
          localStorage.setItem('qw-update-dismissed', String(cfg.latestAppVersionCode));
        } catch {
          /* ignore */
        }
        setDismissed(cfg.latestAppVersionCode);
      }}
    >
      <div className="m-art">
        <IconTile name="rocket" tone="primary" size={76} anim="float" />
      </div>
      <h2>{forced ? t('Please update QUIZ WAR', 'QUIZ WAR আপডেট করুন') : t('A new version is here!', 'নতুন ভার্সন এসেছে!')}</h2>
      <p>{cfg.updateMessage || t('New features and improvements are waiting for you.', 'নতুন ফিচার আর উন্নতি আপনার অপেক্ষায়।')}</p>
      {forced && <p className="xs faint">{t('This version is no longer supported.', 'এই ভার্সনটি আর চালানো যাবে না।')}</p>}
      <div className={`modal-actions ${forced ? 'one' : ''}`}>
        {!forced && (
          <button className="btn outline" onClick={() => (document.querySelector('dialog.modal[open]') as HTMLDialogElement | null)?.dispatchEvent(new Event('cancel', { cancelable: true }))}>
            {t('Later', 'পরে')}
          </button>
        )}
        <button className="btn primary" onClick={open}>
          <Icon name="download" /> {t('Update now', 'এখনই আপডেট করুন')}
        </button>
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
    }, 3500);
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

  if (!need) return null;
  return (
    <Modal open={open} onClose={() => setOpen(false)} label={t('Verify your email', 'ইমেইল নিশ্চিত করুন')}>
      <div className="m-art"><IconTile name="mail" tone="primary" size={72} anim="float" /></div>
      <h2>{t('Verify your email', 'ইমেইল নিশ্চিত করুন')}</h2>
      <p>
        {t('We sent a link to', 'আমরা একটি লিংক পাঠিয়েছি')} <b>{user?.email}</b>
        {t('. Tap it to secure your account and recover it if you forget your password.', '-এ। লিংকে চাপ দিলে অ্যাকাউন্ট সুরক্ষিত হবে আর পাসওয়ার্ড ভুলে গেলেও ফিরে পাবেন।')}
      </p>
      <p className="xs faint" style={{ marginTop: 8 }}>{t('Not in your inbox? Check Spam or Promotions.', 'ইনবক্সে না পেলে Spam বা Promotions ফোল্ডার দেখুন।')}</p>
      <div className="modal-actions">
        <button className="btn outline" onClick={() => setOpen(false)}>{t('Later', 'পরে')}</button>
        <button className="btn primary" disabled={busy || cool > 0} onClick={() => void resend()}>
          {busy ? <span className="spinner" /> : <Icon name="mail" />} {cool > 0 ? t(`Resend in ${cool}s`, `${cool} সেকেন্ড পর আবার`) : t('Resend email', 'আবার পাঠান')}
        </button>
      </div>
    </Modal>
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
