import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { Bell, ChevronLeft, Download, Headset, Heart, House, LayoutGrid, Menu, PackageSearch, Search, ShoppingCart, X } from 'lucide-react';
import { useCart } from '../../lib/cart';
import { cx } from '../../lib/format';
import { iconUrl, logoUrl } from '../../lib/image';
import { useT } from '../../lib/i18n';
import { installApp, usePwa } from '../../lib/pwa';
import { useSettings, useStoreData } from '../../lib/settings';
import { CategoryIcon, FaIcon } from '../../components/CategoryIcon';
import { Sheet } from '../../components/ui';

export function useCartCount() {
  return useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));
}

export function Brand({ compact }: { compact?: boolean }) {
  const s = useSettings();
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5">
      {s.logo ? (
        <img src={logoUrl(s.logo)} alt={s.site_name} className={cx('w-auto object-contain', compact ? 'h-8' : 'h-9')} />
      ) : (
        <>
          <img src={iconUrl(s.app_icon || s.favicon, 192)} alt="" className="size-9 rounded-xl" />
          <span className="truncate text-[19px] font-extrabold tracking-tight">{s.site_name}</span>
        </>
      )}
    </Link>
  );
}

export function whatsappLink(number: string, message: string) {
  const n = number.replace(/[^\d]/g, '');
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

export function WhatsAppFab() {
  const s = useSettings();
  const { pathname } = useLocation();
  if (!s.whatsapp_enabled || !s.whatsapp_number || pathname.startsWith('/checkout') || pathname.startsWith('/order/')) return null;
  return (
    <a
      href={whatsappLink(s.whatsapp_number, s.whatsapp_default_message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={s.whatsapp_greeting || 'WhatsApp'}
      title={s.whatsapp_greeting}
      className="press fixed right-4 bottom-[88px] z-40 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_-8px_rgba(37,211,102,.7)] md:bottom-6"
    >
      <FaIcon name="fa-brands fa-whatsapp" className="text-[30px]" />
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25D366]/40 [animation-duration:2.5s]" />
    </a>
  );
}

/** Pages with their own sticky action bar hide the tab bar. */
const NO_TABBAR = /^\/(product|combo|checkout|order)(\/|$)/;

export function BottomNav() {
  const t = useT();
  const count = useCartCount();
  const { pathname } = useLocation();
  const items: Array<{ to: string; label: string; icon: ReactNode; badge?: number }> = [
    { to: '/', label: t('home'), icon: <House className="size-[22px]" /> },
    { to: '/categories', label: t('categories'), icon: <LayoutGrid className="size-[22px]" /> },
    { to: '/search', label: t('search'), icon: <Search className="size-[22px]" /> },
    { to: '/cart', label: t('cart'), icon: <ShoppingCart className="size-[22px]" />, badge: count },
    { to: '/contact', label: t('support'), icon: <Headset className="size-[22px]" /> },
  ];
  if (NO_TABBAR.test(pathname)) return null;
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/95 backdrop-blur-xl md:hidden" aria-label="Main">
      <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => cx('relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', isActive ? 'text-brand-500' : 'text-muted')}>
            {({ isActive }) => (
              <>
                <span className={cx('relative transition-transform', isActive && '-translate-y-0.5')}>
                  {it.icon}
                  {Boolean(it.badge) && <span className="absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">{it.badge! > 99 ? '99+' : it.badge}</span>}
                </span>
                {it.label}
                {isActive && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand-500" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Compact mobile top bar used by inner pages (Categories, Product, Cart…). */
export function TopBar({ title, subtitle, right, back = true }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; back?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center gap-2 px-3">
        {back && (
          <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} className="press grid size-10 place-items-center rounded-full text-ink hover:bg-soft" aria-label="Back">
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {title && <h1 className="truncate text-[19px] font-extrabold tracking-tight">{title}</h1>}
          {subtitle && <p className="-mt-0.5 truncate text-[12px] text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function CartButton({ className }: { className?: string }) {
  const count = useCartCount();
  return (
    <Link to="/cart" className={cx('press relative grid size-10 place-items-center rounded-full text-ink hover:bg-soft', className)} aria-label="Cart">
      <ShoppingCart className="size-[22px]" />
      {count > 0 && <span className="absolute top-0.5 right-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-canvas">{count}</span>}
    </Link>
  );
}

export function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { categories, pages, settings: s } = useStoreData();
  const { prompt, installed, ios } = usePwa();
  const { pathname } = useLocation();
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const roots = categories.filter((c) => !c.parent_id);
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-[#1d130d]/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] animate-[slide-in_.22s_ease-out] flex-col bg-canvas shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <Brand compact />
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-soft" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">{t('categories')}</p>
          {roots.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold hover:bg-soft">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-500"><CategoryIcon type={c.icon_type} value={c.icon_value} name={c.name} className="text-[16px]" /></span>
              {c.name}
            </Link>
          ))}
          <div className="my-3 h-px bg-line" />
          <Link to="/wishlist" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold hover:bg-soft"><Heart className="size-5 text-brand-500" />{t('wishlist')}</Link>
          <Link to="/track" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold hover:bg-soft"><PackageSearch className="size-5 text-brand-500" />{t('trackOrder')}</Link>
          <Link to="/contact" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold hover:bg-soft"><Headset className="size-5 text-brand-500" />{t('contact')}</Link>
          {s.pwa_enabled && !installed && (prompt || ios) && (
            <button onClick={() => (prompt ? void installApp() : alert('Safari → Share → “Add to Home Screen”'))} className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-brand-50 px-3 py-3 font-bold text-brand-700">
              <Download className="size-5" />{t('installApp')}
            </button>
          )}
          <div className="my-3 h-px bg-line" />
          {pages.map((p) => <Link key={p.slug} to={`/page/${p.slug}`} className="block rounded-xl px-3 py-2 text-[14px] text-ink-2 hover:bg-soft">{p.title}</Link>)}
        </div>
      </aside>
    </div>
  );
}

export function OffersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const s = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Bell className="size-5 text-brand-500" /> Offers</span>}>
      <div className="space-y-3 text-[14px]">
        {s.free_delivery_min_order > 0 && <div className="rounded-2xl bg-green-50 p-4 font-semibold text-green-800">🚚 {t('freeDelivery')} — ৳{s.free_delivery_min_order}+</div>}
        <Link to="/flash-sale" onClick={onClose} className="block rounded-2xl bg-brand-50 p-4 font-semibold text-brand-800">⚡ {t('flashSale')}</Link>
        <Link to="/combos" onClick={onClose} className="block rounded-2xl bg-violet-50 p-4 font-semibold text-violet-800">🎁 {t('combos')}</Link>
        <p className="px-1 text-[12.5px] text-muted">{s.cod_note}</p>
      </div>
    </Sheet>
  );
}

export function DesktopHeader() {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { categories } = useStoreData();
  return (
    <header className="sticky top-0 z-40 hidden border-b border-line/70 bg-canvas/85 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-6 px-6">
        <Brand />
        <form className="relative max-w-xl flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className="h-12 w-full rounded-full border border-line bg-surface pr-4 pl-12 text-[14px] outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100" />
        </form>
        <nav className="flex items-center gap-1 text-[14px] font-semibold text-ink-2">
          <NavLink to="/categories" className={({ isActive }) => cx('rounded-full px-3 py-2 hover:bg-soft', isActive && 'text-brand-600')}>{t('categories')}</NavLink>
          <NavLink to="/combos" className={({ isActive }) => cx('rounded-full px-3 py-2 hover:bg-soft', isActive && 'text-brand-600')}>{t('combos')}</NavLink>
          <NavLink to="/track" className={({ isActive }) => cx('rounded-full px-3 py-2 hover:bg-soft', isActive && 'text-brand-600')}>{t('trackOrder')}</NavLink>
          <Link to="/wishlist" className="press grid size-10 place-items-center rounded-full hover:bg-soft" aria-label={t('wishlist')}><Heart className="size-[21px]" /></Link>
          <CartButton />
        </nav>
      </div>
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-5 pb-2 scrollbar-none">
        {categories.filter((c) => !c.parent_id).slice(0, 12).map((c) => (
          <NavLink key={c.id} to={`/category/${c.slug}`} className={({ isActive }) => cx('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition hover:bg-soft', isActive ? 'bg-brand-50 text-brand-700' : 'text-muted')}>{c.name}</NavLink>
        ))}
      </div>
    </header>
  );
}

export function Footer() {
  const t = useT();
  const { pages, settings: s } = useStoreData();
  return (
    <footer className="mt-10 border-t border-line/70 bg-surface/60 pb-28 md:pb-10">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <Brand />
          <p className="mt-3 max-w-md text-[14px] text-muted">{s.site_tagline}</p>
          <div className="mt-4 flex gap-2">
            {s.facebook_url && <a href={s.facebook_url} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-full bg-soft text-[#1877F2]" aria-label="Facebook"><FaIcon name="fa-brands fa-facebook-f" /></a>}
            {s.instagram_url && <a href={s.instagram_url} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-full bg-soft text-[#E4405F]" aria-label="Instagram"><FaIcon name="fa-brands fa-instagram" /></a>}
            {s.youtube_url && <a href={s.youtube_url} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-full bg-soft text-[#FF0000]" aria-label="YouTube"><FaIcon name="fa-brands fa-youtube" /></a>}
            {s.whatsapp_number && <a href={whatsappLink(s.whatsapp_number, s.whatsapp_default_message)} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-full bg-soft text-[#25D366]" aria-label="WhatsApp"><FaIcon name="fa-brands fa-whatsapp" /></a>}
          </div>
        </div>
        <div>
          <p className="mb-3 text-[13px] font-bold tracking-wide text-ink uppercase">Info</p>
          <ul className="space-y-2 text-[14px] text-muted">
            {pages.map((p) => <li key={p.slug}><Link to={`/page/${p.slug}`} className="hover:text-brand-600">{p.title}</Link></li>)}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-[13px] font-bold tracking-wide text-ink uppercase">{t('contact')}</p>
          <ul className="space-y-2 text-[14px] text-muted">
            {s.contact_phone && <li><a href={`tel:${s.contact_phone}`} className="hover:text-brand-600">{s.contact_phone}</a></li>}
            {s.contact_email && <li><a href={`mailto:${s.contact_email}`} className="hover:text-brand-600">{s.contact_email}</a></li>}
            {s.contact_address && <li>{s.contact_address}</li>}
            <li><Link to="/track" className="hover:text-brand-600">{t('trackOrder')}</Link></li>
          </ul>
        </div>
      </div>
      <p className="text-center text-[12px] text-muted">© {new Date().getFullYear()} {s.site_name} · {t('cod')}</p>
    </footer>
  );
}

export function HomeHeader() {
  const t = useT();
  const s = useSettings();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [offers, setOffers] = useState(false);
  return (
    <div className="md:hidden">
      <div className="flex items-center gap-2 px-4 pt-4">
        <button onClick={() => setMenu(true)} className="press grid size-11 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-soft)]" aria-label="Menu"><Menu className="size-5" /></button>
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-[12px] text-muted">{t('hello')} 👋</p>
          <p className="truncate text-[19px] leading-tight font-extrabold tracking-tight">{s.site_name}</p>
        </div>
        <button onClick={() => setOffers(true)} className="press relative grid size-11 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-soft)]" aria-label="Offers">
          <Bell className="size-5" />
          <span className="absolute top-2.5 right-3 size-2 rounded-full bg-brand-500 ring-2 ring-surface" />
        </button>
        <CartButton className="size-11 rounded-2xl bg-surface shadow-[var(--shadow-soft)]" />
      </div>
      <button onClick={() => navigate('/search')} className="mx-4 mt-4 flex h-12 w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-surface px-4 text-left text-[14px] text-muted shadow-[var(--shadow-soft)]">
        <Search className="size-5 text-ink-2" /> {t('searchPlaceholder')}
      </button>
      <MenuDrawer open={menu} onClose={() => setMenu(false)} />
      <OffersSheet open={offers} onClose={() => setOffers(false)} />
    </div>
  );
}
