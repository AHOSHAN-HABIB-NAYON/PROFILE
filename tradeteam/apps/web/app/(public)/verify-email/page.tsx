'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button, ErrorBox, Input } from '@/components/ui/primitives';
import { post, errorMessage } from '@/lib/api';
import { handleLoginResult } from '@/lib/login';
import { useMe } from '@/lib/hooks';
import type { LoginResult } from '@/lib/types';

function VerifyEmailInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe().data;
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);
  const token = params.get('token');
  useEffect(() => {
    if (me?.email && !email) setEmail(me.email);
  }, [me, email]);
  useEffect(() => {
    if (!token || tried.current) return;
    tried.current = true;
    setBusy(true);
    post<LoginResult>('/auth/verify-email', { token })
      .then((r) => handleLoginResult(r, qc, router))
      .catch((e) => setErr(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [token, qc, router]);
  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        params.get('new')
          ? 'Account created! Enter the 6-digit code we emailed you.'
          : 'Enter the 6-digit code we emailed you.'
      }
      footer={
        <Link href="/login" className="text-accent font-semibold">
          Back to log in
        </Link>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            handleLoginResult(await post<LoginResult>('/auth/verify-email', { email, code }), qc, router);
          } catch (e2) {
            setErr(errorMessage(e2));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label="Email"
          type="email"
          icon="mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
        />
        <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6}>
          Verify email
        </Button>
        <Button
          type="button"
          variant="ghost"
          block
          onClick={async () => {
            setErr(null);
            try {
              await post('/auth/verify-email/resend', { email });
              setMsg('A new code was sent if the address needs verification.');
            } catch (e2) {
              setErr(errorMessage(e2));
            }
          }}
        >
          Resend code
        </Button>
        {msg && <p className="text-sm text-up text-center">{msg}</p>}
        {err && <ErrorBox message={err} />}
      </form>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
