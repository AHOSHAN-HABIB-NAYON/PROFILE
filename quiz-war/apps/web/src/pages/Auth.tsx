import { emailSchema, passwordSchema } from '@quizwar/shared';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/Splash';
import { useConfig } from '../hooks/queries';
import { acceptAuthResponse, api, ApiError, friendlyError } from '../lib/api';
import { offerToSavePassword, pickSavedPassword } from '../lib/credentials';
import { googleIdToken } from '../lib/google';
import { setLang, useLang, useT } from '../lib/i18n';
import { conditionalPasskeyAvailable, passkeyLogin, passkeysSupported } from '../lib/passkey';
import { haptic, isNative } from '../lib/platform';

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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (cfg && (!cfg.googleLoginEnabled || !cfg.googleClientId)) return null;
  return (
    <>
      <button
        type="button"
        className="btn lg block outline social-btn"
        disabled={busy || !cfg}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            const idToken = await googleIdToken(cfg!.googleClientId!);
            await finish(await api('/auth/google', { body: { idToken }, auth: false }), next);
          } catch (e) {
            const msg = e instanceof ApiError ? friendlyError(e) : (e as Error).message;
            if (!/cancel/i.test(msg)) setErr(msg);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <span className="spinner" /> : <Icon name="google" size={20} />}
        {t('Continue with Google', 'Google দিয়ে চালিয়ে যান')}
      </button>
      <div id="gsi-fallback" style={{ display: 'flex', justifyContent: 'center' }} />
      {err && (
        <p className="form-error" role="alert">
          <Icon name="alert-circle" size={18} /> {err}
        </p>
      )}
    </>
  );
}

export function PasskeyButton({ next }: { next: string }) {
  const { data: cfg } = useConfig();
  const finish = useFinish();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!passkeysSupported() || (cfg && !cfg.passkeyEnabled)) return null;
  return (
    <>
      <button
        type="button"
        className="btn lg block outline social-btn"
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
        {busy ? <span className="spinner" /> : <Icon name="fingerprint" size={20} />}
        {busy ? t('Waiting for your device…', 'আপনার ডিভাইসের অপেক্ষায়…') : t('Sign in with passkey', 'পাসকি দিয়ে লগইন')}
      </button>
      {err && (
        <p className="form-error" role="alert">
          <Icon name="alert-circle" size={18} /> {err}
        </p>
      )}
    </>
  );
}

/** Branded top area shared by the sign-in screens. */
export function AuthLayout({ title, subtitle, children, back }: { title: string; subtitle: string; children: ReactNode; back?: boolean }) {
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-hero-top">
          {back ? (
            <button className="btn icon sm ghost on-dark" aria-label={t('Back', 'ফিরে যান')} onClick={() => (history.length > 1 ? nav(-1) : nav('/login'))}>
              <Icon name="back" size={24} />
            </button>
          ) : (
            <span />
          )}
          <div className="lang-toggle on-dark" role="group" aria-label={t('Language', 'ভাষা')}>
            <button aria-pressed={lang === 'bn'} onClick={() => setLang('bn', false)}>বাংলা</button>
            <button aria-pressed={lang === 'en'} onClick={() => setLang('en', false)}>EN</button>
          </div>
        </div>
        <div className="auth-brand">
          <BrandMark size={64} animate={false} />
          <div>
            <b>QUIZ WAR</b>
            <small>BANGLADESH</small>
          </div>
        </div>
      </div>
      <main className="auth-card">
        <h1>{title}</h1>
        <p className="muted auth-sub">{subtitle}</p>
        {children}
      </main>
    </div>
  );
}

