import { App as CapApp } from '@capacitor/app';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useConfig } from '../hooks/queries';
import { api } from '../lib/api';
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
    </>
  );
}
