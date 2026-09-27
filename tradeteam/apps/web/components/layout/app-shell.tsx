'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/ui/icons';
import { Avatar, cx, Spinner } from '@/components/ui/primitives';
import { Brand } from './brand';
import { useMe, usePrivateEvents, useSetting } from '@/lib/hooks';
import { connection, reconnectSocket } from '@/lib/realtime';
import { applyTheme, theme } from '@/lib/theme';
import { get, post, patch } from '@/lib/api';

const TABS: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: '/dashboard', label: 'Home', icon: 'home', match: ['/dashboard'] },
  { href: '/markets', label: 'Markets', icon: 'markets', match: ['/markets'] },
  { href: '/trade', label: 'Trade', icon: 'trade', match: ['/trade'] },
  { href: '/orders', label: 'Orders', icon: 'orders', match: ['/orders', '/trades'] },
  { href: '/wallet', label: 'Wallet', icon: 'wallet', match: ['/wallet', '/transactions'] },
];

export const MORE: { href: string; label: string; icon: IconName }[] = [
  { href: '/portfolio', label: 'Portfolio', icon: 'portfolio' },
  { href: '/wallet/deposit', label: 'Deposit', icon: 'deposit' },
  { href: '/wallet/withdraw', label: 'Withdraw', icon: 'withdraw' },
  { href: '/wallet/transfer', label: 'Transfer', icon: 'transfer' },
  { href: '/transactions', label: 'Transactions', icon: 'history' },
  { href: '/trades', label: 'Trade history', icon: 'chart' },
  { href: '/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/profile', label: 'Profile', icon: 'user' },
  { href: '/settings/security', label: 'Security', icon: 'shield' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

function useUnread(enabled: boolean) {
  return (
    useQuery({
      queryKey: ['notifications', 'unread'],
      queryFn: () => get<{ unread: number }>('/account/notifications', { limit: 1 }),
      enabled,
      refetchInterval: 60_000,
    }).data?.unread ?? 0
  );
}

export function ConnectionDot() {
  const c = connection.use();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const state = !online ? 'offline' : c.state;
  const color = state === 'open' ? 'bg-up' : state === 'connecting' ? 'bg-warn' : 'bg-down';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] text-muted num"
      title={`Realtime: ${state}${c.latencyMs !== null ? ` · ${c.latencyMs}ms` : ''}`}
    >
      <span className={cx('w-2 h-2 rounded-full', color, state === 'open' && 'animate-pulse')} />
      {state === 'open' && c.latencyMs !== null ? `${c.latencyMs}ms` : state}
    </span>
  );
}

