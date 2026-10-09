import { passwordSchema } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { offerToSavePassword } from '../lib/credentials';
import { setLang, useLang, useT } from '../lib/i18n';
import { passkeysSupported, registerPasskey } from '../lib/passkey';
import { haptic } from '../lib/platform';
import { enablePush, pushPermission } from '../lib/push';
import { useSettings, type Theme } from '../lib/settings';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';

type Tone = 'primary' | 'accent' | 'success' | 'danger' | 'warning' | 'cyan' | 'coin' | 'neutral';

function Row({ icon, tone = 'primary', title, sub, right, onClick, to, danger }: { icon: IconName; tone?: Tone; title: string; sub?: ReactNode; right?: ReactNode; onClick?: () => void; to?: string; danger?: boolean }) {
  const body = (
    <>
      <IconTile name={icon} tone={danger ? 'danger' : tone} size={40} />
      <span className="m-text">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right ?? ((onClick || to) && <Icon name="chevron" size={20} />)}
    </>
  );
  if (to) return <Link to={to} className={`menu-row ${danger ? 'danger' : ''}`}>{body}</Link>;
  if (onClick) return <button type="button" className={`menu-row ${danger ? 'danger' : ''}`} onClick={() => (haptic('tap'), onClick())}>{body}</button>;
  return <div className="menu-row">{body}</div>;
}

