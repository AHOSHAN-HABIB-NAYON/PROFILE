'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth/auth-layout';
import { MfaForm } from '@/components/auth/mfa-form';
import { post } from '@/lib/api';
import { handleLoginResult } from '@/lib/login';
import type { LoginResult } from '@/lib/types';

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const token = params.get('token') ?? '';
  const m = (params.get('methods') ?? '').split(',');
  const methods = {
    totp: m.includes('totp'),
    passkey: m.includes('passkey'),
    backupCode: m.includes('backupCode') || m.includes('totp'),
  };
  return (
    <AuthLayout
      title="Security verification"
      subtitle="Confirm it's you to finish signing in."
      footer={
        <Link href="/login" className="text-accent font-semibold">
          Back to log in
        </Link>
      }
    >
      <MfaForm
        methods={methods}
        passkeyOptionsPath="/auth/2fa/passkey/options"
        passkeyBody={{ mfaToken: token }}
        onSubmit={async (b) => {
          const r = await post<LoginResult>('/auth/2fa/verify', { mfaToken: token, ...b });
          handleLoginResult(r, qc, router, params.get('next'));
        }}
      />
    </AuthLayout>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
