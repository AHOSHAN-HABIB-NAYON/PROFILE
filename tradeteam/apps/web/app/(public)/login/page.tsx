'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button, ErrorBox, Input, Tabs } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';
import { post, errorMessage } from '@/lib/api';
import { useSetting } from '@/lib/hooks';
import { handleLoginResult } from '@/lib/login';
import type { LoginResult } from '@/lib/types';
import { passkeyAssertion, passkeyCapabilities } from '@/components/auth/passkey';

const ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_session: 'Your session changed during Google sign-in. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
  forbidden: 'This Google account cannot be used to sign in.',
  conflict: 'That Google account is linked to a different user.',
};

function LoginInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const next = params.get('next');
  const googleOn = useSetting('auth.google_enabled', false);
  const passkeyOn = useSetting('auth.passkey_enabled', true);
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(
    params.get('error') ? (ERRORS[params.get('error')!] ?? 'Sign-in failed.') : null,
  );
  const [pk, setPk] = useState(false);
  useEffect(() => {
    passkeyCapabilities().then((c) => setPk(c.supported));
  }, []);

  const run = async (key: string, fn: () => Promise<LoginResult | void>) => {
    setBusy(key);
    setErr(null);
    try {
      const r = await fn();
      if (r) handleLoginResult(r, qc, router, next);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your team account"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-accent font-semibold">
            Sign up
          </Link>
        </>
      }
    >
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { value: 'password', label: 'Password' },
          { value: 'code', label: 'Email code' },
        ]}
        className="mb-5"
      />
      {mode === 'password' ? (
        <form
          onSubmit={(e) => (
            e.preventDefault(),
            run('pw', () => post<LoginResult>('/auth/login', { email, password }))
          )}
          className="space-y-4"
        >
          <Input
            label="Email"
            type="email"
            autoComplete="username webauthn"
            icon="mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            icon="lock"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-[13px] font-semibold text-accent">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" block size="lg" loading={busy === 'pw'} variant="buy">
            Log in
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!codeSent)
              void run(
                'send',
                async () => (await post('/auth/email-otp/request', { email }), setCodeSent(true)),
              );
            else void run('code', () => post<LoginResult>('/auth/email-otp/verify', { email, code }));
          }}
          className="space-y-4"
        >
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            icon="mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={codeSent}
          />
          {codeSent && (
            <Input
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              hint={`If an account exists for ${email}, we sent it a code.`}
            />
          )}
          <Button type="submit" block size="lg" loading={busy === 'send' || busy === 'code'}>
            {codeSent ? 'Log in' : 'Send code'}
          </Button>
        </form>
      )}
      {(pk && passkeyOn) || googleOn ? (
        <div className="flex items-center gap-3 my-5 text-[12px] text-faint">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}
      <div className="space-y-2.5">
        {pk && passkeyOn && (
          <Button
            block
            size="lg"
            variant="outline"
            icon="key"
            loading={busy === 'pk'}
            onClick={() =>
              run('pk', async () => {
                const a = await passkeyAssertion('/auth/passkey/authenticate/options');
                return post<LoginResult>('/auth/passkey/authenticate', a);
              })
            }
          >
            Sign in with a passkey
          </Button>
        )}
        {googleOn && (
          <a
            href="/api/auth/google/start"
            className="flex items-center justify-center gap-2.5 h-12 rounded-2xl border border-line-strong bg-white text-[#1f1f1f] font-semibold text-[15px] hover:bg-gray-50"
          >
            <Icon name="google" size={20} /> Continue with Google
          </a>
        )}
      </div>
      {err && (
        <div className="mt-4">
          <ErrorBox message={err} />
        </div>
      )}
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