export function ThemeToggle() {
  const t = theme.use();
  const me = useMe().data;
  return (
    <button
      className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-2 hover:bg-card-2"
      aria-label="Toggle theme"
      onClick={() => {
        const next = t === 'light' ? 'dark' : 'light';
        applyTheme(next);
        if (me) patch('/account/profile', { theme: next }).catch(() => undefined);
      }}
    >
      <Icon name={t === 'light' ? 'moon' : 'sun'} size={19} />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const siteName = useSetting('site.name', 'TradeTeam');
  const maintenance = useSetting('maintenance.enabled', false);
  const maintenanceMsg = useSetting('maintenance.message', '');
  const unread = useUnread(Boolean(me));
  usePrivateEvents();

  // Markets and the trading terminal are viewable without an account.
  const guestOk = pathname.startsWith('/markets') || pathname.startsWith('/trade');
  useEffect(() => {
    if (!isLoading && me === null && !guestOk) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, me, pathname, router, guestOk]);
  useEffect(() => {
    if (me?.profile?.theme && me.profile.theme !== theme.get()) applyTheme(me.profile.theme);
  }, [me?.profile?.theme]);

  if (isLoading || (!me && !guestOk))
    return (
      <div className="min-h-dvh flex items-center justify-center text-muted">
        <Spinner size={28} />
      </div>
    );

  const active = (m: string[]) => m.some((x) => pathname === x || pathname.startsWith(`${x}/`));
  const logout = async () => {
    await post('/auth/logout');
    qc.clear();
    reconnectSocket();
    router.replace('/login');
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-line bg-elev h-dvh sticky top-0">
        <div className="px-5 h-16 flex items-center">
          <Brand name={siteName} href="/dashboard" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {[
            ...TABS.map((t) => ({
              href: t.href,
              label: t.label === 'Home' ? 'Dashboard' : t.label,
              icon: t.icon,
              match: t.match,
            })),
            ...MORE.filter((m) => !m.href.startsWith('/wallet/')).map((m) => ({ ...m, match: [m.href] })),
          ].map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cx(
                'flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] font-medium transition',
                active(i.match) ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-card-2',
              )}
            >
              <Icon name={i.icon} size={19} />
              {i.label}
              {i.href === '/notifications' && unread > 0 && (
                <span className="ml-auto text-[11px] font-bold bg-down text-white rounded-full px-1.5 min-w-5 text-center num">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          {me && (
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] font-medium text-fg-2 hover:bg-card-2"
            >
              <Icon name="logout" size={19} /> Sign out
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-line pt-safe">
          <div className="h-14 lg:h-16 px-4 lg:px-6 flex items-center gap-3">
            <div className="lg:hidden">
              <Brand name={siteName} href="/dashboard" />
            </div>
            <Link
              href="/markets"
              className="hidden lg:flex items-center gap-2 h-10 px-3 w-80 rounded-xl bg-card-2 text-muted text-sm"
            >
              <Icon name="search" size={17} /> Search coin, pair or name…
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <ConnectionDot />
              <ThemeToggle />
              {me && (
                <Link
                  href="/notifications"
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center text-fg-2 hover:bg-card-2"
                  aria-label="Notifications"
                >
                  <Icon name="bell" size={19} />
                  {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-down" />}
                </Link>
              )}
              {me ? (
                <>
                  <Link href="/more" className="lg:hidden" aria-label="Menu">
                    <Avatar name={me.name} url={me.avatarUrl} size={32} />
                  </Link>
                  <Link href="/profile" className="hidden lg:flex items-center gap-2.5 pl-2">
                    <Avatar name={me.name} url={me.avatarUrl} size={34} />
                    <span className="text-sm font-semibold max-w-32 truncate">{me.name}</span>
                  </Link>
                </>
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(pathname)}`}
                  className="h-9 px-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold flex items-center"
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
          {maintenance && (
            <div className="bg-warn-soft text-warn text-[13px] px-4 py-2 text-center font-medium">
              {maintenanceMsg || 'Scheduled maintenance in progress. Trading is temporarily paused.'}
            </div>
          )}
          {me && !me.emailVerified && (
            <div className="bg-accent-soft text-accent text-[13px] px-4 py-2 text-center">
              Please verify your email address.{' '}
              <Link href="/verify-email" className="font-semibold underline">
                Verify now
              </Link>
            </div>
          )}
        </header>

        <main
          key={pathname}
          className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-4 lg:py-6 pb-28 lg:pb-8 page-enter"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-elev/95 backdrop-blur-xl border-t border-line pb-safe">
        <div className="grid grid-cols-5 h-16">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cx(
                'flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition',
                active(t.match) ? 'text-accent' : 'text-muted',
              )}
            >
              <Icon name={t.icon} size={22} strokeWidth={active(t.match) ? 2.2 : 1.8} />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  back,
  actions,
  subtitle,
}: {
  title: ReactNode;
  back?: string;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4 lg:mb-6">
      {back && (
        <Link
          href={back}
          className="w-9 h-9 -ml-1 rounded-xl flex items-center justify-center hover:bg-card-2 text-fg"
          aria-label="Back"
        >
          <Icon name="chevronLeft" size={22} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] lg:text-[26px] font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
