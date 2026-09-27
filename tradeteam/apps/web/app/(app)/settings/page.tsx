'use client';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patch } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { applyTheme, theme } from '@/lib/theme';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, SectionTitle, Toggle, cx } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icons';
import { toast } from '@/components/ui/toast';

const CATS: { key: 'trading' | 'wallet' | 'system'; label: string; desc: string }[] = [
  { key: 'trading', label: 'Trading', desc: 'Order fills, partial fills and cancellations' },
  { key: 'wallet', label: 'Wallet', desc: 'Deposits, withdrawals and transfers' },
  { key: 'system', label: 'Announcements', desc: 'Product news and system announcements' },
];
const LINKS: { href: string; label: string; icon: IconName; desc: string }[] = [
  { href: '/settings/security', label: 'Security', icon: 'shield', desc: 'Password, Google, overview' },
  {
    href: '/settings/2fa',
    label: 'Two-factor authentication',
    icon: 'lock',
    desc: 'Authenticator app & backup codes',
  },
  { href: '/settings/passkeys', label: 'Passkeys', icon: 'key', desc: 'Face ID, Touch ID, security keys' },
  {
    href: '/settings/sessions',
    label: 'Sessions & devices',
    icon: 'devices',
    desc: 'Where you are signed in',
  },
  { href: '/profile', label: 'Profile', icon: 'user', desc: 'Name, avatar, timezone, language, currency' },
];

export default function SettingsPage() {
  const me = useMe().data;
  const qc = useQueryClient();
  const t = theme.use();
  const prefs = (me?.profile?.notificationPrefs ?? {}) as Record<
    'email' | 'push' | 'inapp',
    Record<string, boolean> | undefined
  >;
  const save = useMutation({
    mutationFn: (np: unknown) => patch('/account/profile', { notificationPrefs: np }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: () => toast.error('Could not save preferences'),
  });
  const setPref = (channel: 'email' | 'push' | 'inapp', key: string, v: boolean) =>
    save.mutate({ ...prefs, [channel]: { ...(prefs[channel] ?? {}), [key]: v } });
  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window))
        throw new Error('Push notifications are not supported in this browser');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permission denied');
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await fetch('/api/account/push/key').then((r) => r.json());
      if (!publicKey) throw new Error('Push is not configured on this server');
      const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
      const { post } = await import('@/lib/api');
      await post('/account/push/subscribe', sub.toJSON() as never);
      toast('Push notifications enabled');
    } catch (e) {
      toast.error('Push not enabled', (e as Error).message);
    }
  };
  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Settings" />
      <Card>
        <SectionTitle>Appearance</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              onClick={() => (applyTheme(m), patch('/account/profile', { theme: m }).catch(() => undefined))}
              className={cx(
                'rounded-2xl border-2 p-3 text-left transition',
                t === m ? 'border-accent' : 'border-line',
              )}
            >
              <div
                className={cx(
                  'h-16 rounded-xl mb-2 flex gap-1.5 p-2',
                  m === 'light' ? 'bg-[#f5f6fa]' : 'bg-[#0a0f1e]',
                )}
              >
                <span className={cx('w-1/3 rounded-md', m === 'light' ? 'bg-white' : 'bg-[#111a2e]')} />
                <span className={cx('flex-1 rounded-md', m === 'light' ? 'bg-white' : 'bg-[#111a2e]')} />
              </div>
              <span className="font-semibold text-sm capitalize">
                {m} mode{m === 'light' && ' (default)'}
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Notifications</SectionTitle>
        <p className="text-[13px] text-muted mb-2">
          Security alerts are always delivered by email and in-app.
        </p>
        {CATS.map((c) => (
          <div key={c.key} className="py-2 border-b border-line last:border-0">
            <p className="font-medium text-sm">{c.label}</p>
            <p className="text-[12px] text-muted">{c.desc}</p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <Toggle
                checked={prefs.inapp?.[c.key] !== false}
                onChange={(v) => setPref('inapp', c.key, v)}
                label={<span className="text-[12px]">In-app</span>}
              />
              <Toggle
                checked={prefs.email?.[c.key] !== false}
                onChange={(v) => setPref('email', c.key, v)}
                label={<span className="text-[12px]">Email</span>}
              />
              <Toggle
                checked={prefs.push?.[c.key] !== false}
                onChange={(v) => setPref('push', c.key, v)}
                label={<span className="text-[12px]">Push</span>}
              />
            </div>
          </div>
        ))}
        <button onClick={enablePush} className="mt-3 text-sm font-semibold text-accent">
          Enable push notifications on this device
        </button>
      </Card>
      <Card padded={false}>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-3 px-4 py-3.5 border-b border-line last:border-0 hover:bg-card-2"
          >
            <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
              <Icon name={l.icon} size={18} />
            </span>
            <span className="flex-1">
              <span className="block font-medium text-sm">{l.label}</span>
              <span className="block text-[12px] text-muted">{l.desc}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-faint" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
