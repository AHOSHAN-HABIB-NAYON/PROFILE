import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, LockKeyhole, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { iconUrl } from '../lib/image';
import { useBootstrap } from '../lib/settings';
import { Button, Field, Input, PageSpinner, Toaster } from '../components/ui';
import { useMe } from './components/kit';

export default function Login() {
  const me = useMe();
  const boot = useBootstrap();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/admin') ? params.get('next')! : '/admin';
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'totp' | 'passkey' | null>(null);
  const s = boot.data?.settings;

  if (me.isLoading) return <PageSpinner />;
  if (me.data?.authenticated) return <Navigate to={next} replace />;
  const passkeySupported = typeof window !== 'undefined' && 'PublicKeyCredential' in window;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    navigate(next, { replace: true });
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('password');
    setError(null);
    try {
      const r = await api.post<{ ok?: boolean; mfaRequired?: boolean }>('/api/auth/login', { email, password });
      if (r.mfaRequired) setStep('totp');
      else await done();
    } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('totp');
    setError(null);
    try { await api.post('/api/auth/2fa', { code }); await done(); } catch (err) { setError((err as Error).message); } finally { setBusy(null); }
  };

  const passkey = async () => {
    setBusy('passkey');
    setError(null);
    try {
      const options = await api.post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/passkey/login/options');
      const response = await startAuthentication({ optionsJSON: options });
      await api.post('/api/auth/passkey/login/verify', response);
      await done();
    } catch (err) {
      const msg = (err as Error).message;
      setError(/NotAllowed|cancel|timed out/i.test(msg) ? 'Passkey sign-in was cancelled.' : msg);
    } finally { setBusy(null); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,#ffe3d1,transparent_60%)] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <img src={iconUrl(s?.app_icon || s?.favicon, 192)} alt="" className="mx-auto size-14 rounded-2xl shadow-[var(--shadow-float)]" />
          <h1 className="mt-4 text-[24px] font-extrabold tracking-tight">{s?.site_name ?? 'ShopiGo'} Admin</h1>
          <p className="text-[14px] text-muted">{step === 'totp' ? 'Enter the 6-digit code from your authenticator app' : 'Sign in to manage your store'}</p>
        </div>
        <div className="card p-6">
          {step === 'password' ? (
            <>
              {passkeySupported && me.data?.passkeysEnabled !== false && (
                <>
                  <Button type="button" variant="dark" size="lg" block loading={busy === 'passkey'} icon={<Fingerprint className="size-5" />} onClick={() => void passkey()}>Sign in with a passkey</Button>
                  <div className="my-5 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />or use your password<span className="h-px flex-1 bg-line" /></div>
                </>
              )}
              <form className="space-y-4" onSubmit={(e) => void submitPassword(e)}>
                <Field label="Email"><div className="relative"><Mail className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" /><Input className="pl-11" type="email" autoComplete="username webauthn" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></Field>
                <Field label="Password"><div className="relative"><LockKeyhole className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" /><Input className="pl-11" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div></Field>
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-danger">{error}</p>}
                <Button size="lg" block loading={busy === 'password'}>Sign in</Button>
              </form>
            </>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void submitTotp(e)}>
              <Field label="Authentication code"><div className="relative"><KeyRound className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" /><Input className="pl-11 text-center text-[20px] tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required /></div></Field>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-danger">{error}</p>}
              <Button size="lg" block loading={busy === 'totp'} disabled={code.length !== 6}>Verify</Button>
              <button type="button" onClick={() => { setStep('password'); setCode(''); setError(null); }} className="block w-full text-center text-[13px] font-semibold text-muted">Back</button>
            </form>
          )}
        </div>
        <p className="mt-5 text-center text-[12px] text-muted">Protected by Argon2id, rate limiting, 2FA & passkeys.</p>
      </div>
      <Toaster />
    </div>
  );
}
