import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Star, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, Tabs, toast } from '../../components/ui';
import { DataTable, PageHeader, Panel } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface R { id: number; customer_name: string; phone: string | null; rating: number; comment: string | null; is_approved: number; created_at: string; product_name: string; product_id: number }

export default function Reviews() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'approved' | ''>('pending');
  const { data, isLoading } = useQuery({ queryKey: ['admin-reviews', status], queryFn: () => api.get<{ items: R[] }>(`/api/admin/reviews?status=${status}`) });
  const act = useMutation({ mutationFn: ({ id, action }: { id: number; action: string }) => api.post(`/api/admin/reviews/${id}`, { action }), onSuccess: () => { toast.success('Updated'); void qc.invalidateQueries({ queryKey: ['admin-reviews'] }); } });
  return (
    <div>
      <PageHeader title="Reviews" />
      <Tabs value={status} onChange={setStatus} className="mb-3" tabs={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: '', label: 'All' }]} />
      <Panel pad={false}>
        <DataTable rows={data?.items ?? []} loading={isLoading} rowKey={(r) => r.id} columns={[
          { key: 'p', label: 'Product', render: (r) => <span className="font-semibold">{r.product_name}</span> },
          { key: 'r', label: 'Review', render: (r) => <span><span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={i <= r.rating ? 'size-3.5 fill-amber-400 text-amber-400' : 'size-3.5 text-line'} />)}</span><span className="block max-w-md text-[13px]">{r.comment}</span><span className="text-[12px] text-muted">{r.customer_name} · {dateTime(r.created_at)}</span></span> },
          { key: 's', label: 'Status', render: (r) => <Badge tone={r.is_approved ? 'green' : 'amber'}>{r.is_approved ? 'Approved' : 'Pending'}</Badge> },
          { key: 'a', label: '', render: (r) => <span className="flex gap-1">{!r.is_approved && <button onClick={() => act.mutate({ id: r.id, action: 'approve' })} className="grid size-8 place-items-center rounded-lg text-green-600 hover:bg-green-50" aria-label="Approve"><Check className="size-4" /></button>}{Boolean(r.is_approved) && <button onClick={() => act.mutate({ id: r.id, action: 'reject' })} className="grid size-8 place-items-center rounded-lg hover:bg-soft" aria-label="Unapprove"><X className="size-4" /></button>}<button onClick={() => act.mutate({ id: r.id, action: 'delete' })} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button></span> },
        ]} />
      </Panel>
      <Panel title="Review settings" className="mt-4"><SettingsForm keys={['reviews_enabled', 'reviews_auto_approve']} /></Panel>
    </div>
  );
}