function ToggleRow({ icon, tone, title, sub, checked, onChange }: { icon: IconName; tone?: Tone; title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="menu-row" style={{ cursor: 'pointer' }}>
      <IconTile name={icon} tone={tone ?? 'primary'} size={40} />
      <span className="m-text">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => (haptic('tap'), onChange(e.target.checked))} />
      </span>
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} aria-selected={value === o.v} onClick={() => (haptic('tap'), onChange(o.v))}>
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChangePassword({ hasPassword, email, onDone }: { hasPassword: boolean; email: string | null; onDone: () => void }) {
  const t = useT();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!passwordSchema.safeParse(next).success) return setErr(t('At least 8 characters with letters and numbers', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা দুটোই থাকতে হবে'));
    setBusy(true);
    try {
      await api('/auth/change-password', { body: { currentPassword: hasPassword ? cur : null, newPassword: next } });
      if (email) void offerToSavePassword(email, next);
      toast.success(t('Password updated', 'পাসওয়ার্ড বদলানো হয়েছে'), t('Other devices were signed out.', 'অন্য ডিভাইসগুলো থেকে লগআউট করা হয়েছে।'), 'lock');
      onDone();
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="col" onSubmit={submit}>
      {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
      {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
      {hasPassword && (
        <div className="field">
          <label htmlFor="current-password">{t('Current password', 'বর্তমান পাসওয়ার্ড')}</label>
          <input id="current-password" name="current-password" className="input" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="new-password">{t('New password', 'নতুন পাসওয়ার্ড')}</label>
        <input id="new-password" name="new-password" className="input" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        <span className="field-hint">{t('At least 8 characters, letters and numbers.', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা।')}</span>
      </div>
      <button className="btn primary block" disabled={busy}>
        {busy ? <span className="spinner" /> : <Icon name="check" />} {hasPassword ? t('Change password', 'পাসওয়ার্ড বদলান') : t('Set a password', 'পাসওয়ার্ড সেট করুন')}
      </button>
    </form>
  );
}

export default function Settings() {
  const s = useSettings();
  const t = useT();
  const lang = useLang();
  const me = useAuth((x) => x.user)!;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  const [sheet, setSheet] = useState<null | 'password' | 'devices' | 'delete'>(null);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: async () => (await api<{ items: any[] }>('/auth/sessions')).items, enabled: sheet === 'devices' });
  const passkeys = useQuery({ queryKey: ['passkeys'], queryFn: async () => (await api<{ items: any[] }>('/auth/passkeys')).items });
  const [perm, setPerm] = useState<string>('…');
  const [delPw, setDelPw] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [delErr, setDelErr] = useState<string | null>(null);

  useEffect(() => {
    void pushPermission().then(setPerm);
  }, []);

  const setPref = async (p: { availableForBattle?: boolean; dnd?: boolean; emailActivity?: boolean }) => {
    useAuth.getState().patchUser(p);
    try {
      await api('/me/preferences', { method: 'PATCH', body: p });
      if (p.availableForBattle !== undefined || p.dnd !== undefined)
        void emit('presence:set', { ...(p.availableForBattle !== undefined ? { available: p.availableForBattle } : {}), ...(p.dnd !== undefined ? { status: p.dnd ? 'dnd' : 'online' } : {}) }).catch(() => undefined);
    } catch (e) {
      toast.error(t('Could not save', 'সেভ করা যায়নি'), friendlyError(e));
    }
  };

  const signOut = async (all = false) => {
    if (all) await api('/auth/logout-all', { method: 'POST' }).catch(() => undefined);
    await useAuth.getState().logout();
    qc.clear();
    nav('/login', { replace: true });
  };

  const permLabel =
    perm === 'granted' ? t('On', 'চালু') : perm === 'denied' ? t('Blocked in device settings', 'ডিভাইস সেটিংসে বন্ধ') : perm === 'unsupported' ? t('Not available on this device', 'এই ডিভাইসে নেই') : t('Off', 'বন্ধ');

  return (
    <div className="page stack settings">
      <PageHeader title={t('Settings', 'সেটিংস')} back />

      <Link to="/profile" className="card settings-me">
        <span className="avatar" style={{ width: 52, height: 52, fontSize: 52 }}>
          {me.avatarThumbUrl ? <img src={me.avatarThumbUrl} alt="" /> : <span className="initial">{me.username[0]?.toUpperCase()}</span>}
        </span>
        <span className="grow">
          <b>{me.username}</b>
          <small className="faint">{me.uid} · {me.email ?? t('Google account', 'Google অ্যাকাউন্ট')}</small>
        </span>
        <Icon name="chevron" size={20} />
      </Link>

      <div className="section-label">{t('Language & display', 'ভাষা ও ডিসপ্লে')}</div>
      <section className="menu">
        <div className="menu-row stack-row">
          <IconTile name="languages" tone="primary" size={40} />
          <span className="m-text"><b>{t('Language', 'ভাষা')}</b><small>{t('App, notifications and emails', 'অ্যাপ, নোটিফিকেশন ও ইমেইল')}</small></span>
          <Segmented value={lang} label={t('Language', 'ভাষা')} onChange={(v) => setLang(v, true)} options={[{ v: 'bn', label: 'বাংলা' }, { v: 'en', label: 'English' }]} />
        </div>
        <div className="menu-row stack-row">
          <IconTile name="sun" tone="warning" size={40} />
          <span className="m-text"><b>{t('Theme', 'থিম')}</b></span>
          <Segmented<Theme>
            value={s.theme}
            label={t('Theme', 'থিম')}
            onChange={(v) => s.set({ theme: v })}
            options={[
              { v: 'light', label: t('Light', 'লাইট'), icon: 'sun' },
              { v: 'dark', label: t('Dark', 'ডার্ক'), icon: 'moon' },
              { v: 'system', label: t('Auto', 'অটো'), icon: 'smartphone' },
            ]}
          />
        </div>
        <ToggleRow icon="sparkles" tone="accent" title={t('Reduce motion', 'অ্যানিমেশন কমান')} sub={t('Fewer animations', 'কম অ্যানিমেশন')} checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
      </section>

      <div className="section-label">{t('Sound & feel', 'সাউন্ড ও অনুভূতি')}</div>
      <section className="menu">
        <ToggleRow icon="volume" tone="cyan" title={t('Sound effects', 'সাউন্ড ইফেক্ট')} checked={s.sound} onChange={(v) => s.set({ sound: v })} />
        <ToggleRow icon="music" tone="accent" title={t('Music', 'মিউজিক')} sub={t('Background music in menus and battles', 'মেনু ও ব্যাটলে ব্যাকগ্রাউন্ড মিউজিক')} checked={s.music} onChange={(v) => s.set({ music: v })} />
        <ToggleRow icon="vibrate" tone="success" title={t('Vibration', 'ভাইব্রেশন')} sub={t('Haptic feedback on taps and results', 'বাটন ও ফলাফলে হালকা কম্পন')} checked={s.haptics} onChange={(v) => s.set({ haptics: v })} />
      </section>

      <div className="section-label">{t('Battles', 'ব্যাটল')}</div>
      <section className="menu">
        <ToggleRow icon="swords" tone="danger" title={t('Available for battle', 'ব্যাটলের জন্য প্রস্তুত')} sub={t('Friends can send you challenges', 'বন্ধুরা আপনাকে চ্যালেঞ্জ পাঠাতে পারবে')} checked={me.availableForBattle} onChange={(v) => void setPref({ availableForBattle: v })} />
        <ToggleRow icon="bell-off" tone="neutral" title={t('Do not disturb', 'বিরক্ত করবেন না')} sub={t('Hide from invites and mute alerts', 'আমন্ত্রণ ও অ্যালার্ট বন্ধ থাকবে')} checked={me.dnd} onChange={(v) => void setPref({ dnd: v })} />
      </section>

      <div className="section-label">{t('Notifications', 'নোটিফিকেশন')}</div>
      <section className="menu">
        <Row
          icon="bell-ring"
          title={t('Push notifications', 'পুশ নোটিফিকেশন')}
          sub={permLabel}
          right={
            perm === 'prompt' ? (
              <button
                className="btn sm soft"
                onClick={async () => {
                  const r = await enablePush(cfg?.vapidPublicKey ?? null).catch(() => 'denied' as const);
                  setPerm(r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'unsupported');
                  if (r === 'granted') toast.success(t('Notifications are on', 'নোটিফিকেশন চালু হয়েছে'), undefined, 'bell');
                }}
              >
                {t('Turn on', 'চালু করুন')}
              </button>
            ) : perm === 'granted' ? (
              <span className="chip success"><Icon name="check" /> {t('On', 'চালু')}</span>
            ) : undefined
          }
        />
        <ToggleRow icon="mail" tone="warning" title={t('Email notifications', 'ইমেইল নোটিফিকেশন')} sub={t('Achievements, promotions and streaks', 'অ্যাচিভমেন্ট, লীগ উন্নতি ও স্ট্রিক')} checked={me.emailActivity} onChange={(v) => void setPref({ emailActivity: v })} />
      </section>

      <div className="section-label">{t('Account & security', 'অ্যাকাউন্ট ও নিরাপত্তা')}</div>
      <section className="menu">
        <Row
          icon="at"
          title={t('Email', 'ইমেইল')}
          sub={me.email ? `${me.email} · ${me.emailVerified ? t('verified', 'নিশ্চিত') : t('not verified', 'নিশ্চিত নয়')}` : t('Signed in with Google', 'Google দিয়ে লগইন')}
          right={
            me.email && !me.emailVerified ? (
              <button className="btn sm soft" onClick={() => void api('/auth/resend-verification', { method: 'POST' }).then(() => toast.success(t('Verification email sent', 'যাচাইয়ের ইমেইল পাঠানো হয়েছে'), undefined, 'mail')).catch((e) => toast.error(t('Could not send', 'পাঠানো যায়নি'), friendlyError(e)))}>
                {t('Verify', 'নিশ্চিত করুন')}
              </button>
            ) : me.emailVerified ? (
              <Icon name="verified" size={20} style={{ color: 'var(--success)' }} />
            ) : undefined
          }
        />
        <Row icon="lock" tone="accent" title={me.hasPassword ? t('Change password', 'পাসওয়ার্ড পরিবর্তন') : t('Set a password', 'পাসওয়ার্ড সেট করুন')} onClick={() => setSheet('password')} />
        {passkeysSupported() && (
          <Row
            icon="fingerprint"
            tone="success"
            title={t('Passkeys', 'পাসকি')}
            sub={passkeys.data?.length ? t(`${passkeys.data.length} saved — sign in with fingerprint or face`, `${passkeys.data.length}টি সেভ করা — ফিঙ্গারপ্রিন্ট বা ফেস দিয়ে লগইন`) : t('Sign in with fingerprint, face or screen lock', 'ফিঙ্গারপ্রিন্ট, ফেস বা স্ক্রিন লক দিয়ে লগইন')}
            right={
              <button
                className="btn sm soft"
                onClick={async () => {
                  try {
                    await registerPasskey(navigator.userAgent.includes('Android') ? 'Android' : 'Browser');
                    toast.success(t('Passkey added', 'পাসকি যোগ হয়েছে'), t('Next time sign in with your fingerprint.', 'পরেরবার ফিঙ্গারপ্রিন্ট দিয়ে লগইন করুন।'), 'fingerprint');
                    void passkeys.refetch();
                  } catch (e) {
                    if ((e as Error).name !== 'NotAllowedError') toast.error(t('Could not add passkey', 'পাসকি যোগ করা যায়নি'), friendlyError(e));
                  }
                }}
              >
                <Icon name="plus" /> {t('Add', 'যোগ')}
              </button>
            }
          />
        )}
        {passkeys.data?.map((p) => (
          <Row
            key={p.id}
            icon="key"
            tone="neutral"
            title={p.name}
            sub={t(`Added ${new Date(p.createdAt).toLocaleDateString()}`, `যোগ করা হয়েছে ${new Date(p.createdAt).toLocaleDateString('bn-BD')}`)}
            right={
              <button className="btn icon sm ghost" aria-label={t('Remove passkey', 'পাসকি মুছুন')} onClick={() => void api(`/auth/passkeys/${p.id}`, { method: 'DELETE' }).then(() => passkeys.refetch())}>
                <Icon name="trash" size={18} />
              </button>
            }
          />
        ))}
        <Row icon="smartphone" tone="cyan" title={t('Devices & sessions', 'ডিভাইস ও সেশন')} sub={t('See where you’re signed in', 'কোথায় কোথায় লগইন আছে দেখুন')} onClick={() => setSheet('devices')} />
      </section>

      <div className="section-label">{t('Help & information', 'সাহায্য ও তথ্য')}</div>
      <section className="menu">
        <Row icon="headset" tone="success" title={t('Help & support', 'সাহায্য ও সাপোর্ট')} sub={cfg?.supportEmail ?? 'support.quizwarbd@gmail.com'} to="/about#support" />
        <Row icon="info" title={t('About QUIZ WAR', 'QUIZ WAR সম্পর্কে')} sub={t('Version, privacy, terms', 'ভার্সন, প্রাইভেসি, শর্তাবলি')} to="/about" />
        <Row icon="shield-check" tone="accent" title={t('Privacy policy', 'প্রাইভেসি পলিসি')} to="/legal/privacy" />
        <Row icon="file" tone="neutral" title={t('Terms of service', 'ব্যবহারের শর্তাবলি')} to="/legal/terms" />
      </section>

      <section className="menu">
        <Row icon="logout" tone="warning" title={t('Sign out', 'লগআউট')} onClick={() => void signOut()} />
        <Row icon="trash" danger title={t('Delete account', 'অ্যাকাউন্ট মুছে ফেলুন')} sub={t('Permanently remove your data', 'আপনার তথ্য স্থায়ীভাবে মুছে যাবে')} onClick={() => setSheet('delete')} />
      </section>

      <Sheet open={sheet === 'password'} onClose={() => setSheet(null)} title={me.hasPassword ? t('Change password', 'পাসওয়ার্ড পরিবর্তন') : t('Set a password', 'পাসওয়ার্ড সেট করুন')} icon="lock">
        <ChangePassword hasPassword={me.hasPassword} email={me.email} onDone={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === 'devices'} onClose={() => setSheet(null)} title={t('Devices & sessions', 'ডিভাইস ও সেশন')} icon="smartphone">
        <div className="list">
          {sessions.data?.map((x) => (
            <div key={x.id} className="list-row">
              <IconTile name={x.platform === 'android' ? 'smartphone' : 'monitor'} tone={x.current ? 'success' : 'neutral'} size={40} />
              <div className="grow">
                <b className="small">
                  {x.deviceName ?? (x.platform === 'android' ? t('Android app', 'অ্যান্ড্রয়েড অ্যাপ') : t('Web browser', 'ওয়েব ব্রাউজার'))}{' '}
                  {x.current && <span className="chip success">{t('This device', 'এই ডিভাইস')}</span>}
                </b>
                <p className="xs muted ellipsis">{new Date(x.lastUsedAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')} · {x.ip}</p>
              </div>
              {!x.current && (
                <button className="btn sm ghost" onClick={() => void api(`/auth/sessions/${x.id}`, { method: 'DELETE' }).then(() => sessions.refetch())}>
                  {t('Sign out', 'লগআউট')}
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="btn outline block mt" onClick={() => void signOut(true)}>
          <Icon name="logout" /> {t('Sign out of all devices', 'সব ডিভাইস থেকে লগআউট')}
        </button>
      </Sheet>

      <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title={t('Delete your account', 'অ্যাকাউন্ট মুছে ফেলুন')} icon="trash">
        <form
          className="col"
          onSubmit={async (e) => {
            e.preventDefault();
            setDelErr(null);
            try {
              await api('/auth/account', { method: 'DELETE', body: { password: delPw || null, confirmation: delConfirm } });
              await useAuth.getState().logout();
              qc.clear();
              toast.success(t('Account deleted', 'অ্যাকাউন্ট মুছে ফেলা হয়েছে'), t('Your personal data has been removed.', 'আপনার ব্যক্তিগত তথ্য মুছে ফেলা হয়েছে।'));
              nav('/login', { replace: true });
            } catch (err) {
              setDelErr(friendlyError(err));
            }
          }}
        >
          <p className="small muted">
            {t(
              'This permanently deletes your profile, friends, squad membership, passkeys and personal data. Match records stay anonymised. This cannot be undone.',
              'এতে আপনার প্রোফাইল, বন্ধু, স্কোয়াড, পাসকি ও ব্যক্তিগত তথ্য স্থায়ীভাবে মুছে যাবে। ম্যাচের রেকর্ড নামহীন অবস্থায় থাকবে। এটা আর ফেরানো যাবে না।',
            )}
          </p>
          {delErr && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {delErr}</p>}
          {me.hasPassword && (
            <div className="field">
              <label htmlFor="dp">{t('Password', 'পাসওয়ার্ড')}</label>
              <input id="dp" className="input" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="dc">{t('Type DELETE to confirm', 'নিশ্চিত করতে DELETE লিখুন')}</label>
            <input id="dc" className="input" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} autoCapitalize="characters" spellCheck={false} />
          </div>
          <button className="btn danger block" disabled={delConfirm !== 'DELETE'}>
            <Icon name="trash" /> {t(`Delete “${me.username}”`, `“${me.username}” মুছে ফেলুন`)}
          </button>
        </form>
      </Sheet>
      <p className="center xs faint">QUIZ WAR: Bangladesh · v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'}</p>
    </div>
  );
}
