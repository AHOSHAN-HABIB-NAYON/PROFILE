'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { post, errorMessage } from '@/lib/api';
import { Button, ErrorBox, Input } from '@/components/ui/primitives';
import { MfaForm, type MfaMethods } from '@/components/auth/mfa-form';
import { Logo } from '@/components/layout/brand';

export default function AdminLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState<{ token: string; methods: MfaMethods } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = async (path: string) => {
    await qc.invalidateQueries({ queryKey: ['admin-me'] });
    router.replace(path);
  };
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-[400px] bg-card border border-line rounded-3xl shadow-card p-7">
        <div className="flex items-center gap-2.5 mb-6">
          <Logo /> <span className="font-bold text-lg">Admin console</span>
        </div>
        {!mfa ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr(null);
              try {
                const r = await post<{ status: string; mfaToken?: string; methods?: MfaMethods }>(
                  '/admin/auth/login',
                  { email, password },
                );
                if (r.status === 'mfa_required') setMfa({ token: r.mfaToken!, methods: r.methods! });
                else await done('/admin/setup');
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
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" block size="lg" loading={busy}>
              Sign in
            </Button>
          </form>
        ) : (
          <MfaForm
            methods={mfa.methods}
            passkeyOptionsPath="/admin/auth/2fa/passkey/options"
            passkeyBody={{ mfaToken: mfa.token }}
            onSubmit={async (b) => {
              await post('/admin/auth/2fa/verify', { mfaToken: mfa.token, ...b });
              await done('/admin');
            }}
          />
        )}
        {err && (
          <div className="mt-4">
            <ErrorBox message={err} />
          </div>
        )}
        <p className="text-[12px] text-muted mt-6">
          Admin access is restricted, audited and may be limited to approved IP addresses.
        </p>
      </div>
    </div>
  );
}
