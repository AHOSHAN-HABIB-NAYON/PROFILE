import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { api } from '../../lib/api';
import { img } from '../../lib/image';
import { useT } from '../../lib/i18n';
import type { CategoryLite } from '../../lib/types';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Picture, Skeleton } from '../../components/ui';
import { CartButton, TopBar } from '../components/chrome';
import { SectionHeader } from '../components/ProductCard';

export default function Categories() {
  const t = useT();
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryLite[]>('/api/public/categories'), staleTime: 5 * 60_000 });
  const brands = useQuery({ queryKey: ['brands'], queryFn: () => api.get<Array<{ id: number; name: string; slug: string; logo: string | null }>>('/api/public/brands'), staleTime: 5 * 60_000 });
  const list = useMemo(() => (data ?? []).filter((c) => !c.parent_id && c.name.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);
  return (
    <div>
      <TopBar title={t('categories')} right={<CartButton />} />
      <div className="px-4 md:px-0 md:pt-6">
        <h1 className="mb-4 hidden text-[26px] font-extrabold tracking-tight md:block">{t('categories')}</h1>
        <label className="relative mb-4 block">
          <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories…" className="h-12 w-full rounded-2xl bg-surface pr-4 pl-12 text-[14px] shadow-[var(--shadow-soft)] outline-none focus:ring-4 focus:ring-brand-100" />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[4/3.4]" />)}
          {list.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className="group overflow-hidden rounded-[22px] bg-surface shadow-[var(--shadow-card)] transition hover:-translate-y-0.5">
              {c.image ? (
                <Picture path={c.image} alt={c.name} className="aspect-[4/3]" sizes="(max-width:640px) 50vw, 25vw" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-brand-50 to-[#ffe9dc] text-brand-500"><CategoryIcon type={c.icon_type} value={c.icon_value} name={c.name} className="text-[40px]" /></div>
              )}
              <div className="p-3">
                <p className="truncate text-[14px] font-bold group-hover:text-brand-600">{c.name}</p>
                <p className="text-[12px] text-muted">{c.product_count ?? 0} {t('items')}</p>
              </div>
            </Link>
          ))}
        </div>
        {Boolean(brands.data?.length) && (
          <section className="mt-8">
            <SectionHeader title={t('popularBrands')} />
            <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
              {brands.data!.map((b) => (
                <Link key={b.id} to={`/products?brand=${b.slug}`} className="grid h-16 w-24 shrink-0 place-items-center rounded-2xl bg-surface px-3 shadow-[var(--shadow-soft)] hover:ring-2 hover:ring-brand-200">
                  {b.logo ? <img src={img(b.logo, 'thumb')} alt={b.name} className="max-h-8 max-w-full object-contain" loading="lazy" /> : <span className="text-[13px] font-extrabold text-ink-2">{b.name}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
