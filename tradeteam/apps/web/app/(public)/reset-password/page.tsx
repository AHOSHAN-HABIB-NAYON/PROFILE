'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button, ErrorBox, InfoBox, Input } from '@/components/ui/primitives';
import { post, errorMessage } from '@/lib/api';

function ResetInner() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <Link href="/login" className="text-accent font-semibold">
          Back to log in
        </Link>
      }
    >
      {done ? (
        <div className="space-y-4">
          <InfoBox>Your password was changed and all sessions were signed out.</InfoBox>
          <Link href="/login">
            <Button block size="lg">
              Log in
            </Button>
          </Link>
        </div>
      ) : !token ? (
        <ErrorBox message="This reset link is missing its token. Request a new one." />
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw !== pw2) return setErr('Passwords do not match');
            setBusy(true);
            setErr(null);
            try {
              await post('/auth/reset-password', { token, password: pw });
              setDone(true);
            } catch (e2) {
              setErr(errorMessage(e2));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            minLength={10}
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
          />
          <Button type="submit" block size="lg" loading={busy}>
            Update password
          </Button>
          {err && <ErrorBox message={err} />}
        </form>
      )}
    </AuthLayout>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
