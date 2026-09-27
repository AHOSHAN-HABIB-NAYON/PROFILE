import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import {
  Activity, BarChart3, Bell, Boxes, ChevronDown, Database, ExternalLink, FileText, Fingerprint, Gift, House, Image, Layers, LayoutGrid, LogOut, Menu, MessageSquare,
  Package, RefreshCw, Settings, Shield, ShieldCheck, ShoppingBag, Ticket, Trash2, Truck, Users, Wrench, X, Zap, History, UserCog, Award,
} from 'lucide-react';
import { api } from '../lib/api';
import { cx, timeAgo } from '../lib/format';
import { iconUrl } from '../lib/image';
import { useBootstrap } from '../lib/settings';
import { PageSpinner, toast, Toaster } from '../components/ui';
import { useMe } from './components/kit';

export interface NavItem { to: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: string; superOnly?: boolean }
export const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  { title: 'Overview', items: [
    { to: '/admin', label: 'Dashboard', icon: House, perm: 'dashboard.view' },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view' },
  ] },
  { title: 'Sales', items: [
    { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, perm: 'orders.view' },
    { to: '/admin/customers', label: 'Customers', icon: Users, perm: 'customers.view' },
    { to: '/admin/couriers', label: 'Couriers', icon: Truck, perm: 'couriers.manage' },
    { to: '/admin/fraud', label: 'Fraud Protection', icon: Shield, perm: 'fraud.manage' },
  ] },
  { title: 'Catalog', items: [
    { to: '/admin/products', label: 'Products', icon: Package, perm: 'products.view' },
    { to: '/admin/categories', label: 'Categories', icon: LayoutGrid, perm: 'catalog.manage' },
    { to: '/admin/brands', label: 'Brands', icon: Award, perm: 'catalog.manage' },
    { to: '/admin/reviews', label: 'Reviews', icon: MessageSquare, perm: 'products.view' },
  ] },
  { title: 'Marketing', items: [
    { to: '/admin/banners', label: 'Banners', icon: Image, perm: 'marketing.manage' },
    { to: '/admin/home-sections', label: 'Home Sections', icon: Layers, perm: 'marketing.manage' },
    { to: '/admin/flash-sales', label: 'Flash Sales', icon: Zap, perm: 'marketing.manage' },
    { to: '/admin/combos', label: 'Combo Offers', icon: Gift, perm: 'marketing.manage' },
    { to: '/admin/coupons', label: 'Coupons', icon: Ticket, perm: 'marketing.manage' },
  ] },
  { title: 'Store', items: [
    { to: '/admin/delivery', label: 'Delivery', icon: Boxes, perm: 'settings.manage' },
    { to: '/admin/pages', label: 'Pages', icon: FileText, perm: 'pages.manage' },
    { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
  ] },
  { title: 'System', items: [
    { to: '/admin/admins', label: 'Admins & Roles', icon: UserCog, perm: 'admins.manage' },
    { to: '/admin/security', label: 'My Security', icon: Fingerprint },
    { to: '/admin/audit', label: 'Activity Log', icon: History, perm: 'audit.view' },
    { to: '/admin/trash', label: 'Trash', icon: Trash2, perm: 'trash.manage' },
    { to: '/admin/system/backups', label: 'Backups', icon: Database, perm: 'system.manage' },
    { to: '/admin/system/updates', label: 'Updates', icon: RefreshCw, superOnly: true },
    { to: '/admin/system/health', label: 'System Health', icon: Activity, perm: 'system.manage' },
  ] },
];

const BOTTOM: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: House },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, perm: 'orders.view' },
  { to: '/admin/products', label: 'Products', icon: Package, perm: 'products.view' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view' },
  { to: '/admin/more', label: 'More', icon: Menu },
];

interface Notification { id: number; type: string; title: string; message: string | null; link: string | null; is_read: number; created_at: string }

export function useAllowed() {
  const { data } = useMe();
  const perms = data?.admin?.permissions ?? [];
  const isSuper = data?.admin?.role === 'super_admin';
  return (item: NavItem) => (item.superOnly ? isSuper : !item.perm || perms.includes('*') || perms.includes(item.perm));
}

