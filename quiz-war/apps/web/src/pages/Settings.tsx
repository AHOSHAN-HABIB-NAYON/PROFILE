import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { passkeysSupported, registerPasskey } from '../lib/passkey';
import { enablePush, pushSupported } from '../lib/push';
import { useSettings, type Theme } from '../lib/settings';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="list-row" style={{ cursor: 'pointer' }}>
      <div className="grow"><b>{label}</b>{desc && <p className="xs muted">{desc}</p>}</div>
      <span className="switch"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></span>
    </label>
  );
}

export default function Settings() {
  const s = useSettings();
  const me = useAuth((x) => x.user)!;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: async () => (await api<{ items: any[] }>('/auth/sessions')).items });
  const passkeys = useQuery({ queryKey: ['passkeys'], queryFn: async () => (await api<{ items: any[] }>('/auth/passkeys')).items });
  const history = useQuery({ queryKey: ['login-history'], queryFn: async () => (await api<{ items: any[] }>('/auth/login-history')).items });
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [delErr, setDelErr] = useState<string | null>(null);

  const setPref = async (p: { availableForBattle?: boolean; dnd?: boolean }) => {
    useAuth.getState().patchUser(p);
    try {
      await api('/me/preferences', { method: 'PATCH', body: p });
      void emit('presence:set', { ...(p.availableForBattle !== undefined ? { available: p.availableForBattle } : {}), ...(p.dnd !== undefined ? { status: p.dnd ? 'dnd' : 'online' } : {}) }).catch(() => undefined);
    } catch (e) {
      toast.error('Could not save', friendlyError(e));
    }
  };

  return (
    <div className="page stack">
      <PageHeader title="Settings" back />

      <div className="section-label">Battle</div>
      <section className="card list">
        <Toggle label="Available for Battle" desc="Only available players receive challenges" checked={me.availableForBattle} onChange={(v) => void setPref({ availableForBattle: v })} />
        <Toggle label="🚫 Do Not Disturb" desc="Hide from invites and mute alerts" checked={me.dnd} onChange={(v) => void setPref({ dnd: v })} />
      </section>

      <div className="section-label">Sound & feel</div>
      <section className="card list">
        <Toggle label="Sound effects" checked={s.sound} onChange={(v) => s.set({ sound: v })} />
        <Toggle label="Music" checked={s.music} onChange={(v) => s.set({ music: v })} />
        <Toggle label="Haptic feedback" checked={s.haptics} onChange={(v) => s.set({ haptics: v })} />
        <Toggle label="Reduce motion" desc="Fewer animations" checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
        <div className="list-row">
          <b className="grow">Theme</b>
          <div className="tabs" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => <button key={t} role="radio" aria-checked={s.theme === t} aria-selected={s.theme === t} onClick={() => s.set({ theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
        </div>
      </section>

      <div className="section-label">Notifications</div>
      <section className="card">
        <p className="small muted mb">Get notified about battle requests, friends coming online, daily challenges and streak reminders.</p>
        <button className="btn soft block" disabled={!pushSupported()} onClick={async () => {
          try {
            const r = await enablePush(cfg?.vapidPublicKey ?? null);
            if (r === 'granted') toast.success('Push notifications enabled');
            else if (r === 'denied') toast.error('Permission denied', 'Enable notifications in your device settings.');
            else toast.info('Push not available on this device');
          } catch (e) {
            toast.error('Could not enable push', friendlyError(e));
          }
        }}><Icon name="bell" /> Enable push notifications</button>
      </section>

      <div className="section-label">Account & security</div>
      <section className="card list">
        <div className="list-row"><div className="grow"><b>Email</b><p className="xs muted">{me.email ?? 'Google account'} {me.email && (me.emailVerified ? '· verified ✓' : '· not verified')}</p></div>
          {me.email && !me.emailVerified && <button className="btn sm soft" onClick={() => void api('/auth/resend-verification', { method: 'POST' }).then(() => toast.success('Verification email sent')).catch((e) => toast.error('Could not send', friendlyError(e)))}>Verify</button>}
        </div>
        {passkeysSupported() && (
          <div className="list-row"><div className="grow"><b>Passkeys</b><p className="xs muted">{passkeys.data?.length ? `${passkeys.data.length} saved` : 'Sign in with fingerprint, face or screen lock'}</p></div>
            <button className="btn sm soft" onClick={async () => {
              try {
                await registerPasskey(navigator.userAgent.includes('Android') ? 'Android device' : 'This device');
                toast.success('Passkey added', 'Next time use “Continue with Passkey”.', '🔑');
                void passkeys.refetch();
              } catch (e) {
                if ((e as Error).name !== 'NotAllowedError') toast.error('Could not add passkey', friendlyError(e));
              }
            }}><Icon name="key" /> Add</button>
          </div>
        )}
        {passkeys.data?.map((p) => (
          <div key={p.id} className="list-row"><span>🔑</span><div className="grow"><b className="small">{p.name}</b><p className="xs muted">Added {new Date(p.createdAt).toLocaleDateString()}</p></div>
            <button className="btn sm ghost" aria-label="Remove passkey" onClick={() => void api(`/auth/passkeys/${p.id}`, { method: 'DELETE' }).then(() => passkeys.refetch())}><Icon name="trash" size={16} /></button></div>
        ))}
      </section>

      <div className="section-label">Devices</div>
      <section className="card list">
        {sessions.data?.map((x) => (
          <div key={x.id} className="list-row">
            <span style={{ fontSize: 20 }}>{x.platform === 'android' ? '📱' : '💻'}</span>
            <div className="grow" style={{ minWidth: 0 }}><b className="small">{x.deviceName ?? (x.platform === 'android' ? 'Android app' : 'Web browser')} {x.current && <span className="chip success">This device</span>}</b><p className="xs muted ellipsis">Last active {new Date(x.lastUsedAt).toLocaleString()} · {x.ip}</p></div>
            {!x.current && <button className="btn sm ghost" onClick={() => void api(`/auth/sessions/${x.id}`, { method: 'DELETE' }).then(() => sessions.refetch())}>Sign out</button>}
          </div>
        ))}
        <button className="btn outline block mt" onClick={async () => { await api('/auth/logout-all', { method: 'POST' }); await useAuth.getState().logout(); qc.clear(); nav('/welcome'); }}>Sign out of all devices</button>
      </section>
      <details className="card">
        <summary className="bold">Login history</summary>
        {history.data?.map((h, i) => <p key={i} className="xs muted mt">{h.success ? '✅' : '❌'} {h.method} · {new Date(h.createdAt).toLocaleString()} · {h.ip}</p>)}
      </details>

      <div className="section-label">More</div>
      <section className="card list">
        <Link to="/squads" className="list-row link" style={{ color: 'var(--text)' }}>🛡️ <b className="grow">Squads</b><Icon name="chevron" /></Link>
        <Link to="/shop" className="list-row link" style={{ color: 'var(--text)' }}>🛍️ <b className="grow">Shop</b><Icon name="chevron" /></Link>
        <Link to="/legal/privacy" className="list-row link" style={{ color: 'var(--text)' }}>🔒 <b className="grow">Privacy Policy</b><Icon name="chevron" /></Link>
        <Link to="/legal/terms" className="list-row link" style={{ color: 'var(--text)' }}>📄 <b className="grow">Terms of Service</b><Icon name="chevron" /></Link>
        <Link to="/legal/guidelines" className="list-row link" style={{ color: 'var(--text)' }}>🤝 <b className="grow">Community Guidelines</b><Icon name="chevron" /></Link>
      </section>

      <button className="btn outline block" onClick={async () => { await useAuth.getState().logout(); qc.clear(); nav('/welcome'); }}><Icon name="logout" /> Sign out</button>
      <button className="btn ghost block" style={{ color: 'var(--danger)' }} onClick={() => setDel(true)}>Delete account</button>

      <Sheet open={del} onClose={() => setDel(false)} title="Delete your account">
        <form className="col" onSubmit={async (e) => {
          e.preventDefault();
          setDelErr(null);
          try {
            await api('/auth/account', { method: 'DELETE', body: { password: delPw || null, confirmation: delConfirm } });
            await useAuth.getState().logout();
            qc.clear();
            toast.success('Account deleted', 'Your personal data has been removed.');
            nav('/welcome', { replace: true });
          } catch (err) {
            setDelErr(friendlyError(err));
          }
        }}>
          <p className="small muted">This permanently deletes your profile, friends, squad membership, passkeys and personal data. Match records stay anonymised so other players’ history stays correct. This cannot be undone.</p>
          {delErr && <p className="form-error" role="alert">{delErr}</p>}
          {me.email && <div className="field"><label htmlFor="dp">Password</label><input id="dp" className="input" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /><span className="field-hint">Leave empty if you only use Google or passkeys.</span></div>}
          <div className="field"><label htmlFor="dc">Type DELETE to confirm</label><input id="dc" className="input" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} autoCapitalize="characters" /></div>
          <button className="btn danger block" disabled={delConfirm !== 'DELETE'}>Delete account “{me.username}”</button>
        </form>
      </Sheet>
      <p className="center xs faint">QUIZ WAR: Bangladesh · v{import.meta.env.VITE_APP_VERSION ?? '1.0.0'}</p>
    </div>
  );
}
