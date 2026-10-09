import { CONTACT_TYPES, type AppSettings as App, type ContactType } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Loading } from '../components/ui';
import { api, errMsg } from '../lib/api';

type Msg = { ok?: string; err?: string };
const MAX_MUSIC = 12 * 1024 * 1024;

const CONTACT_META: Record<ContactType, { label: string; placeholder: string }> = {
  whatsapp: { label: 'WhatsApp', placeholder: 'https://wa.me/8801XXXXXXXXX' },
  facebook: { label: 'Facebook page', placeholder: 'https://facebook.com/yourpage' },
  messenger: { label: 'Messenger', placeholder: 'https://m.me/yourpage' },
  telegram: { label: 'Telegram', placeholder: 'https://t.me/yourchannel' },
  youtube: { label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  website: { label: 'Website', placeholder: 'https://example.com' },
  phone: { label: 'Phone', placeholder: 'tel:+8801XXXXXXXXX' },
  email: { label: 'Email', placeholder: 'mailto:support@example.com' },
};

/** Saves a partial app-settings body and reports the result next to the card's Save button. */
function useSaver() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<Msg>({});
  const [busy, setBusy] = useState(false);
  const save = async (body: Partial<App>, ok = 'Saved.') => {
    setBusy(true);
    setMsg({});
    try {
      const r = await api<App>('/settings/app', { method: 'PUT', body });
      setMsg({ ok });
      void qc.invalidateQueries({ queryKey: ['settings'] });
      return r;
    } catch (e) {
      setMsg({ err: errMsg(e) });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { msg, setMsg, busy, save };
}

function Card({ icon, title, desc, children, wide, onSubmit, saving, msg, saveLabel }: { icon: string; title: string; desc?: ReactNode; children: ReactNode; wide?: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void; saving: boolean; msg: Msg; saveLabel: string }) {
  return (
    <form className={`card form${wide ? ' span-all' : ''}`} onSubmit={(e) => (e.preventDefault(), onSubmit(e))} aria-label={title}>
      <div className="card-head"><span className="cat-ic"><Icon name={icon} size={20} /></span><div><h2>{title}</h2>{desc && <p className="small muted">{desc}</p>}</div></div>
      {children}
      <div className="row">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
        <span role="status" className="grow">{msg.ok && <span className="small" style={{ color: 'var(--success)', fontWeight: 700 }}>{msg.ok}</span>}</span>
      </div>
      {msg.err && <p className="err" role="alert">{msg.err}</p>}
    </form>
  );
}

function Toggle({ name, label, hint, checked }: { name: string; label: string; hint?: string; checked: boolean }) {
  return <label className="switch"><input type="checkbox" name={name} defaultChecked={checked} /><span>{label}{hint && <small>{hint}</small>}</span></label>;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const int = (f: FormData, k: string) => Math.max(0, Math.round(Number(f.get(k) || 0)));

function Branding({ a }: { a: App }) {
  const s = useSaver();
  return (
    <Card icon="image" title="Branding" desc="Name and colours shown in the player app." saving={s.busy} msg={s.msg} saveLabel="Save branding"
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        void s.save({ appName: str(f, 'appName'), logoUrl: str(f, 'logoUrl') || null, faviconUrl: str(f, 'faviconUrl') || null, primaryColor: str(f, 'primaryColor'), accentColor: str(f, 'accentColor') }, 'Branding saved.');
      }}>
      <div className="field"><label htmlFor="as-name">App name</label><input id="as-name" name="appName" className="input" required maxLength={60} defaultValue={a.appName} /></div>
      <div className="cols">
        <div className="field"><label htmlFor="as-logo">Logo URL</label><input id="as-logo" name="logoUrl" className="input" maxLength={500} defaultValue={a.logoUrl ?? ''} placeholder="https://…/logo.png" /></div>
        <div className="field"><label htmlFor="as-fav">Favicon URL</label><input id="as-fav" name="faviconUrl" className="input" maxLength={500} defaultValue={a.faviconUrl ?? ''} placeholder="https://…/favicon.svg" /></div>
      </div>
      <div className="cols">
        <div className="field"><label htmlFor="as-pc">Primary colour</label><div className="color-row"><input id="as-pc" name="primaryColor" type="color" defaultValue={a.primaryColor} /></div></div>
        <div className="field"><label htmlFor="as-ac">Accent colour</label><div className="color-row"><input id="as-ac" name="accentColor" type="color" defaultValue={a.accentColor} /></div></div>
      </div>
    </Card>
  );
}

function Access({ a }: { a: App }) {
  const s = useSaver();
  return (
    <Card icon="shield" title="Access & features" desc="Turn sign-in methods and features on or off for every player." saving={s.busy} msg={s.msg} saveLabel="Save access settings"
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        const on = (k: string) => f.get(k) === 'on';
        void s.save({ maintenanceMode: on('maintenanceMode'), maintenanceMessage: str(f, 'maintenanceMessage'), registrationEnabled: on('registrationEnabled'), googleLoginEnabled: on('googleLoginEnabled'), passkeyEnabled: on('passkeyEnabled'), notificationsEnabled: on('notificationsEnabled') }, 'Access settings saved.');
      }}>
      <Toggle name="maintenanceMode" label="Maintenance mode" hint="Players see the maintenance message instead of the game." checked={a.maintenanceMode} />
      <div className="field"><label htmlFor="as-mm">Maintenance message</label><textarea id="as-mm" name="maintenanceMessage" className="input" maxLength={500} rows={2} defaultValue={a.maintenanceMessage} style={{ fontFamily: 'var(--font-bn)' }} /></div>
      <Toggle name="registrationEnabled" label="Allow new registrations" checked={a.registrationEnabled} />
      <Toggle name="googleLoginEnabled" label="Google sign-in" checked={a.googleLoginEnabled} />
      <Toggle name="passkeyEnabled" label="Passkey sign-in" checked={a.passkeyEnabled} />
      <Toggle name="notificationsEnabled" label="Notifications" hint="In-app and push notifications." checked={a.notificationsEnabled} />
    </Card>
  );
}