export default function AdminLayout() {
  const me = useMe();
  const boot = useBootstrap();
  const { pathname } = useLocation();
  const allowed = useAllowed();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => { document.title = `Admin · ${boot.data?.settings.site_name ?? 'ShopiGo'}`; }, [boot.data?.settings.site_name]);

  if (me.isLoading) return <PageSpinner />;
  if (!me.data?.authenticated) return <Navigate to={`/admin/login?next=${encodeURIComponent(pathname)}`} replace />;
  if (me.data.mustSetup2fa && pathname !== '/admin/security') return <Navigate to="/admin/security?setup=1" replace />;

  const s = boot.data?.settings;
  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link to="/admin" className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <img src={iconUrl(s?.app_icon || s?.favicon, 192)} alt="" className="size-9 rounded-xl" />
        <div className="min-w-0"><p className="truncate text-[15px] font-extrabold">{s?.site_name ?? 'ShopiGo'}</p><p className="text-[11px] text-muted">Admin panel</p></div>
      </Link>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter(allowed);
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <p className="px-3 pb-1 text-[10.5px] font-bold tracking-wider text-muted uppercase">{g.title}</p>
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/admin'} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition', isActive ? 'bg-brand-500 text-white shadow-[var(--shadow-float)]' : 'text-ink-2 hover:bg-soft')}>
                  <it.icon className="size-[18px]" />{it.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
      <a href="/" target="_blank" rel="noopener noreferrer" className="mx-3 mb-4 flex items-center gap-2 rounded-xl bg-soft px-3 py-2.5 text-[13px] font-semibold text-ink-2"><ExternalLink className="size-4" /> View store</a>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f8f3ee]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-[slide-in_.2s_ease-out] bg-surface shadow-2xl">
            <button onClick={() => setDrawer(false)} className="absolute top-5 right-3 grid size-8 place-items-center rounded-full bg-soft" aria-label="Close"><X className="size-4" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <TopBar onMenu={() => setDrawer(true)} name={me.data.admin!.name} role={me.data.admin!.role} />
        <main className="mx-auto max-w-[1400px] px-4 pt-4 pb-28 md:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl lg:hidden" aria-label="Admin">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {BOTTOM.filter(allowed).map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/admin'} className={({ isActive }) => cx('flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold', isActive ? 'text-brand-500' : 'text-muted')}>
              <it.icon className="size-[21px]" />{it.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}

function TopBar({ onMenu, name, role }: { onMenu: () => void; name: string; role: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: Notification[]; unread: number }>('/api/admin/system/notifications?limit=15'), refetchInterval: 120_000 });

  // Live alerts (new orders, fraud, low stock…) over Server-Sent Events.
  useEffect(() => {
    const es = new EventSource('/api/admin/system/notifications/stream');
    es.addEventListener('notification', (e) => {
      const n = JSON.parse((e as MessageEvent).data) as Notification;
      toast.info(n.title);
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type === 'new_order') { void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); }
    });
    return () => es.close();
  }, [qc]);

  const logout = async () => {
    await api.post('/api/auth/logout');
    qc.clear();
    navigate('/admin/login', { replace: true });
  };
  const markAll = async () => { await api.post('/api/admin/system/notifications/read', {}); void notes.refetch(); };

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-[#f8f3ee]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 md:px-6">
        <button onClick={onMenu} className="grid size-10 place-items-center rounded-xl bg-surface shadow-[var(--shadow-soft)] lg:hidden" aria-label="Menu"><Menu className="size-5" /></button>
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="relative grid size-10 place-items-center rounded-xl bg-surface shadow-[var(--shadow-soft)]" aria-label="Notifications">
            <Bell className="size-5" />
            {Boolean(notes.data?.unread) && <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{notes.data!.unread > 99 ? '99+' : notes.data!.unread}</span>}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line">
                <div className="flex items-center justify-between px-4 py-3"><p className="font-bold">Notifications</p><button onClick={() => void markAll()} className="text-[12px] font-semibold text-brand-600">Mark all read</button></div>
                <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                  {notes.data?.items.length ? notes.data.items.map((n) => (
                    <li key={n.id}>
                      <Link to={n.link ?? '/admin/notifications'} onClick={() => setOpen(false)} className={cx('block px-4 py-3 hover:bg-soft', !n.is_read && 'bg-brand-50/50')}>
                        <p className="text-[13.5px] font-semibold">{n.title}</p>
                        {n.message && <p className="line-clamp-2 text-[12.5px] text-muted">{n.message}</p>}
                        <p className="mt-0.5 text-[11px] text-muted">{timeAgo(n.created_at)}</p>
                      </Link>
                    </li>
                  )) : <li className="px-4 py-8 text-center text-[13px] text-muted">No notifications</li>}
                </ul>
                <Link to="/admin/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-semibold text-brand-600">View all</Link>
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setUserMenu(!userMenu)} className="flex items-center gap-2 rounded-xl bg-surface py-1.5 pr-3 pl-1.5 shadow-[var(--shadow-soft)]">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-[13px] font-bold text-white">{name.slice(0, 1).toUpperCase()}</span>
            <span className="hidden text-left sm:block"><span className="block text-[13px] leading-tight font-semibold">{name}</span><span className="block text-[11px] leading-tight text-muted">{role.replace('_', ' ')}</span></span>
            <ChevronDown className="size-4 text-muted" />
          </button>
          {userMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl bg-surface py-1 shadow-2xl ring-1 ring-line">
                <Link to="/admin/security" onClick={() => setUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] hover:bg-soft"><ShieldCheck className="size-4" />Security & passkeys</Link>
                <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] hover:bg-soft"><ExternalLink className="size-4" />View store</a>
                <Link to="/admin/system/health" onClick={() => setUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] hover:bg-soft"><Wrench className="size-4" />System</Link>
                <button onClick={() => void logout()} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-danger hover:bg-soft"><LogOut className="size-4" />Sign out</button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

