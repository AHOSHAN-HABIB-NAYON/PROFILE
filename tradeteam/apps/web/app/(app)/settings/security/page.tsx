'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, del, errorMessage } from '@/lib/api';
import { useSetting } from '@/lib/hooks';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, Button, Card, Input, SectionTitle, Skeleton, Toggle } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { fmtDateTime } from '@/lib/format';

interface Sec {
  twoFactor: { enabled: boolean; backupCodesRemaining: number };
  passkeys: { id: string }[];
  googleLinked: boolean;
  hasPassword: boolean;
  emailVerified: boolean;
}

function Item({
  icon,
  title,
  desc,
  status,
  href,
  action,
}: {
  icon: IconName;
  title: string;
  desc: string;
  status?: React.ReactNode;
  href?: string;
  action?: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
        <Icon name={icon} size={19} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-sm">{title}</span>
        <span className="block text-[12px] text-muted">{desc}</span>
      </span>
      {status}
      {action ?? (href && <Icon name="chevronRight" size={18} className="text-faint" />)}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 border-b border-line last:border-0 hover:bg-card-2"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line last:border-0">{inner}</div>
  );
}

export default function SecurityPage() {
  const qc = useQueryClient();
  const googleOn = useSetting('auth.google_enabled', false);
  const q = useQuery({ queryKey: ['security'], queryFn: () => get<Sec>('/account/security') });
  const history = useQuery({
    queryKey: ['login-history'],
    queryFn: () =>
      get<{
        items: {
          id: number;
          ip: string;
          method: string;
          success: number;
          reason: string | null;
          createdAt: string;
        }[];
      }>('/account/login-history'),
  });
  const events = useQuery({
    queryKey: ['security-events'],
    queryFn: () =>
      get<{ items: { id: number; type: string; ip: string | null; createdAt: string }[] }>(
        '/account/security-events',
      ),
  });
  const [pw, setPw] = useState<{ open: boolean; current: string; next: string; others: boolean }>({
    open: false,
    current: '',
    next: '',
    others: true,
  });
  const changePw = useMutation({
    mutationFn: () =>
      post('/account/password', {
        currentPassword: pw.current || undefined,
        newPassword: pw.next,
        signOutOthers: pw.others,
      }),
    onSuccess: () => (
      toast('Password updated'),
      setPw({ open: false, current: '', next: '', others: true }),
      qc.invalidateQueries({ queryKey: ['security'] })
    ),
    onError: (e) => toast.error('Password not changed', errorMessage(e)),
  });
  const unlinkGoogle = useMutation({
    mutationFn: () => del('/account/google'),
    onSuccess: () => (toast('Google unlinked'), qc.invalidateQueries({ queryKey: ['security'] })),
    onError: (e) => toast.error('Could not unlink', errorMessage(e)),
  });
  const s = q.data;
  const score = s
    ? [s.emailVerified, s.twoFactor.enabled, s.passkeys.length > 0, s.hasPassword || s.googleLinked].filter(
        Boolean,
      ).length
    : 0;
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Security" back="/settings" />
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-up-soft text-up flex items-center justify-center">
            <Icon name="shield" size={28} />
          </div>
          <div>
            <p className="font-bold">
              Security level: {score >= 4 ? 'Strong' : score >= 3 ? 'Good' : 'Basic'}
            </p>
            <p className="text-[13px] text-muted">
              {score >= 4
                ? 'Your account uses every available protection.'
                : 'Add a passkey and 2FA to fully protect withdrawals.'}
            </p>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? 'bg-up' : 'bg-line'}`} />
          ))}
        </div>
      </Card>
      <Card padded={false}>
        {q.isLoading || !s ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <Item
              icon="lock"
              title="Two-factor authentication"
              desc={
                s.twoFactor.enabled
                  ? `${s.twoFactor.backupCodesRemaining} backup codes remaining`
                  : 'Protect sign-ins and withdrawals'
              }
              status={s.twoFactor.enabled ? <Badge tone="up">On</Badge> : <Badge tone="warn">Off</Badge>}
              href="/settings/2fa"
            />
            <Item
              icon="key"
              title="Passkeys"
              desc="Sign in with Face ID, Touch ID or a security key"
              status={<Badge tone={s.passkeys.length ? 'up' : 'neutral'}>{s.passkeys.length}</Badge>}
              href="/settings/passkeys"
            />
            <Item
              icon="devices"
              title="Sessions & devices"
              desc="Review and sign out other devices"
              href="/settings/sessions"
            />
            <Item
              icon="key"
              title="Password"
              desc={s.hasPassword ? 'Change your password' : 'Set a password for email sign-in'}
              action={
                <Button size="sm" variant="secondary" onClick={() => setPw({ ...pw, open: true })}>
                  {s.hasPassword ? 'Change' : 'Set'}
                </Button>
              }
            />
            {(googleOn || s.googleLinked) && (
              <Item
                icon="google"
                title="Google account"
                desc={
                  s.googleLinked ? 'Linked — you can sign in with Google' : 'Link Google for one-tap sign-in'
                }
                action={
                  s.googleLinked ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={unlinkGoogle.isPending}
                      onClick={() => unlinkGoogle.mutate()}
                    >
                      Unlink
                    </Button>
                  ) : (
                    <a href="/api/auth/google/start?intent=link">
                      <Button size="sm" variant="secondary">
                        Link
                      </Button>
                    </a>
                  )
                }
              />
            )}
            <Item
              icon="mail"
              title="Email verification"
              desc={s.emailVerified ? 'Your email is verified' : 'Verify your email address'}
              status={
                s.emailVerified ? (
                  <Badge tone="up">Verified</Badge>
                ) : (
                  <Link href="/verify-email">
                    <Badge tone="warn">Verify</Badge>
                  </Link>
                )
              }
            />
          </>
        )}
      </Card>
      <Card>
        <SectionTitle>Recent sign-in activity</SectionTitle>
        {history.data?.items.slice(0, 10).map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between py-2 text-[13px] border-b border-line last:border-0"
          >
            <span>
              <span className={h.success ? 'text-up font-semibold' : 'text-down font-semibold'}>
                {h.success ? (h.reason === 'mfa_pending' ? 'Password OK' : 'Success') : 'Failed'}
              </span>{' '}
              · {h.method}
              {h.reason && !h.success ? ` · ${h.reason.replace(/_/g, ' ')}` : ''}
            </span>
            <span className="text-muted num">
              {h.ip} · {fmtDateTime(h.createdAt)}
            </span>
          </div>
        )) ?? <Skeleton className="h-24" />}
      </Card>
      <Card>
        <SectionTitle>Security events</SectionTitle>
        {events.data?.items.slice(0, 10).map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between py-2 text-[13px] border-b border-line last:border-0"
          >
            <span className="capitalize">{e.type.replace(/_/g, ' ')}</span>
            <span className="text-muted num">
              {e.ip ?? ''} · {fmtDateTime(e.createdAt)}
            </span>
          </div>
        )) ?? <Skeleton className="h-24" />}
      </Card>
      <Sheet
        open={pw.open}
        onClose={() => setPw({ ...pw, open: false })}
        title={s?.hasPassword ? 'Change password' : 'Set password'}
      >
        <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), changePw.mutate())}>
          {s?.hasPassword && (
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              required
            />
          )}
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
            required
            minLength={10}
            hint="At least 10 characters with upper & lower case letters and a number."
          />
          <Toggle
            checked={pw.others}
            onChange={(v) => setPw({ ...pw, others: v })}
            label="Sign out other devices"
          />
          <Button type="submit" block size="lg" loading={changePw.isPending}>
            Save password
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