type Row = App['contacts'][number] & { key: number };
let rowKey = 0;

function Support({ a }: { a: App }) {
  const s = useSaver();
  const [rows, setRows] = useState<Row[]>(() => a.contacts.map((c) => ({ ...c, key: ++rowKey })));
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRows(next);
  };
  const changeType = (i: number, type: ContactType) => {
    const r = rows[i];
    set(i, { type, label: !r.label || r.label === CONTACT_META[r.type].label ? CONTACT_META[type].label : r.label });
  };
  return (
    <Card icon="mail" wide title="Support & contact" desc="Shown on the player app's Help & support screen. The email button opens the player's mail app." saving={s.busy} msg={s.msg} saveLabel="Save support settings"
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        void s.save({ supportEmail: str(f, 'supportEmail'), contacts: rows.map(({ type, label, url }) => ({ type, label: label.trim(), url: url.trim() })) }, 'Support settings saved.');
      }}>
      <div className="field" style={{ maxWidth: 420 }}><label htmlFor="as-se">Support email</label><input id="as-se" name="supportEmail" type="email" className="input" required maxLength={190} defaultValue={a.supportEmail} placeholder="support.quizwarbd@gmail.com" /></div>
      <div>
        <h3>Contact links <span className="small faint">({rows.length}/12)</span></h3>
        {!rows.length && <p className="small muted">No contact links yet. Add WhatsApp, Facebook, Telegram and other channels players can use to reach you.</p>}
        {rows.map((r, i) => (
          <div key={r.key} className="contact-row" role="group" aria-label={`Contact ${i + 1}: ${r.label || CONTACT_META[r.type].label}`}>
            <span className="brand-ic"><Icon name={r.type} size={26} /></span>
            <div className="field f-type"><label htmlFor={`ct-t-${r.key}`}>Type</label><select id={`ct-t-${r.key}`} className="input" value={r.type} onChange={(e) => changeType(i, e.target.value as ContactType)}>{CONTACT_TYPES.map((t) => <option key={t} value={t}>{CONTACT_META[t].label}</option>)}</select></div>
            <div className="actions">
              <button type="button" className="btn icon-btn" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrow-up" size={16} /></button>
              <button type="button" className="btn icon-btn" aria-label="Move down" title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><Icon name="arrow-down" size={16} /></button>
              <button type="button" className="btn icon-btn" aria-label="Remove contact" title="Remove contact" style={{ color: 'var(--danger)' }} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
            </div>
            <div className="field f-label"><label htmlFor={`ct-l-${r.key}`}>Label</label><input id={`ct-l-${r.key}`} className="input" required maxLength={40} value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={CONTACT_META[r.type].label} /></div>
            <div className="field f-url"><label htmlFor={`ct-u-${r.key}`}>Link</label><input id={`ct-u-${r.key}`} className="input" required minLength={3} maxLength={500} value={r.url} onChange={(e) => set(i, { url: e.target.value })} placeholder={CONTACT_META[r.type].placeholder} inputMode={r.type === 'phone' ? 'tel' : 'url'} /></div>
          </div>
        ))}
        <button type="button" className="btn mt" disabled={rows.length >= 12} onClick={() => setRows([...rows, { type: 'whatsapp', label: CONTACT_META.whatsapp.label, url: '', key: ++rowKey }])}><Icon name="plus" size={16} />Add contact link</button>
      </div>
    </Card>
  );
}

