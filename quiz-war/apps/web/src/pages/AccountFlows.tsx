import { passwordSchema } from '@quizwar/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { api, friendlyError } from '../lib/api';

export default function AccountFlows({ kind }: { kind: 'forgot' | 'reset' | 'verify' }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (kind === 'reset') {
      const r = passwordSchema.safeParse(password);
      if (!r.success) return setMsg(r.error.issues[0].message);
    }
    setState('busy');
    try {
      if (kind === 'forgot') await api('/auth/forgot-password', { body: { email }, auth: false });
      else await api('/auth/reset-password', { body: { token, password }, auth: false });
      setState('done');
    } catch (e2) {
      setMsg(friendlyError(e2));
      setState('error');
    }
  }

  const title = kind === 'forgot' ? 'Reset your password' : kind === 'reset' ? 'Choose a new password' : 'Verify email';
  return (
    <div className="welcome" style={{ justifyContent: 'flex-start' }}>
      <PageHeader title={title} back />
      {kind === 'verify' ? (
        <div className="card center">
          {state === 'busy' && <p>Verifying…</p>}
          {state === 'done' && <p className="form-success">✅ Your email is verified. You’re all set!</p>}
          {state === 'error' && <p className="form-error">{msg}</p>}
          <Link to="/" className="btn primary block mt">Continue</Link>
        </div>
      ) : state === 'done' ? (
        <div className="card">
          <p className="form-success">{kind === 'forgot' ? 'If an account exists for that email, a reset link is on its way. Check your inbox.' : 'Password updated. Please sign in with your new password.'}</p>
          <Link to="/login" className="btn primary block mt">Back to sign in</Link>
        </div>
      ) : (
        <form className="col" onSubmit={submit}>
          {msg && <p className="form-error" role="alert">{msg}</p>}
          {kind === 'forgot' ? (
            <div className="field">
              <label htmlFor="em">Email</label>
              <input id="em" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="pw">New password</label>
              <input id="pw" className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="field-hint">At least 8 characters, letters and numbers. You’ll be signed out on other devices.</span>
            </div>
          )}
          <button className="btn primary lg block" disabled={state === 'busy'}>{kind === 'forgot' ? 'Send reset link' : 'Update password'}</button>
        </form>
      )}
    </div>
  );
}
