import { passwordSchema } from '@quizwar/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon, IconTile } from '../components/Icon';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { useT } from '../lib/i18n';
import { AuthLayout } from './Auth';

export default function AccountFlows({ kind }: { kind: 'forgot' | 'reset' | 'verify' }) {
  const cfg = useConfig().data;
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(kind === 'verify' ? 'busy' : 'idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (kind !== 'verify') return;
    api('/auth/verify-email', { body: { token }, auth: false })
      .then(() => setState('done'))
      .catch((e) => {
        setMsg(friendlyError(e));
        setState('error');
      });
  }, [kind, token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    if (kind === 'reset' && !passwordSchema.safeParse(password).success) {
      return setMsg(t('At least 8 characters with letters and numbers', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা দুটোই থাকতে হবে'));
    }
    setState('busy');
    try {
      if (kind === 'forgot') await api('/auth/forgot-password', { body: { email: email.trim() }, auth: false });
      else await api('/auth/reset-password', { body: { token, password }, auth: false });
      setState('done');
    } catch (e2) {
      setMsg(friendlyError(e2));
      setState('error');
    }
  }

  const title =
    kind === 'forgot' ? t('Forgot your password?', 'পাসওয়ার্ড ভুলে গেছেন?') : kind === 'reset' ? t('Choose a new password', 'নতুন পাসওয়ার্ড দিন') : t('Verify your email', 'ইমেইল নিশ্চিতকরণ');
  const subtitle =
    kind === 'forgot'
      ? t('Enter your email and we’ll send you a reset link.', 'আপনার ইমেইল দিন, আমরা রিসেট লিংক পাঠিয়ে দেব।')
      : kind === 'reset'
        ? t('You’ll be signed out on your other devices.', 'অন্য সব ডিভাইস থেকে লগআউট হয়ে যাবে।')
        : t('Securing your account…', 'আপনার অ্যাকাউন্ট সুরক্ষিত করা হচ্ছে…');

  if (kind === 'verify' || state === 'done') {
    const ok = state === 'done';
    return (
      <AuthLayout back title={title} subtitle={subtitle}>
        <div className="empty">
          {state === 'busy' ? (
            <span className="spinner" style={{ width: 40, height: 40, color: 'var(--primary)' }} />
          ) : (
            <div className="e-art">
              <IconTile name={ok ? (kind === 'forgot' ? 'mail' : 'check-circle') : 'alert'} tone={ok ? 'success' : 'danger'} size={76} anim="pop" />
            </div>
          )}
          <h3>
            {state === 'busy'
              ? t('Verifying…', 'যাচাই করা হচ্ছে…')
              : ok
                ? kind === 'verify'
                  ? t('Email verified!', 'ইমেইল নিশ্চিত হয়েছে!')
                  : kind === 'forgot'
                    ? t('Check your inbox', 'ইনবক্স দেখুন')
                    : t('Password updated', 'পাসওয়ার্ড বদলানো হয়েছে')
                : t('This link didn’t work', 'লিংকটি কাজ করেনি')}
          </h3>
          <p className="small">
            {state === 'error'
              ? msg
              : ok && kind === 'forgot'
                ? t('If an account exists for that email, a reset link is on its way.', 'এই ইমেইলে অ্যাকাউন্ট থাকলে রিসেট লিংক পাঠানো হয়েছে।')
                : ok && kind === 'reset'
                  ? t('Sign in with your new password.', 'নতুন পাসওয়ার্ড দিয়ে লগইন করুন।')
                  : ok
                    ? t('You’re all set.', 'সব ঠিক আছে।')
                    : ''}
          </p>
          {state !== 'busy' && (
            <Link to={kind === 'verify' ? '/' : '/login'} className="btn primary block mt">
              {kind === 'verify' ? t('Continue', 'চালিয়ে যান') : t('Back to sign in', 'লগইনে ফিরে যান')}
            </Link>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout back title={title} subtitle={subtitle}>
      <form className="col auth-form" onSubmit={submit} noValidate>
        {msg && (
          <p className="form-error" role="alert">
            <Icon name="alert-circle" size={18} /> {msg}
          </p>
        )}
        {kind === 'forgot' && cfg && cfg.emailEnabled === false && (
          <div className="notice warn" role="status">
            <Icon name="info" size={18} />
            <span>
              {t('Password reset emails are temporarily unavailable. Contact support and we will help you get back in:', 'এই মুহূর্তে রিসেট ইমেইল পাঠানো যাচ্ছে না। সাপোর্টে যোগাযোগ করুন, আমরা অ্যাকাউন্ট ফিরে পেতে সাহায্য করব:')}{' '}
              <a href={`mailto:${cfg.supportEmail}?subject=${encodeURIComponent('Password reset — QUIZ WAR')}`}>{cfg.supportEmail}</a>
            </span>
          </div>
        )}
        {kind === 'forgot' ? (
          <div className="field">
            <label htmlFor="email">{t('Email', 'ইমেইল')}</label>
            <div className="input-wrap">
              <Icon name="mail" size={20} />
              <input id="email" name="email" className="input" type="email" inputMode="email" spellCheck={false} autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="new-password">{t('New password', 'নতুন পাসওয়ার্ড')}</label>
            <div className="input-wrap">
              <Icon name="lock" size={20} />
              <input id="new-password" name="new-password" className="input has-action" type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn icon sm ghost input-action" aria-label={show ? t('Hide password', 'পাসওয়ার্ড লুকান') : t('Show password', 'পাসওয়ার্ড দেখুন')} onClick={() => setShow((s) => !s)}>
                <Icon name={show ? 'eye-off' : 'eye'} size={20} />
              </button>
            </div>
            <span className="field-hint">{t('At least 8 characters, letters and numbers.', 'কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা।')}</span>
          </div>
        )}
        <button className="btn primary lg block" disabled={state === 'busy'}>
          {state === 'busy' ? <span className="spinner" /> : <Icon name={kind === 'forgot' ? 'mail' : 'check'} />}
          {kind === 'forgot' ? t('Send reset link', 'রিসেট লিংক পাঠান') : t('Update password', 'পাসওয়ার্ড আপডেট করুন')}
        </button>
      </form>
    </AuthLayout>
  );
}