const SLOTS = [
  { slot: 'menu', key: 'menuUrl', title: 'Menu music', hint: 'Plays on the home screen and menus.' },
  { slot: 'match', key: 'matchUrl', title: 'Match music', hint: 'Plays during battles.' },
] as const;

function MusicCard({ a }: { a: App }) {
  const s = useSaver();
  const qc = useQueryClient();
  const [music, setMusic] = useState(a.music);
  const [slotBusy, setSlotBusy] = useState<string | null>(null);
  const [slotMsg, setSlotMsg] = useState<Record<string, Msg>>({});
  const run = async (slot: string, fn: () => Promise<{ music: App['music'] }>, ok: string) => {
    setSlotBusy(slot);
    setSlotMsg((x) => ({ ...x, [slot]: {} }));
    try {
      const r = await fn();
      setMusic((cur) => ({ ...r.music, volume: cur.volume }));
      setSlotMsg((x) => ({ ...x, [slot]: { ok } }));
      void qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      setSlotMsg((x) => ({ ...x, [slot]: { err: errMsg(e) } }));
    } finally {
      setSlotBusy(null);
    }
  };
  const upload = (slot: string, file: File) => {
    if (file.size > MAX_MUSIC) return setSlotMsg((x) => ({ ...x, [slot]: { err: `This file is ${(file.size / 1048576).toFixed(1)} MB. Choose a file of 12 MB or less.` } }));
    const form = new FormData();
    form.append('file', file);
    void run(slot, () => api(`/music/${slot}`, { form }), 'Uploaded. Players hear it the next time the app loads.');
  };
  return (
    <Card icon="music" title="Music" desc="Background music for the player app. It plays by default when the app opens; players can turn it off in Settings. Upload your own to replace the built-in theme." saving={s.busy} msg={s.msg} saveLabel="Save volume"
      onSubmit={() => void s.save({ music }, 'Volume saved.')}>
      {SLOTS.map(({ slot, key, title, hint }) => {
        const url = music[key];
        const m = slotMsg[slot] ?? {};
        return (
          <div key={slot} className="music-slot">
            <div><h3>{title}</h3><p className="small muted" style={{ margin: 0 }}>{hint}</p></div>
            {url ? (
              <audio controls preload="none" src={url} aria-label={`${title} preview`} />
            ) : (
              <>
                <p className="small faint" style={{ margin: 0 }}>Using the built-in QUIZ WAR theme (original, royalty-free). Listen:</p>
                <audio controls preload="none" src={`/audio/${slot}.mp3`} aria-label={`Built-in ${title.toLowerCase()} preview`} />
              </>
            )}
            <div className="field">
              <label htmlFor={`mu-${slot}`}>{url ? 'Replace file' : 'Upload file'}</label>
              <input id={`mu-${slot}`} type="file" className="input" accept=".mp3,.m4a,.ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg" disabled={slotBusy === slot}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(slot, f); }} />
              <span className="small faint">MP3, M4A or OGG, up to 12 MB.</span>
            </div>
            <div className="row">
              {slotBusy === slot && <span className="small muted" role="status">Working…</span>}
              {url && <button type="button" className="btn sm" style={{ color: 'var(--danger)' }} disabled={slotBusy === slot}
                onClick={() => confirm(`Remove the ${title.toLowerCase()}? The built-in theme plays instead.`) && void run(slot, () => api(`/music/${slot}`, { method: 'DELETE' }), 'Removed.')}><Icon name="trash" size={14} />Remove music</button>}
              {m.ok && <span className="small" role="status" style={{ color: 'var(--success)', fontWeight: 700 }}>{m.ok}</span>}
            </div>
            {m.err && <p className="err" role="alert">{m.err}</p>}
          </div>
        );
      })}
      <div className="field">
        <label htmlFor="mu-vol">Default volume</label>
        <div className="range-row">
          <Icon name="music" size={16} />
          <input id="mu-vol" type="range" min={0} max={1} step={0.05} value={music.volume} onChange={(e) => setMusic({ ...music, volume: Number(e.target.value) })} />
          <output htmlFor="mu-vol">{Math.round(music.volume * 100)}%</output>
        </div>
        <span className="small faint">Players can still change or mute music in their own settings.</span>
      </div>
    </Card>
  );
}

