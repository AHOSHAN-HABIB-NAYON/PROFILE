import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Download, Truck } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { Button, Pagination, Select, Tabs, toast } from '../../components/ui';
import { DataTable, PageHeader, Panel, RiskBadge, SearchBox, STATUS_LABELS, StatusBadge, useCan } from '../components/kit';

interface BulkResult { done?: number[]; failed?: Array<{ id: number; error: string }>; results?: Array<{ ok: boolean; message: string }> }
interface Row { id: number; order_no: string; customer_name: string; phone: string; district: string; upazila: string; status: string; total: number; item_count: number; risk_level: string; risk_score: number; consignment_id: string | null; created_at: string; courier_name: string | null; items_summary: string | null }

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const status = params.get('status') ?? 'all';
  const page = Number(params.get('page') ?? 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const filters = { status, page, q: debounced, risk: params.get('risk') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const { data, isLoading } = useQuery({ queryKey: ['orders', filters], queryFn: () => api.get<{ items: Row[]; total: number; limit: number; counts: Record<string, number> }>(`/api/admin/orders${qs(filters)}`), placeholderData: (p) => p });
  const couriers = useQuery({ queryKey: ['couriers-enabled'], queryFn: () => api.get<Array<{ id: number; name: string; is_default: number }>>('/api/admin/couriers/enabled') });
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v && v !== 'all') p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p, { replace: true }); };
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  const bulk = useMutation({
    mutationFn: (body: { kind: 'status' | 'courier'; value: string }): Promise<BulkResult> => body.kind === 'status'
      ? api.post<BulkResult>('/api/admin/orders/bulk-status', { ids: [...selected], status: body.value })
      : api.post<BulkResult>('/api/admin/orders/bulk-courier', { ids: [...selected], courierId: Number(body.value) || null }),
    onSuccess: (r) => {
      if (r.done) toast.success(`${r.done.length} updated${r.failed?.length ? `, ${r.failed.length} failed` : ''}`);
      else if (r.results) { const ok = r.results.filter((x) => x.ok).length; toast.success(`${ok} sent to courier${r.results.length - ok ? `, ${r.results.length - ok} failed` : ''}`); }
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = data?.items ?? [];
    const csv = [['Order', 'Date', 'Customer', 'Phone', 'District', 'Upazila', 'Items', 'Total', 'Status', 'Risk', 'Consignment'], ...rows.map((r) => [r.order_no, r.created_at, r.customer_name, r.phone, r.district, r.upazila, r.items_summary ?? '', r.total, r.status, r.risk_level, r.consignment_id ?? ''])]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div>
      <PageHeader title="Orders" subtitle={`${data?.total ?? 0} orders`} actions={<Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={exportCsv}>Export CSV</Button>} />
      <Tabs value={status} onChange={(v) => set('status', v)} className="mb-3 -mx-1" tabs={[{ value: 'all', label: `All (${all})` }, ...Object.entries(STATUS_LABELS).map(([k, label]) => ({ value: k, label: `${label} (${counts[k] ?? 0})` }))]} />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <SearchBox value={q} onChange={(v) => { setQ(v); }} placeholder="Order ID, phone, name, consignment…" />
          <Select value={params.get('risk') ?? ''} onChange={(e) => set('risk', e.target.value)} className="!h-10 !w-auto !rounded-full !py-0 !text-[13px]"><option value="">All risk</option><option value="HIGH">High risk</option><option value="MEDIUM">Medium risk</option><option value="LOW">Low risk</option></Select>
          <input type="date" value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} className="input !h-10 !w-auto !rounded-full !py-0 !text-[13px]" aria-label="From" />
          <input type="date" value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} className="input !h-10 !w-auto !rounded-full !py-0 !text-[13px]" aria-label="To" />
        </div>
        {selected.size > 0 && can('orders.manage') && (
          <div className="flex flex-wrap items-center gap-2 border-y border-line bg-brand-50/50 px-4 py-2.5 text-[13px]">
            <span className="font-semibold">{selected.size} selected</span>
            <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="!h-9 !w-auto !py-0 !text-[13px]"><option value="">Change status…</option>{Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Button size="sm" disabled={!bulkStatus} loading={bulk.isPending} onClick={() => bulk.mutate({ kind: 'status', value: bulkStatus })}>Apply</Button>
            {can('courier.send') && couriers.data?.map((c) => <Button key={c.id} size="sm" variant="outline" icon={<Truck className="size-4" />} loading={bulk.isPending} onClick={() => bulk.mutate({ kind: 'courier', value: String(c.id) })}>Send to {c.name}</Button>)}
          </div>
        )}
        <DataTable
          rows={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/admin/orders/${r.id}`)}
          selectable={can('orders.manage')}
          selected={selected}
          onSelect={setSelected}
          empty="No orders match these filters."
          columns={[
            { key: 'order', label: 'Order', render: (r) => <span><span className="font-bold">#{r.order_no}</span><span className="block text-[11.5px] font-normal text-muted">{dateTime(r.created_at)}</span></span> },
            { key: 'customer', label: 'Customer', render: (r) => <span><span className="font-semibold">{r.customer_name}</span><span className="block text-[12px] text-muted">{r.phone}</span></span> },
            { key: 'items', label: 'Items', hideOnMobile: true, render: (r) => <span className="line-clamp-2 max-w-[260px] text-[12.5px] text-ink-2">{r.items_summary}</span> },
            { key: 'area', label: 'Area', render: (r) => <span className="text-[12.5px]">{r.upazila}, {r.district}</span> },
            { key: 'total', label: 'Total', render: (r) => <span className="font-bold tabular-nums">{money(r.total)}</span> },
            { key: 'risk', label: 'Risk', render: (r) => <RiskBadge level={r.risk_level} /> },
            { key: 'courier', label: 'Courier', hideOnMobile: true, render: (r) => r.courier_name ? <span className="text-[12px]">{r.courier_name}<span className="block text-muted">{r.consignment_id}</span></span> : <span className="text-muted">—</span> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
        <Pagination page={page} total={data?.total ?? 0} limit={data?.limit ?? 25} onChange={(p) => set('page', String(p))} />
      </Panel>
    </div>
  );
}
