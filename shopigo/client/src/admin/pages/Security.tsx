import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, LaptopMinimal, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime, timeAgo } from '../../lib/format';
import { Badge, Button, Field, Input, Sheet, toast, useConfirm } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';

interface Sec { totpEnabled: boolean; passkeys: Array<{ id: number; name: string; device_type: string | null; backed_up: number; created_at: string; last_used_at: string | null }>; sessions: Array<{ id: number; ip: string | null; user_agent: string | null; auth_method: string; created_at: string; last_seen_at: string; current: boolean }>; profile: { name: string; email: string } }

export default function Security() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { confirm, dialog } = useConfirm();
  const { data } = useQuery({ queryKey: ['security'], queryFn: () => api.get<Sec>('/api/auth/security') });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['security'] }); void qc.invalidateQueries({ queryKey: ['me'] }); };
  const [totp, setTotp] = useState<{ qr: string; secret: string; code: string } | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [disablePw, setDisablePw] = useState<string | null>(null);

  const addPasskey = useMutation({
    mutationFn: async () => {
      const name = prompt('Name this passkey (e.g. “My iPhone”, “Office laptop”)', navigator.platform || 'Passkey') ?? 'Passkey';
      const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/auth/passkey/register/options');
      const response = await startRegistration({ optionsJSON: options });
      return api.post('/api/auth/passkey/register/verify', { name, response });
    },
    onSuccess: () => { toast.success('Passkey added — you can now sign in with Face ID / fingerprint / security key'); refresh(); },
    onError: (e: Error) => toast.error(/NotAllowed|cancel/i.test(e.message) ? 'Passkey setup was cancelled' : e.message),
  });
  const removePasskey = useMutation({ mutationFn: (id: number) => api.del(`/api/auth/passkey/${id}`), onSuccess: () => { toast.success('Passkey removed'); refresh(); } });
  const startTotp = useMutation({ mutationFn: () => api.post<{ qr: string; secret: string }>('/api/auth/totp/setup'), onSuccess: (r) => setTotp({ ...r, code: '' }) });
  const enableTotp = useMutation({ mutationFn: () => api.post('/api/auth/totp/enable', { code: totp!.code }), onSuccess: () => { toast.success('Two-factor authentication enabled'); setTotp(null); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const disableTotp = useMutation({ mutationFn: () => api.post('/api/auth/totp/disable', { password: disablePw }), onSuccess: () => { toast.success('2FA disabled'); setDisablePw(null); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const changePw = useMutation({ mutationFn: () => api.post('/api/auth/password', { current: pw.current, next: pw.next }), onSuccess: () => { toast.success('Password changed — other sessions signed out'); setPw({ current: '', next: '', confirm: '' }); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const revoke = useMutation({ mutationFn: (id: number) => api.del(`/api/auth/sessions/${id}`), onSuccess: refresh });
  const revokeOthers = useMutation({ mutationFn: () => api.post('/api/auth/sessions/revoke-others'), onSuccess: () => { toast.success('Other sessions signed out'); refresh(); } });

  const passkeySupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window;
  return (
    <div>
      <PageHeader title="My Security" subtitle={data ? `${data.profile.name} · ${data.profile.email}` : undefined} />
      {params.get('setup') === '1' && <p className="mb-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-[13.5px] font-semibold text-amber-900"><TriangleAlert className="size-5" />Your store requires two-factor security. Add a passkey or enable an authenticator app to continue.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><Fingerprint className="size-5 text-brand-500" />Passkeys</span>} actions={<Button size="sm" disabled={!passkeySupported} loading={addPasskey.isPending} onClick={() => addPasskey.mutate()}>Add passkey</Button>}>
          <p className="mb-3 text-[13px] text-muted">Sign in with Face ID, Touch ID, Windows Hello, Android fingerprint or a security key — phishing-resistant and no password to type.</p>
          {!passkeySupported && <p className="mb-3 text-[13px] text-danger">This browser does not support passkeys.</p>}
          <ul className="divide-y divide-line">
            {data?.passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><KeyRound className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{p.name}</span><span className="text-[12px] text-muted">Added {dateTime(p.created_at)} · {p.last_used_at ? `used ${timeAgo(p.last_used_at)}` : 'never used'}{p.backed_up ? ' · synced' : ''}</span></span>
                <button onClick={async () => { if (await confirm(`Remove “${p.name}”?`, { danger: true })) removePasskey.mutate(p.id); }} className="grid size-9 place-items-center rounded-lg text-danger hover:bg-red-50" aria-label="Remove"><Trash2 className="size-4" /></button>
              </li>
            ))}
            {!data?.passkeys.length && <li className="py-4 text-center text-[13px] text-muted">No passkeys yet.</li>}
          </ul>
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-500" />Authenticator app (2FA)</span>}>
          {data?.totpEnabled ? (
            <div className="flex items-center justify-between gap-3"><Badge tone="green">Enabled</Badge><Button size="sm" variant="ghost" onClick={() => setDisablePw('')}>Disable</Button></div>
          ) : totp ? (
            <div className="space-y-3">
              <p className="text-[13px] text-muted">Scan with Google Authenticator, Microsoft Authenticator, 1Password…</p>
              <img src={totp.qr} alt="QR code" className="mx-auto size-48 rounded-2xl bg-white p-2" />
              <p className="text-center font-mono text-[12px] break-all text-muted">{totp.secret}</p>
              <Field label="6-digit code"><Input inputMode="numeric" maxLength={6} value={totp.code} onChange={(e) => setTotp({ ...totp, code: e.target.value.replace(/\D/g, '') })} /></Field>
              <Button block loading={enableTotp.isPending} disabled={totp.code.length !== 6} onClick={() => enableTotp.mutate()}>Verify & enable</Button>
            </div>
          ) : (
            <div><p className="mb-3 text-[13px] text-muted">Require a one-time code after your password.</p><Button loading={startTotp.isPending} onClick={() => startTotp.mutate()}>Set up 2FA</Button></div>
          )}
        </Panel>

        <Panel title="Change password">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (pw.next !== pw.confirm) { toast.error('Passwords do not match'); return; } changePw.mutate(); }}>
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="New password" hint="10+ characters with upper, lower case and a number"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={10} /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            <Button loading={changePw.isPending}>Change password</Button>
          </form>
        </Panel>

        <Panel title="Active sessions" actions={<Button size="sm" variant="ghost" onClick={() => revokeOthers.mutate()}>Sign out others</Button>}>
          <ul className="divide-y divide-line">
            {data?.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <LaptopMinimal className="size-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1"><span className="line-clamp-1 font-semibold">{s.user_agent?.slice(0, 80) ?? 'Unknown device'}</span><span className="text-[12px] text-muted">{s.ip} · {s.auth_method} · active {timeAgo(s.last_seen_at)}</span></span>
                {s.current ? <Badge tone="green">This device</Badge> : <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>Sign out</Button>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Sheet open={disablePw !== null} onClose={() => setDisablePw(null)} title="Disable 2FA">
        <Field label="Confirm with your password"><Input type="password" value={disablePw ?? ''} onChange={(e) => setDisablePw(e.target.value)} /></Field>
        <Button className="mt-4" variant="danger" block loading={disableTotp.isPending} onClick={() => disableTotp.mutate()}>Disable 2FA</Button>
      </Sheet>
      {dialog}
    </div>
  );
}