function Emails({ a }: { a: App }) {
  const s = useSaver();
  return (
    <Card icon="mail" title="Emails" desc={<>Emails are only sent when SMTP is configured on the server (see Connections above).</>} saving={s.busy} msg={s.msg} saveLabel="Save email settings"
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        void s.save({ emails: { welcome: f.get('welcome') === 'on', activity: f.get('activity') === 'on' } }, 'Email settings saved.');
      }}>
      <Toggle name="welcome" label="Welcome email" hint="A welcome and congratulation email right after a player signs up." checked={a.emails.welcome} />
      <Toggle name="activity" label="Activity emails" hint="Achievements unlocked, league promotions and streak milestones." checked={a.emails.activity} />
    </Card>
  );
}

function AppUpdate({ a }: { a: App }) {
  const s = useSaver();
  return (
    <Card icon="smartphone" title="App update (Android)" saving={s.busy} msg={s.msg} saveLabel="Save update settings"
      desc="Version codes are the Android versionCode numbers. Players below the latest version see an update popup; below the minimum they must update when forced updates are on."
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        void s.save({ minAppVersionCode: int(f, 'minAppVersionCode'), latestAppVersionCode: int(f, 'latestAppVersionCode'), forceUpdate: f.get('forceUpdate') === 'on', playStoreUrl: str(f, 'playStoreUrl'), updateMessage: str(f, 'updateMessage') }, 'Update settings saved.');
      }}>
      <div className="cols">
        <div className="field"><label htmlFor="up-min">Minimum versionCode</label><input id="up-min" name="minAppVersionCode" type="number" min={0} step={1} className="input" defaultValue={a.minAppVersionCode} /></div>
        <div className="field"><label htmlFor="up-latest">Latest versionCode</label><input id="up-latest" name="latestAppVersionCode" type="number" min={0} step={1} className="input" defaultValue={a.latestAppVersionCode} /></div>
      </div>
      <Toggle name="forceUpdate" label="Force update below the minimum version" hint="Players on older versions cannot play until they update." checked={a.forceUpdate} />
      <div className="field"><label htmlFor="up-url">Play Store URL</label><input id="up-url" name="playStoreUrl" type="url" className="input" maxLength={500} defaultValue={a.playStoreUrl} placeholder="https://play.google.com/store/apps/details?id=…" /></div>
      <div className="field"><label htmlFor="up-msg">Update message</label><textarea id="up-msg" name="updateMessage" className="input" maxLength={300} rows={2} defaultValue={a.updateMessage} style={{ fontFamily: 'var(--font-bn)' }} /></div>
    </Card>
  );
}

