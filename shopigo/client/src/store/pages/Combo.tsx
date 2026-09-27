import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { Gift, ShoppingCart, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { money } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { useSettings } from '../../lib/settings';
import { track } from '../../lib/tracking';
import type { Combo as ComboT } from '../../lib/types';
import { Button, PageSpinner, Picture, toast } from '../../components/ui';
import { CartButton, TopBar } from '../components/chrome';
import NotFound from './NotFound';

export default function Combo() {
  const t = useT();
  const s = useSettings();
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const add = useCart((c) => c.add);
  const { data: c, isLoading } = useQuery({ queryKey: ['combo', slug], queryFn: () => api.get<ComboT>(`/api/public/combos/${slug}`) });
  if (isLoading) return <PageSpinner />;
  if (!c) return <NotFound />;
  const buy = (now: boolean) => {
    add({ comboId: c.id, name: c.name, image: c.image, slug: c.slug, price: c.price });
    track('add_to_cart', { value: c.price, name: c.name });
    if (now) navigate('/checkout');
    else toast.success(t('addedToCart'), { label: t('viewCart'), onClick: () => navigate('/cart') });
  };
  return (
    <div className="pb-24 md:pb-0">
      <TopBar title={t('combos')} right={<CartButton />} />
      <div className="px-4 md:px-0 md:pt-6">
        <div className="rounded-[28px] bg-gradient-to-br from-[#ffb088] via-[#ff9a6c] to-[#f26b3a] p-6 text-white shadow-[var(--shadow-float)]">
          <span className="chip bg-white/25 text-white"><Gift className="size-3.5" />{t('combos')}</span>
          <h1 className="mt-2 text-[26px] leading-tight font-extrabold">{c.name}</h1>
          {c.description && <p className="mt-1 text-[14px] text-white/85">{c.description}</p>}
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-[32px] font-extrabold">{money(c.price, s.currency_symbol)}</span>
            <span className="text-[16px] text-white/70 line-through">{money(c.regularPrice, s.currency_symbol)}</span>
            <span className="chip bg-white text-brand-600">{t('save')} {money(c.savings, s.currency_symbol)}</span>
          </div>
        </div>
        <h2 className="mt-6 mb-3 text-[17px] font-bold">{t('comboIncludes')}</h2>
        <div className="space-y-3">
          {c.items.map((it) => (
            <Link key={it.id} to={`/product/${it.slug}`} className="card flex items-center gap-3 p-3">
              <Picture path={it.image} alt={it.name} size="thumb" className="size-16 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1"><p className="line-clamp-2 text-[14px] font-semibold">{it.name}</p><p className="text-[12.5px] text-muted">× {it.quantity}</p></div>
              <span className="text-[13px] text-muted line-through">{money(it.price * it.quantity, s.currency_symbol)}</span>
            </Link>
          ))}
        </div>
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-line bg-surface/95 p-3 backdrop-blur-xl md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
          <Button variant="outline" size="lg" className="flex-1" disabled={!c.available} icon={<ShoppingCart className="size-5" />} onClick={() => buy(false)}>{t('addToCart')}</Button>
          <Button size="lg" className="cta-glow flex-1" disabled={!c.available} icon={<Zap className="size-5 fill-current" />} onClick={() => buy(true)}>{c.available ? t('buyCombo') : t('outOfStock')}</Button>
        </div>
      </div>
    </div>
  );
}