function PasswordField({ id, value, onChange, onBlur, autoComplete, error, hint, label }: { id: string; value: string; onChange: (v: string) => void; onBlur?: () => void; autoComplete: string; error?: string; hint?: ReactNode; label: string }) {
  const [show, setShow] = useState(false);
  const t = useT();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <Icon name="lock" size={20} />
        <input
          id={id}
          name={id}
          className="input has-action"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          enterKeyHint="done"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        />
        <button type="button" className="btn icon sm ghost input-action" aria-label={show ? t('Hide password', 'পাসওয়ার্ড লুকান') : t('Show password', 'পাসওয়ার্ড দেখুন')} aria-pressed={show} onClick={() => setShow((s) => !s)}>
          <Icon name={show ? 'eye-off' : 'eye'} size={20} />
        </button>
      </div>
      {error ? (
        <span id={`${id}-err`} className="field-error">
          <Icon name="alert-circle" size={15} /> {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (/[^a-z0-9]/i.test(pw)) s++;
  return s;
}

function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const finish = useFinish();
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const useSaved = async (auto = false) => {
    const c = await pickSavedPassword();
    if (!c) return;
    setEmail(c.email);
    setPassword(c.password);
    if (auto) setTimeout(() => formRef.current?.requestSubmit(), 60);
  };

  // Android: offer the Google Password Manager account picker once when the screen opens.
  useEffect(() => {
    if (mode !== 'login' || !isNative || sessionStorage.getItem('qw-saved-offered')) return;
    sessionStorage.setItem('qw-saved-offered', '1');
    void useSaved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const emailMsg = t('Enter a valid email address', 'সঠিক ইমেইল ঠিকানা দিন');
  const validate = (field: 'email' | 'password') => {
    if (field === 'email') {
      const r = emailSchema.safeParse(email);
      setErrors((e) => ({ ...e, email: email && !r.success ? emailMsg : undefined }));
    } else if (mode === 'register') {
      const r = passwordSchema.safeParse(password);
      setErrors((e) => ({ ...e, password: password && !r.success ? t('At least 8 characters with letters and numbers', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা দুটোই থাকতে হবে') : undefined }));
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email.trim());
    const pw = mode === 'register' ? passwordSchema.safeParse(password) : { success: password.length > 0 };
    const errs: typeof errors = {};
    if (!em.success) errs.email = emailMsg;
    if (!pw.success) errs.password = mode === 'register' ? t('At least 8 characters with letters and numbers', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা দুটোই থাকতে হবে') : t('Enter your password', 'পাসওয়ার্ড দিন');
    setErrors(errs);
    if (errs.email || errs.password) return haptic('error');
    setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { body: { email: email.trim(), password }, auth: false });
      void offerToSavePassword(email.trim(), password);
      await finish(data, next);
    } catch (e2) {
      setErrors({ form: friendlyError(e2) });
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  const s = strength(password);
  return (
    <AuthLayout
      back={mode === 'register'}
      title={mode === 'login' ? t('Welcome back', 'আবার স্বাগতম') : t('Create your account', 'নতুন অ্যাকাউন্ট খুলুন')}
      subtitle={mode === 'login' ? t('Sign in to continue your battles.', 'আপনার ব্যাটল চালিয়ে যেতে লগইন করুন।') : t('It takes less than a minute — and it’s free.', 'এক মিনিটও লাগবে না — সম্পূর্ণ ফ্রি।')}
    >
      <form ref={formRef} className="col auth-form" onSubmit={submit} noValidate>
        {errors.form && (
          <p className="form-error" role="alert">
            <Icon name="alert-circle" size={18} /> {errors.form}
          </p>
        )}
        <div className="field">
          <label htmlFor="email">{t('Email', 'ইমেইল')}</label>
          <div className="input-wrap">
            <Icon name="mail" size={20} />
            <input
              id="email"
              name="email"
              className="input"
              type="email"
              inputMode="email"
              spellCheck={false}
              autoCapitalize="none"
              enterKeyHint="next"
              required
              placeholder="name@example.com"
              autoComplete={mode === 'login' ? 'username webauthn' : 'username'}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
              }}
              onBlur={() => validate('email')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-err' : undefined}
            />
          </div>
          {errors.email && (
            <span id="email-err" className="field-error">
              <Icon name="alert-circle" size={15} /> {errors.email}
            </span>
          )}
        </div>
        <PasswordField
          id={mode === 'login' ? 'current-password' : 'new-password'}
          label={t('Password', 'পাসওয়ার্ড')}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
          }}
          onBlur={() => validate('password')}
          error={errors.password}
          hint={
            mode === 'register' ? (
              <span className="pw-meter" data-s={password ? s : 0}>
                <i /><i /><i /><i />
                <span>{t('At least 8 characters, letters and numbers', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা')}</span>
              </span>
            ) : undefined
          }
        />
        {mode === 'login' && (
          <div className="row between">
            {isNative ? (
              <button type="button" className="link-btn" onClick={() => void useSaved(false)}>
                <Icon name="key" size={16} /> {t('Use saved password', 'সেভ করা পাসওয়ার্ড')}
              </button>
            ) : (
              <span />
            )}
            <Link to="/forgot-password" className="small bold">
              {t('Forgot password?', 'পাসওয়ার্ড ভুলে গেছেন?')}
            </Link>
          </div>
        )}
        <button className="btn primary lg block" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name={mode === 'login' ? 'login' : 'user-plus'} />}
          {mode === 'login' ? t('Sign in', 'লগইন করুন') : t('Create account', 'অ্যাকাউন্ট খুলুন')}
        </button>
      </form>

      <div className="divider">{t('or', 'অথবা')}</div>
      <div className="col">
        <GoogleButton next={next} />
        {mode === 'login' && <PasskeyButton next={next} />}
      </div>

      <p className="center auth-switch">
        {mode === 'login' ? (
          <>
            {t('New to QUIZ WAR?', 'QUIZ WAR-এ নতুন?')}{' '}
            <Link to={`/register?next=${encodeURIComponent(next)}`} className="bold">
              {t('Create an account', 'অ্যাকাউন্ট খুলুন')}
            </Link>
          </>
        ) : (
          <>
            {t('Already have an account?', 'আগে থেকেই অ্যাকাউন্ট আছে?')}{' '}
            <Link to={`/login?next=${encodeURIComponent(next)}`} className="bold">
              {t('Sign in', 'লগইন করুন')}
            </Link>
          </>
        )}
      </p>
      <p className="center xs faint">
        {t('By continuing you agree to the', 'চালিয়ে গেলে আপনি আমাদের')} <Link to="/legal/terms">{t('Terms', 'শর্তাবলি')}</Link> {t('and', 'ও')}{' '}
        <Link to="/legal/privacy">{t('Privacy Policy', 'প্রাইভেসি পলিসি')}</Link>
        {t('.', ' মেনে নিচ্ছেন।')}
      </p>
    </AuthLayout>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Register = () => <AuthForm mode="register" />;