function Rate({ a }: { a: App }) {
  const s = useSaver();
  return (
    <Card icon="star" title="Rate the app" desc="Ask happy players to rate QUIZ WAR on the Play Store after a number of wins." saving={s.busy} msg={s.msg} saveLabel="Save rating prompt"
      onSubmit={(e) => void s.save({ ratePromptAfterWins: int(new FormData(e.currentTarget), 'ratePromptAfterWins') }, 'Rating prompt saved.')}>
      <div className="field" style={{ maxWidth: 260 }}><label htmlFor="rt-wins">Ask after this many wins</label><input id="rt-wins" name="ratePromptAfterWins" type="number" min={0} max={1000} step={1} className="input" defaultValue={a.ratePromptAfterWins} /><span className="small faint">0 = never ask.</span></div>
    </Card>
  );
}

function Legal({ a }: { a: App }) {
  const s = useSaver();
  return (
    <Card icon="scroll" title="Legal pages" desc="Linked from sign-up and the settings screen." saving={s.busy} msg={s.msg} saveLabel="Save legal links"
      onSubmit={(e) => {
        const f = new FormData(e.currentTarget);
        void s.save({ privacyUrl: str(f, 'privacyUrl'), termsUrl: str(f, 'termsUrl') }, 'Legal links saved.');
      }}>
      <div className="field"><label htmlFor="lg-p">Privacy Policy URL</label><input id="lg-p" name="privacyUrl" className="input" maxLength={500} defaultValue={a.privacyUrl} placeholder="/legal/privacy" /></div>
      <div className="field"><label htmlFor="lg-t">Terms URL</label><input id="lg-t" name="termsUrl" className="input" maxLength={500} defaultValue={a.termsUrl} placeholder="/legal/terms" /></div>
    </Card>
  );
}

type Integrations = {
  google: { configured: boolean; enabled: boolean; clientId: string | null; extraAudiences: number };
  passkey: { enabled: boolean; rpId: string; webOrigins: string[]; androidOrigin: boolean; androidFingerprints: number; rpMatchesSite: boolean };
  email: { configured: boolean; host: string | null; from: string };
  push: { web: boolean; android: boolean; firebaseProject: string | null };
  ai: { configured: boolean };
  publicWebUrl: string;
};

function StatusRow({ ok, warn, title, detail, fix }: { ok: boolean; warn?: boolean; title: string; detail: ReactNode; fix?: ReactNode }) {
  const tone = ok ? 'var(--success)' : warn ? 'var(--warning, #d97706)' : 'var(--danger)';
  return (
    <div className="int-row">
      <span className="int-dot" style={{ color: tone }}><Icon name={ok ? 'check' : 'alert'} size={18} /></span>
      <div className="grow">
        <b>{title}</b> <span className="small" style={{ color: tone, fontWeight: 700 }}>{ok ? 'Working · চালু' : warn ? 'Partly set · আংশিক' : 'Not set · সেট করা নেই'}</span>
        <div className="small muted">{detail}</div>
        {!ok && fix && <div className="small int-fix">{fix}</div>}
      </div>
    </div>
  );
}

