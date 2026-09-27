'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button, ErrorBox, Input } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';
import { post, errorMessage } from '@/lib/api';
import { useSetting } from '@/lib/hooks';

function strength(p: string) {
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

export default function RegisterPage() {
  const router = useRouter();
  const open = useSetting('auth.registration_enabled', true);
  const googleOn = useSetting('auth.google_enabled', false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = strength(f.password);
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join your team's trading workspace."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-accent font-semibold">
            Log in
          </Link>
        </>
      }
    >
      {!open ? (
        <ErrorBox message="Registration is currently closed. Contact your administrator for an invitation." />
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await post('/auth/register', f);
              router.push(`/verify-email?email=${encodeURIComponent(f.email)}&new=1`);
            } catch (e2) {
              setErr(errorMessage(e2));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            label="Full name"
            autoComplete="name"
            icon="user"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            icon="mail"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            required
          />
          <div>
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              icon="lock"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              required
              minLength={10}
              hint="At least 10 characters with upper & lower case letters and a number."
            />
            <div className="flex gap-1 mt-2">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i < s ? (s < 2 ? 'bg-down' : s < 3 ? 'bg-warn' : 'bg-up') : 'bg-line'}`}
                />
              ))}
            </div>
          </div>
          <label className="flex gap-2.5 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-0.5"
            />
            I understand that trading digital assets involves risk and agree to the platform terms.
          </label>
          <Button type="submit" block size="lg" loading={busy} disabled={!accept}>
            Create account
          </Button>
          {googleOn && (
            <a
              href="/api/auth/google/start"
              className="flex items-center justify-center gap-2.5 h-12 rounded-2xl border border-line-strong bg-white text-[#1f1f1f] font-semibold text-[15px]"
            >
              <Icon name="google" size={20} /> Sign up with Google
            </a>
          )}
          {err && <ErrorBox message={err} />}
        </form>
      )}
    </AuthLayout>
  );
}
