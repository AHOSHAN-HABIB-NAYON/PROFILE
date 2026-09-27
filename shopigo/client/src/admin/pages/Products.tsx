import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Copy, Plus, Star, Truck } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { cx, money, num } from '../../lib/format';
import { Button, Pagination, Select, Tabs, toast } from '../../components/ui';
import { DataTable, PageHeader, Panel, SearchBox, Thumb, useCan } from '../components/kit';

interface Row { id: number; name: string; slug: string; sku: string | null; price: number; sale_price: number | null; stock: number; low_stock_threshold: number; status: string; is_featured: number; free_delivery: number; sold_count: number; view_count: number; has_variants: number; category_name: string | null; image: string | null }

export default function Products() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const filters = { q: debounced, status: params.get('status') ?? '', stock: params.get('stock') ?? '', category: params.get('category') ?? '', sort: params.get('sort') ?? '', page: Number(params.get('page') ?? 1) };
  const { data, isLoading } = useQuery({ queryKey: ['admin-products', filters], queryFn: () => api.get<{ items: Row[]; total: number; limit: number }>(`/api/admin/products${qs(filters)}`), placeholderData: (p) => p });
  const cats = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get<Array<{ id: number; name: string; parent_id: number | null }>>('/api/admin/catalog/categories') });
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p, { replace: true }); };
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/admin/products/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-products'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const dup = useMutation({ mutationFn: (id: number) => api.post<{ id: number }>(`/api/admin/products/${id}/duplicate`), onSuccess: (r) => { toast.success('Duplicated as draft'); navigate(`/admin/products/${r.id}`); } });

  return (
    <div>
      <PageHeader title="Products" subtitle={`${data?.total ?? 0} products`} actions={can('products.manage') && <Link to="/admin/products/new"><Button icon={<Plus className="size-4" />}>Add product</Button></Link>} />
      <Tabs value={filters.stock || filters.status || 'all'} onChange={(v) => { const p = new URLSearchParams(); if (v === 'low' || v === 'out') p.set('stock', v); else if (v !== 'all') p.set('status', v); setParams(p, { replace: true }); }} className="mb-3 -mx-1" tabs={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} />
      <Panel pad={false}>
        <div className="flex flex-wrap gap-2 p-4">
          <SearchBox value={q} onChange={setQ} placeholder="Search name or SKU…" />
          <Select value={filters.category} onChange={(e) => set('category', e.target.value)} className="!h-10 !w-auto !rounded-full !py-0 !text-[13px]"><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{c.name}</option>)}</Select>
          <Select value={filters.sort} onChange={(e) => set('sort', e.target.value)} className="!h-10 !w-auto !rounded-full !py-0 !text-[13px]"><option value="">Newest</option><option value="sold">Best selling</option><option value="views">Most viewed</option><option value="stock">Stock</option><option value="name">Name</option></Select>
        </div>
        <DataTable
          rows={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/admin/products/${r.id}`)}
          columns={[
            { key: 'p', label: 'Product', render: (r) => <span className="flex items-center gap-3"><Thumb path={r.image} /><span className="min-w-0"><span className="line-clamp-1 font-semibold">{r.name}</span><span className="block text-[12px] text-muted">{r.sku ?? `#${r.id}`} · {r.category_name ?? 'Uncategorised'}</span></span></span> },
            { key: 'price', label: 'Price', render: (r) => <span className="tabular-nums"><b>{money(r.sale_price && r.sale_price < r.price ? r.sale_price : r.price)}</b>{r.sale_price && r.sale_price < r.price ? <span className="ml-1 text-[12px] text-muted line-through">{money(r.price)}</span> : null}</span> },
            { key: 'stock', label: 'Stock', render: (r) => <span className={cx('font-bold tabular-nums', r.stock <= 0 ? 'text-danger' : r.stock <= r.low_stock_threshold ? 'text-amber-600' : '')}>{r.stock}{r.has_variants ? <span className="ml-1 text-[11px] font-normal text-muted">(variants)</span> : ''}</span> },
            { key: 'sold', label: 'Sold / Views', hideOnMobile: true, render: (r) => <span className="text-[12.5px] text-muted tabular-nums">{num(r.sold_count)} / {num(r.view_count)}</span> },
            { key: 'flags', label: 'Flags', hideOnMobile: true, render: (r) => (
              <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button title="Featured" disabled={!can('products.manage')} onClick={() => patch.mutate({ id: r.id, body: { is_featured: !r.is_featured } })} className={cx('grid size-8 place-items-center rounded-lg', r.is_featured ? 'bg-amber-50 text-amber-500' : 'text-muted hover:bg-soft')}><Star className={cx('size-4', Boolean(r.is_featured) && 'fill-current')} /></button>
                <button title="Free delivery" disabled={!can('products.manage')} onClick={() => patch.mutate({ id: r.id, body: { free_delivery: !r.free_delivery } })} className={cx('grid size-8 place-items-center rounded-lg', r.free_delivery ? 'bg-green-50 text-green-600' : 'text-muted hover:bg-soft')}><Truck className="size-4" /></button>
                {can('products.manage') && <button title="Duplicate" onClick={() => dup.mutate(r.id)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-soft"><Copy className="size-4" /></button>}
              </span>
            ) },
            { key: 'status', label: 'Status', render: (r) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Select value={r.status} disabled={!can('products.manage')} onChange={(e) => patch.mutate({ id: r.id, body: { status: e.target.value } })} className={cx('!h-8 !w-auto !rounded-full !py-0 !pr-8 !pl-3 !text-[12px] font-bold', r.status === 'active' ? '!bg-green-50 !text-green-700' : r.status === 'draft' ? '!bg-amber-50 !text-amber-700' : '!bg-soft')}>
                  <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
                </Select>
              </span>
            ) },
          ]}
        />
        <Pagination page={filters.page} total={data?.total ?? 0} limit={data?.limit ?? 25} onChange={(p) => set('page', String(p))} />
      </Panel>
    </div>
  );
}