/** Live check of server-side services — shows what is missing and which Hostinger variable fixes it. */
function IntegrationsCard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['integrations'], queryFn: () => api<Integrations>('/integrations') });
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState<Msg>({});
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    setMsg({});
    try {
      await api('/integrations/test-email', { method: 'POST', body: { to } });
      setMsg({ ok: `Test email sent to ${to} · টেস্ট ইমেইল পাঠানো হয়েছে` });
    } catch (e) {
      setMsg({ err: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card form span-all" aria-label="Connections">
      <div className="card-head">
        <span className="cat-ic"><Icon name="link" size={20} /></span>
        <div>
          <h2>Connections · সংযোগ অবস্থা</h2>
          <p className="small muted">Google login, passkeys, email and push only switch on when their keys are set in Hostinger → Node.js app → Environment variables (then restart). Secrets are never shown here.</p>
        </div>
      </div>
      {isLoading ? <Loading rows={4} /> : error || !data ? <p className="err">{errMsg(error)}</p> : (
        <div className="int-list">
          <StatusRow
            ok={data.google.configured && data.google.enabled}
            warn={data.google.configured && !data.google.enabled}
            title="Google login"
            detail={data.google.configured ? <>Client ID …{data.google.clientId?.slice(-28)} {data.google.enabled ? '' : '· turned off in Access & features'}</> : 'Players do not see the "Continue with Google" button.'}
            fix={<>Set <code>GOOGLE_CLIENT_ID</code> (Web client ID from Google Cloud Console). For the Android app also create an Android OAuth client with the app's SHA-1.</>}
          />
          <StatusRow
            ok={data.passkey.enabled && data.passkey.rpMatchesSite && data.passkey.androidOrigin && data.passkey.androidFingerprints > 0}
            warn={data.passkey.enabled && data.passkey.rpMatchesSite}
            title="Passkey"
            detail={<>RP ID <code>{data.passkey.rpId}</code> · web {data.passkey.webOrigins.join(', ') || '—'} · Android app {data.passkey.androidOrigin && data.passkey.androidFingerprints ? 'ready' : 'not linked'}</>}
            fix={<>Website passkeys need <code>WEBAUTHN_RP_ID</code> = your domain. For the Android app add <code>ANDROID_SHA256_CERT_FINGERPRINTS</code> and append <code>android:apk-key-hash:…</code> to <code>WEBAUTHN_ORIGIN</code> (values are printed on the GitHub APK release page).</>}
          />
          <StatusRow
            ok={data.email.configured}
            title="Email (SMTP)"
            detail={data.email.configured ? <>Server {data.email.host} · from {data.email.from}</> : 'Welcome, verification and password-reset emails are NOT being sent.'}
            fix={<>Gmail: set <code>SMTP_HOST=smtp.gmail.com</code>, <code>SMTP_PORT=465</code>, <code>SMTP_USER</code>=your Gmail, <code>SMTP_PASS</code>=16-letter App Password, <code>MAIL_FROM</code>.</>}
          />
          <StatusRow
            ok={data.push.web && data.push.android}
            warn={data.push.web || data.push.android}
            title="Push notifications"
            detail={<>Website/PWA {data.push.web ? 'on' : 'off'} · Android {data.push.android ? `on (${data.push.firebaseProject})` : 'off'}</>}
            fix={<>Website: <code>VAPID_PUBLIC_KEY</code> + <code>VAPID_PRIVATE_KEY</code>. Android: <code>FCM_SERVICE_ACCOUNT_JSON</code> on the server and the <code>QW_GOOGLE_SERVICES_JSON_BASE64</code> GitHub secret for the APK.</>}
          />
          <StatusRow ok={data.ai.configured} title="AI question generator" detail={data.ai.configured ? 'OpenAI key found.' : 'OpenAI key missing.'} fix={<>Set <code>OPENAI_API_KEY</code>.</>} />
        </div>
      )}
      {data?.email.configured && (
        <form className="row" onSubmit={(e) => (e.preventDefault(), void test())}>
          <input className="input grow" type="email" required placeholder="you@gmail.com" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send a test email to" />
          <button className="btn" disabled={busy || !to}><Icon name="mail" size={16} /> {busy ? 'Sending…' : 'Send test email'}</button>
        </form>
      )}
      {msg.ok && <p className="small" role="status" style={{ color: 'var(--success)', fontWeight: 700 }}>{msg.ok}</p>}
      {msg.err && <p className="err" role="alert">{msg.err}</p>}
    </section>
  );
}

export default function AppSettings() {
  const { data, isLoading, error } = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  if (isLoading) return <Loading rows={10} />;
  if (error || !data) return <p className="err">{errMsg(error)}</p>;
  const a = data.app as App;
  return (
    <>
      <div className="head"><h1>App settings</h1><span className="small faint">Each card saves on its own. Every change is audit-logged.</span></div>
      <div className="settings-grid">
        <IntegrationsCard />
        <Branding a={a} />
        <Access a={a} />
        <Support a={a} />
        <MusicCard a={a} />
        <Emails a={a} />
        <AppUpdate a={a} />
        <Rate a={a} />
        <Legal a={a} />
      </div>
    </>
  );
}
