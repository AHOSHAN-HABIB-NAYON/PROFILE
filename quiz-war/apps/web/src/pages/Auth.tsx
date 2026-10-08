import { emailSchema, passwordSchema } from '@quizwar/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useConfig } from '../hooks/queries';
import { acceptAuthResponse, api, ApiError, friendlyError } from '../lib/api';
import { googleIdToken } from '../lib/google';
import { conditionalPasskeyAvailable, passkeyLogin, passkeysSupported } from '../lib/passkey';
import { haptic } from '../lib/platform';

function useFinish() {
  const nav = useNavigate();
  return async (data: any, next: string) => {
    await acceptAuthResponse(data);
    haptic('success');
    nav(data.user?.needsOnboarding ? '/onboarding' : next || '/', { replace: true });
  };
}

export function GoogleButton({ next }: { next: string }) {
  const { data: cfg } = useConfig();
  const finish = useFinish();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (cfg && (!cfg.googleLoginEnabled || !cfg.googleClientId)) return null;
  return (
    <>
      <button
        className="btn lg block outline google-btn"
        disabled={busy || !cfg}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            const idToken = await googleIdToken(cfg!.googleClientId!);
            await finish(await api('/auth/google', { body: { idToken }, auth: false }), next);
          } catch (e) {
            setErr(e instanceof ApiError ? friendlyError(e) : (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {busy ? 'Connecting…' : 'Continue with Google'}
      </button>
      <div id="gsi-fallback" style={{ display: 'flex', justifyContent: 'center' }} />
      {err && <p className="form-error" role="alert">{err}</p>}
    </>
  );
}

export function PasskeyButton({ next }: { next: string }) {
  const { data: cfg } = useConfig();
  const finish = useFinish();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!passkeysSupported() || (cfg && !cfg.passkeyEnabled)) return null;
  return (
    <>
      <button
        className="btn lg block outline"
        disabled={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            await finish(await passkeyLogin(false), next);
          } catch (e) {
            if ((e as Error).name !== 'NotAllowedError' && (e as Error).name !== 'AbortError') setErr(friendlyError(e) || (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="key" size={18} /> {busy ? 'Waiting for your device…' : 'Continue with Passkey'}
      </button>
      {err && <p className="form-error" role="alert">{err}</p>}
    </>
  );
}

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const finish = useFinish();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Passkey autofill (Conditional UI) on the sign-in form when the browser supports it.
  useEffect(() => {
    if (mode !== 'login') return;
    let cancelled = false;
    void conditionalPasskeyAvailable().then((ok) => {
      if (!ok || cancelled) return;
      abortRef.current = new AbortController();
      passkeyLogin(true, abortRef.current.signal)
        .then((d) => {
          if (!cancelled) void finish(d, next);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const validate = (field: 'email' | 'password') => {
    if (field === 'email') {
      const r = emailSchema.safeParse(email);
      setErrors((e) => ({ ...e, email: email && !r.success ? 'Enter a valid email address' : undefined }));
    } else if (mode === 'register') {
      const r = passwordSchema.safeParse(password);
      setErrors((e) => ({ ...e, password: password && !r.success ? r.error.issues[0].message : undefined }));
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    const pw = mode === 'register' ? passwordSchema.safeParse(password) : { success: password.length > 0 };
    const next_: typeof errors = {};
    if (!em.success) next_.email = 'Enter a valid email address';
    if (!pw.success) next_.password = mode === 'register' ? 'At least 8 characters with letters and numbers' : 'Enter your password';
    setErrors(next_);
    if (next_.email || next_.password) return;
    setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { body: { email, password }, auth: false });
      await finish(data, next);
    } catch (e2) {
      setErrors({ form: friendlyError(e2) });
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome" style={{ justifyContent: 'flex-start' }}>
      <PageHeader title={mode === 'login' ? 'Welcome back' : 'Create your account'} back />
      <div className="col gap-lg">
        <GoogleButton next={next} />
        <PasskeyButton next={next} />
        <div className="divider">or with email</div>
        <form className="col" onSubmit={submit} noValidate>
          {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete={mode === 'login' ? 'username webauthn' : 'email'}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
              }}
              onBlur={() => validate('email')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-err' : undefined}
            />
            {errors.email && <span id="email-err" className="field-error">{errors.email}</span>}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
              }}
              onBlur={() => validate('password')}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'pw-err' : mode === 'register' ? 'pw-hint' : undefined}
            />
            {errors.password ? <span id="pw-err" className="field-error">{errors.password}</span> : mode === 'register' && <span id="pw-hint" className="field-hint">At least 8 characters, letters and numbers.</span>}
          </div>
          <button className="btn primary lg block" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {mode === 'login' ? (
          <div className="row between small">
            <Link to="/forgot-password">Forgot password?</Link>
            <Link to={`/register?next=${encodeURIComponent(next)}`} className="bold">Create account</Link>
          </div>
        ) : (
          <p className="center small muted">
            Have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} className="bold">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Register = () => <AuthForm mode="register" />;
