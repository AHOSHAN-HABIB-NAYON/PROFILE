import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, qs } from '../../lib/api';
import { dateOnly, money } from '../../lib/format';
import { Badge, Pagination, Select } from '../../components/ui';
import { DataTable, PageHeader, Panel, SearchBox } from '../components/kit';

interface C { id: number; phone: string; name: string; district: string | null; total_orders: number; delivered_orders: number; cancelled_orders: number; returned_orders: number; total_spent: number; is_blocked: number; last_order_at: string | null }

export default function Customers() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, isLoading } = useQuery({ queryKey: ['admin-customers', debounced, sort, page], queryFn: () => api.get<{ items: C[]; total: number; limit: number }>(`/api/admin/customers${qs({ q: debounced, sort, page })}`), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Customers" subtitle={`${data?.total ?? 0} customers · identified by phone, no account needed`} />
      <Panel pad={false}>
        <div className="flex flex-wrap gap-2 p-4">
          <SearchBox value={q} onChange={setQ} placeholder="Phone or name…" />
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="!h-10 !w-auto !rounded-full !py-0 !text-[13px]"><option value="recent">Recent</option><option value="orders">Most orders</option><option value="spent">Top spenders</option></Select>
        </div>
        <DataTable rows={data?.items ?? []} loading={isLoading} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/admin/customers/${r.id}`)} columns={[
          { key: 'n', label: 'Customer', render: (c) => <span><span className="font-semibold">{c.name}</span><span className="block text-[12px] text-muted">{c.phone} · {c.district}</span></span> },
          { key: 'o', label: 'Orders', render: (c) => c.total_orders },
          { key: 'd', label: 'Delivered / Cancelled / Returned', render: (c) => <span className="tabular-nums"><span className="text-green-700">{c.delivered_orders}</span> / <span className="text-danger">{c.cancelled_orders}</span> / <span className="text-amber-700">{c.returned_orders}</span></span> },
          { key: 's', label: 'Spent', render: (c) => <b>{money(c.total_spent)}</b> },
          { key: 'l', label: 'Last order', render: (c) => dateOnly(c.last_order_at) },
          { key: 'b', label: 'Status', render: (c) => (c.is_blocked ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">OK</Badge>) },
        ]} />
        <Pagination page={page} total={data?.total ?? 0} limit={data?.limit ?? 25} onChange={setPage} />
      </Panel>
    </div>
  );
}
