'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { Spinner, cx } from '@/components/ui/primitives';
import { Logo } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/app-shell';

export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  mfa: boolean;
}

export function useAdmin() {
  return useQuery({
    queryKey: ['admin-me'],
    queryFn: () => get<{ admin: AdminMe | null }>('/admin/auth/me').then((r) => r.admin),
    staleTime: 30_000,
  });
}

export function useCan(perm: string) {
  const a = useAdmin().data;
  return Boolean(a && (a.role === 'super_admin' || a.permissions.includes(perm)));
}

const NAV: { href: string; label: string; icon: IconName; perm: string }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'home', perm: 'dashboard.view' },
  { href: '/admin/users', label: 'Users', icon: 'users', perm: 'users.view' },
  { href: '/admin/markets', label: 'Markets', icon: 'markets', perm: 'markets.view' },
  { href: '/admin/assets', label: 'Assets', icon: 'coins', perm: 'markets.view' },
  { href: '/admin/networks', label: 'Networks', icon: 'network', perm: 'markets.view' },
  { href: '/admin/orders', label: 'Orders', icon: 'orders', perm: 'orders.view' },
  { href: '/admin/trades', label: 'Trades', icon: 'chart', perm: 'orders.view' },
  { href: '/admin/deposits', label: 'Deposits', icon: 'deposit', perm: 'deposits.view' },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: 'withdraw', perm: 'withdrawals.view' },
  { href: '/admin/fees', label: 'Fees', icon: 'fee', perm: 'fees.manage' },
  { href: '/admin/notifications', label: 'Notifications', icon: 'megaphone', perm: 'notifications.send' },
  { href: '/admin/security', label: 'Security', icon: 'shield', perm: 'dashboard.view' },
  { href: '/admin/audit', label: 'Audit logs', icon: 'audit', perm: 'audit.view' },
  { href: '/admin/settings', label: 'System settings', icon: 'settings', perm: 'settings.manage' },
  { href: '/admin/maintenance', label: 'Maintenance', icon: 'tool', perm: 'settings.manage' },
  { href: '/admin/system', label: 'System health', icon: 'health', perm: 'system.view' },
  { href: '/admin/versions', label: 'Version & migrations', icon: 'layers', perm: 'system.view' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: admin, isLoading } = useAdmin();
  const [open, setOpen] = useState(false);
  const bare = pathname === '/admin/login' || pathname === '/admin/setup';
  useEffect(() => {
    if (bare || isLoading) return;
    if (!admin) router.replace('/admin/login');
    else if (!admin.mfa) router.replace('/admin/setup');
  }, [admin, isLoading, bare, router]);
  useEffect(() => setOpen(false), [pathname]);
  if (bare) return <>{children}</>;
  if (isLoading || !admin?.mfa)
    return (
      <div className="min-h-dvh flex items-center justify-center text-muted">
        <Spinner size={28} />
      </div>
    );
  const allowed = NAV.filter((n) => admin.role === 'super_admin' || admin.permissions.includes(n.perm));
  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
      {allowed.map((n) => {
        const active = n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cx(
              'flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] font-medium',
              active ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-card-2',
            )}
          >
            <Icon name={n.icon} size={18} /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
  const logout = async () => {
    await post('/admin/auth/logout');
    qc.removeQueries({ queryKey: ['admin-me'] });
    router.replace('/admin/login');
  };
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-line bg-elev h-dvh sticky top-0">
        <div className="h-16 px-5 flex items-center gap-2.5 font-bold">
          <Logo /> Admin
        </div>
        {nav}
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-elev h-full flex flex-col shadow-pop fade-in">
            <div className="h-14 px-5 flex items-center gap-2.5 font-bold">
              <Logo /> Admin
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-line h-14 lg:h-16 px-4 lg:px-6 flex items-center gap-3 pt-safe">
          <button
            className="lg:hidden w-9 h-9 flex items-center justify-center"
            onClick={() => setOpen(true)}
            aria-label="Menu"
          >
            <Icon name="menu" />
          </button>
          <span className="text-sm text-muted hidden sm:block">
            Signed in as <b className="text-fg">{admin.name}</b> · {admin.role.replace('_', ' ')}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="h-9 px-3 rounded-xl text-sm font-semibold text-fg-2 hover:bg-card-2 flex items-center"
            >
              User app
            </Link>
            <button
              onClick={logout}
              className="h-9 px-3 rounded-xl text-sm font-semibold text-down hover:bg-down-soft flex items-center gap-1.5"
            >
              <Icon name="logout" size={16} /> Sign out
            </button>
          </div>
        </header>
        <main className="p-4 lg:p-6 max-w-[1500px] mx-auto page-enter">{children}</main>
      </div>
    </div>
  );
}

export function AdminTitle({
  title,
  actions,
  subtitle,
}: {
  title: string;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="flex-1 min-w-0">
        <h1 className="text-[24px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
