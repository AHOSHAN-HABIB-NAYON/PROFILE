import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Heart } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useWishlist } from '../../lib/cart';
import { useT } from '../../lib/i18n';
import type { ProductCard as Card } from '../../lib/types';
import { Button, Empty } from '../../components/ui';
import { CartButton, TopBar } from '../components/chrome';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard';

export default function Wishlist() {
  const t = useT();
  const ids = useWishlist((w) => w.ids);
  const { data, isLoading } = useQuery({
    queryKey: ['wishlist', ids],
    queryFn: async () => {
      const res = await api.get<{ items: Card[] }>(`/api/public/products${qs({ ids: ids.slice(0, 60).join(','), limit: 60 })}`);
      const byId = new Map(res.items.map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as Card[];
    },
    enabled: ids.length > 0,
  });
  return (
    <div>
      <TopBar title={t('wishlist')} right={<CartButton />} />
      <div className="px-4 md:px-0 md:pt-6">
        <h1 className="mb-4 hidden text-[26px] font-extrabold md:block">{t('wishlist')}</h1>
        {!ids.length ? <Empty icon={<Heart className="size-9" />} title={t('wishlist')} text="—" action={<Link to="/"><Button>{t('continueShopping')}</Button></Link>} /> : isLoading ? <ProductGridSkeleton count={4} /> : <ProductGrid products={data ?? []} />}
      </div>
    </div>
  );
}
