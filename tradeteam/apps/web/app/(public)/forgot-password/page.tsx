'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button, ErrorBox, InfoBox, Input } from '@/components/ui/primitives';
import { post, errorMessage } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll email you a secure reset link."
      footer={
        <Link href="/login" className="text-accent font-semibold">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <InfoBox>
          If an account exists for <b>{email}</b>, a reset link is on its way. The link expires in 30 minutes.
        </InfoBox>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await post('/auth/forgot-password', { email });
              setSent(true);
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
          <Button type="submit" block size="lg" loading={busy}>
            Send reset link
          </Button>
          {err && <ErrorBox message={err} />}
        </form>
      )}
    </AuthLayout>
  );
}
