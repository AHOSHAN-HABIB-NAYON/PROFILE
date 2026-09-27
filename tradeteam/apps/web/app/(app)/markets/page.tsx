'use client';
import { MarketList } from '@/components/market/market-list';
import { PageHeader } from '@/components/layout/app-shell';
import { useMe } from '@/lib/hooks';

export default function MarketsPage() {
  const me = useMe().data;
  return (
    <div>
      <PageHeader
        title="Markets"
        subtitle="Every pair available from the connected market-data provider, live."
      />
      <MarketList authed={Boolean(me)} initialCategory={me ? 'USDT' : 'USDT'} />
    </div>
  );
}
