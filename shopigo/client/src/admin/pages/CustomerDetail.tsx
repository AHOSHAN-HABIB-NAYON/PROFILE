import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Ban, Phone, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { Button, PageSpinner, Textarea, toast } from '../../components/ui';
import { PageHeader, Panel, RiskBadge, StatusBadge, useCan } from '../components/kit';

interface Detail { id: number; phone: string; name: string; email: string | null; district: string | null; upazila: string | null; address: string | null; total_orders: number; delivered_orders: number; cancelled_orders: number; returned_orders: number; total_spent: number; is_blocked: number; notes: string | null; created_at: string; orders: Array<{ id: number; order_no: string; status: string; total: number; created_at: string; risk_level: string }>; addresses: Array<{ id: number; name: string; district: string; upazila: string; address: string; last_used_at: string }>; byCourier: Array<{ name: string; total: number; delivered: number; returned: number; cancelled: number }> }

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const can = useCan();
  const { data: c } = useQuery({ queryKey: ['admin-customer', id], queryFn: () => api.get<Detail>(`/api/admin/customers/${id}`) });
  const ext = useQuery({ queryKey: ['admin-customer-ext', id], queryFn: () => api.get<{ total: number; delivered: number; cancelled: number; successRatio: number } | null>(`/api/admin/customers/${id}/courier-history`) });
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(c?.notes ?? ''), [c?.notes]);
  const upd = useMutation({ mutationFn: (body: Record<string, unknown>) => api.put(`/api/admin/customers/${id}`, body), onSuccess: () => { toast.success('Saved'); void qc.invalidateQueries({ queryKey: ['admin-customer', id] }); } });
  if (!c) return <PageSpinner />;
  const finished = c.delivered_orders + c.cancelled_orders + c.returned_orders;
  return (
    <div>
      <PageHeader back={<Link to="/admin/customers" className="mb-1 inline-flex items-center gap-1 text-[13px] font-semibold text-muted"><ArrowLeft className="size-4" />Customers</Link>} title={c.name} subtitle={`${c.phone} · customer since ${dateTime(c.created_at)}`}
        actions={<><a href={`tel:${c.phone}`}><Button size="sm" variant="soft" icon={<Phone className="size-4" />}>Call</Button></a>{can('customers.manage') && <Button size="sm" variant={c.is_blocked ? 'success' : 'danger'} icon={c.is_blocked ? <ShieldCheck className="size-4" /> : <Ban className="size-4" />} onClick={() => upd.mutate({ is_blocked: !c.is_blocked })}>{c.is_blocked ? 'Unblock' : 'Block customer'}</Button>}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Orders', c.total_orders], ['Delivered', c.delivered_orders], ['Cancelled', c.cancelled_orders], ['Returned', c.returned_orders], ['Spent', money(c.total_spent)]].map(([l, v]) => <div key={String(l)} className="card p-4"><p className="text-[12px] text-muted">{l}</p><p className="text-[20px] font-extrabold">{v}</p></div>)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Orders" pad={false}>
          <ul className="divide-y divide-line">{c.orders.map((o) => <li key={o.id}><Link to={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-soft/60"><span className="flex-1"><b>#{o.order_no}</b><span className="block text-[12px] text-muted">{dateTime(o.created_at)}</span></span>{o.risk_level !== 'LOW' && <RiskBadge level={o.risk_level} />}<StatusBadge status={o.status} /><b className="w-24 text-right">{money(o.total)}</b></Link></li>)}</ul>
        </Panel>
        <div className="space-y-4">
          <Panel title="Courier report">
            <p className="text-[13.5px]">Success rate in this store: <b>{finished ? Math.round((c.delivered_orders / finished) * 100) : 0}%</b></p>
            <ul className="mt-2 space-y-1 text-[13px]">{c.byCourier.map((b) => <li key={b.name} className="flex justify-between"><span>{b.name}</span><span>{b.delivered}/{b.total} delivered · {b.returned} returned</span></li>)}</ul>
            {ext.data && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-[13px] text-blue-900">All couriers (BD Courier): <b>{ext.data.successRatio}%</b> success — {ext.data.delivered}/{ext.data.total} delivered, {ext.data.cancelled} cancelled</p>}
          </Panel>
          <Panel title="Addresses">{c.addresses.map((a) => <p key={a.id} className="border-b border-line py-2 text-[13px] last:border-0"><b>{a.name}</b> — {a.address}, {a.upazila}, {a.district}</p>)}</Panel>
          <Panel title="Private notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /><Button className="mt-2" size="sm" disabled={!can('customers.manage')} onClick={() => upd.mutate({ notes })}>Save note</Button></Panel>
        </div>
      </div>
    </div>
  );
}
