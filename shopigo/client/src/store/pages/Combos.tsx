import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { api } from '../../lib/api';
import { useT } from '../../lib/i18n';
import type { Combo } from '../../lib/types';
import { Empty, Skeleton } from '../../components/ui';
import { CartButton, TopBar } from '../components/chrome';
import { ComboCard } from './Home';

export default function Combos() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ['combos'], queryFn: () => api.get<Combo[]>('/api/public/combos') });
  return (
    <div>
      <TopBar title={t('combos')} right={<CartButton />} />
      <div className="px-4 md:px-0 md:pt-6">
        <h1 className="mb-4 hidden text-[26px] font-extrabold md:block">{t('combos')}</h1>
        {isLoading ? <Skeleton className="h-44" /> : !data?.length ? <Empty icon={<Gift className="size-9" />} title={t('noProducts')} /> : <div className="grid gap-3 md:grid-cols-2">{data.map((c) => <ComboCard key={c.id} c={c} />)}</div>}
      </div>
    </div>
  );
}
