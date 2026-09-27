import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Ban, Check, ClipboardCheck, Globe, MapPin, MonitorSmartphone, Pencil, Phone, Plus, Printer, RefreshCw, Send, Trash2, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { cx, dateTime, money } from '../../lib/format';
import { Button, Field, Input, PageSpinner, Select, Sheet, Textarea, toast, useConfirm } from '../../components/ui';
import { FaIcon } from '../../components/CategoryIcon';
import { PageHeader, Panel, ProductPicker, RiskBadge, STATUS_LABELS, StatusBadge, Thumb, useCan, type LookupProduct } from '../components/kit';

interface Item { id: number; product_id: number | null; variant_id: number | null; combo_id: number | null; name: string; sku: string | null; size: string | null; color: string | null; image: string | null; unit_price: number; quantity: number; line_total: number }
interface OrderFull {
  id: number; order_no: string; customer_id: number | null; customer_name: string; phone: string; district: string; upazila: string; address: string; note: string | null; admin_note: string | null;
  status: string; subtotal: number; discount: number; delivery_charge: number; total: number; coupon_code: string | null; item_count: number;
  ip: string | null; ip_location: string | null; user_agent: string | null; device_info: { browser?: string; os?: string; device?: string; type?: string; language?: string };
  risk_score: number; risk_level: string; risk_reasons: string[]; courier_id: number | null; consignment_id: string | null; tracking_code: string | null; courier_status: string | null;
  created_at: string; deleted_at: string | null; items: Item[];
  history: Array<{ id: number; from_status: string | null; to_status: string; note: string | null; created_at: string; admin_name: string | null }>;
  shipments: Array<{ id: number; consignment_id: string | null; tracking_code: string | null; status: string; cod_amount: number; error: string | null; response_payload: unknown; created_at: string; courier_name: string }>;
  customer: { id: number; total_orders: number; delivered_orders: number; cancelled_orders: number; returned_orders: number; total_spent: number } | null;
  courier: { id: number; name: string } | null;
  otherOrdersFromIp: number;
  previousOrders: Array<{ id: number; order_no: string; status: string; total: number; created_at: string }>;
  whatsappNumber: string;
}

export default function OrderDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const { data: o, isLoading } = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderFull>(`/api/admin/orders/${id}`) });
  const couriers = useQuery({ queryKey: ['couriers-enabled'], queryFn: () => api.get<Array<{ id: number; name: string; is_default: number }>>('/api/admin/couriers/enabled') });
  const history = useQuery({ queryKey: ['order-courier-history', id], queryFn: () => api.get<{ local: { total: number; delivered: number; cancelled: number; returned: number }; external: { total: number; delivered: number; cancelled: number; successRatio: number; byCourier: Record<string, { total: number; delivered: number; cancelled: number }> } | null }>(`/api/admin/orders/${id}/courier-history`), enabled: Boolean(o) });
  const [editing, setEditing] = useState(false);
  const [courierSheet, setCourierSheet] = useState(false);
  const [courierId, setCourierId] = useState<string>('');
  const [statusNote, setStatusNote] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['order', id] }); void qc.invalidateQueries({ queryKey: ['orders'] }); };

  const setStatus = useMutation({
    mutationFn: (status: string) => api.post(`/api/admin/orders/${id}/status`, { status, note: statusNote || null }),
    onSuccess: () => { toast.success('Status updated'); setStatusNote(''); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => api.post<{ courier: string; consignmentId: string; trackingCode: string; status: string }>(`/api/admin/orders/${id}/courier`, { courierId: Number(courierId) || null }),
    onSuccess: (r) => { toast.success(`Sent to ${r.courier} · ${r.consignmentId}`); setCourierSheet(false); refresh(); },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });
  const sync = useMutation({ mutationFn: () => api.post<{ status: string }>(`/api/admin/orders/${id}/courier/sync`), onSuccess: (r) => { toast.success(`Courier status: ${r.status}`); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: () => api.del(`/api/admin/orders/${id}`), onSuccess: () => { toast.success('Moved to trash'); navigate('/admin/orders'); } });

  if (isLoading || !o) return <PageSpinner />;
  const locked = Boolean(o.consignment_id) || ['delivered', 'cancelled', 'returned'].includes(o.status);
  const intlPhone = o.phone.replace(/^0/, '880');
  const quick = [
    { status: 'confirmed', label: 'Confirm', icon: <Check className="size-4" />, show: ['new', 'pending'].includes(o.status) },
    { status: 'processing', label: 'Processing', icon: <ClipboardCheck className="size-4" />, show: o.status === 'confirmed' },
    { status: 'cancelled', label: 'Cancel', icon: <Ban className="size-4" />, show: !['delivered', 'cancelled', 'returned'].includes(o.status), danger: true },
  ];

  return (
    <div>
      <PageHeader
        back={<Link to="/admin/orders" className="mb-1 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-brand-600"><ArrowLeft className="size-4" />Orders</Link>}
        title={<span className="flex flex-wrap items-center gap-2">#{o.order_no} <StatusBadge status={o.status} /> <RiskBadge level={o.risk_level} score={o.risk_score} /></span>}
        subtitle={`Placed ${dateTime(o.created_at)} · Cash on Delivery`}
        actions={
          <>
            <a href={`tel:${o.phone}`}><Button size="sm" variant="soft" icon={<Phone className="size-4" />}>Call</Button></a>
            <a href={`https://wa.me/${intlPhone}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${o.customer_name}, আপনার অর্ডার #${o.order_no} সম্পর্কে যোগাযোগ করছি।`)}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="soft" icon={<FaIcon name="fa-brands fa-whatsapp" className="text-[15px]" />}>WhatsApp</Button></a>
            <Link to={`/admin/orders/${o.id}/print`} target="_blank"><Button size="sm" variant="soft" icon={<Printer className="size-4" />}>Print</Button></Link>
            {can('orders.delete') && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm('Move this order to trash?', { text: 'You can restore it from Trash later.', danger: true })) del.mutate(); }}>Delete</Button>}
          </>
        }
      />
      {o.deleted_at && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-[13px] font-semibold text-danger">This order is in the trash. Restore it from System → Trash.</p>}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title={`Items (${o.item_count})`} actions={can('orders.manage') && !locked && <Button size="sm" variant="soft" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit order</Button>}>
            <ul className="divide-y divide-line">
              {o.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  <Thumb path={it.image} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{it.product_id ? <Link to={`/admin/products/${it.product_id}`} className="hover:text-brand-600">{it.name}</Link> : it.name}{it.combo_id && <span className="chip ml-2 bg-violet-50 text-violet-700">Combo</span>}</p>
                    <p className="text-[12px] text-muted">{[it.sku, it.color, it.size && `Size ${it.size}`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-[13px] text-muted tabular-nums">{money(it.unit_price)} × {it.quantity}</span>
                  <span className="w-24 text-right font-bold tabular-nums">{money(it.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(o.subtotal)}</dd></div>
              {o.discount > 0 && <div className="flex justify-between text-danger"><dt>Discount {o.coupon_code && `(${o.coupon_code})`}</dt><dd className="tabular-nums">- {money(o.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{money(o.delivery_charge)}</dd></div>
              <div className="flex justify-between pt-1 text-[16px] font-extrabold"><dt>Total (COD)</dt><dd className="tabular-nums">{money(o.total)}</dd></div>
            </dl>
          </Panel>

          <Panel title="Courier" actions={o.consignment_id && <Button size="sm" variant="ghost" loading={sync.isPending} icon={<RefreshCw className="size-4" />} onClick={() => sync.mutate()}>Sync status</Button>}>
            {o.consignment_id ? (
              <dl className="grid grid-cols-2 gap-3 text-[13.5px] sm:grid-cols-4">
                <div><dt className="text-muted">Courier</dt><dd className="font-semibold">{o.courier?.name}</dd></div>
                <div><dt className="text-muted">Consignment ID</dt><dd className="font-semibold">{o.consignment_id}</dd></div>
                <div><dt className="text-muted">Tracking</dt><dd className="font-semibold">{o.tracking_code ?? '—'}</dd></div>
                <div><dt className="text-muted">Courier status</dt><dd className="font-semibold">{o.courier_status ?? '—'}</dd></div>
              </dl>
            ) : can('courier.send') && !['cancelled', 'returned', 'delivered'].includes(o.status) ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-[13.5px] text-muted">Review the address and items, then book the parcel in one click.</p>
                <Button icon={<Truck className="size-4" />} onClick={() => { setCourierId(String(couriers.data?.find((c) => c.is_default)?.id ?? couriers.data?.[0]?.id ?? '')); setCourierSheet(true); }} disabled={!couriers.data?.length}>Send to Courier</Button>
                {!couriers.data?.length && <p className="w-full text-[12.5px] text-amber-700">No courier is enabled. Configure one in Couriers.</p>}
              </div>
            ) : <p className="text-[13.5px] text-muted">Not sent to a courier.</p>}
            {o.shipments.length > 0 && (
              <details className="mt-4 text-[12.5px]">
                <summary className="cursor-pointer font-semibold text-muted">API log ({o.shipments.length})</summary>
                <ul className="mt-2 space-y-2">
                  {o.shipments.map((s) => (
                    <li key={s.id} className={cx('rounded-xl p-3', s.error ? 'bg-red-50' : 'bg-soft')}>
                      <p className="font-semibold">{s.courier_name} · {s.status} · {dateTime(s.created_at)}</p>
                      {s.error && <p className="text-danger">{s.error}</p>}
                      {s.response_payload != null && <pre className="mt-1 max-h-40 overflow-auto text-[11px] whitespace-pre-wrap">{JSON.stringify(s.response_payload, null, 2)}</pre>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Panel>

          <Panel title="Timeline">
            <ol className="space-y-3">
              {o.history.map((h) => (
                <li key={h.id} className="flex gap-3 text-[13.5px]">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-400" />
                  <div>
                    <p><StatusBadge status={h.to_status} /> {h.note && <span className="ml-1 text-ink-2">{h.note}</span>}</p>
                    <p className="text-[12px] text-muted">{dateTime(h.created_at)} {h.admin_name ? `· ${h.admin_name}` : '· System'}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          {can('orders.manage') && (
            <Panel title="Update status">
              <div className="mb-3 flex flex-wrap gap-2">
                {quick.filter((b) => b.show).map((b) => <Button key={b.status} size="sm" variant={b.danger ? 'ghost' : 'primary'} className={b.danger ? '!text-danger' : ''} icon={b.icon} loading={setStatus.isPending && setStatus.variables === b.status} onClick={async () => { if (!b.danger || (await confirm('Cancel this order?', { text: 'Stock will be returned to inventory.', danger: true }))) setStatus.mutate(b.status); }}>{b.label}</Button>)}
              </div>
              <div className="flex gap-2">
                <Select value={o.status} onChange={(e) => setStatus.mutate(e.target.value)} className="!h-10 !py-0">{Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              </div>
              <Input className="mt-2 !h-10 !py-0 !text-[13px]" placeholder="Optional note for the timeline" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
            </Panel>
          )}

          <Panel title="Customer" actions={o.customer_id && <Link to={`/admin/customers/${o.customer_id}`} className="text-[13px] font-semibold text-brand-600">Profile</Link>}>
            <p className="text-[15px] font-bold">{o.customer_name}</p>
            <p className="text-[13.5px]"><a href={`tel:${o.phone}`} className="text-brand-600">{o.phone}</a></p>
            <p className="mt-2 flex gap-2 text-[13.5px] text-ink-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" />{o.address}, {o.upazila}, {o.district}</p>
            {o.note && <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-[13px] text-amber-900">📝 {o.note}</p>}
            {o.admin_note && <p className="mt-2 rounded-xl bg-soft p-2.5 text-[13px]">Admin: {o.admin_note}</p>}
            {history.data && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[12px]">
                {[['Orders', history.data.local.total], ['Delivered', history.data.local.delivered], ['Cancelled', history.data.local.cancelled], ['Returned', history.data.local.returned]].map(([l, v]) => <div key={l} className="rounded-xl bg-soft py-2"><p className="text-[16px] font-extrabold">{Number(v ?? 0)}</p><p className="text-muted">{l}</p></div>)}
              </div>
            )}
            {history.data?.external && (
              <div className="mt-3 rounded-xl bg-blue-50 p-3 text-[12.5px] text-blue-900">
                <p className="font-bold">Courier history (all couriers): {history.data.external.successRatio}% success</p>
                <p>{history.data.external.delivered} delivered / {history.data.external.total} parcels · {history.data.external.cancelled} cancelled</p>
              </div>
            )}
          </Panel>

          <Panel title="Risk & device">
            <div className="mb-2 flex items-center gap-2"><RiskBadge level={o.risk_level} score={o.risk_score} /></div>
            {o.risk_reasons.length > 0 ? <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-ink-2">{o.risk_reasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mb-3 text-[13px] text-muted">No risk signals.</p>}
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex gap-2"><Globe className="size-4 shrink-0 text-muted" /><span>{o.ip ?? '—'} {o.ip_location && <span className="text-muted">· {o.ip_location}</span>} {o.otherOrdersFromIp > 0 && <span className="chip ml-1 bg-amber-50 text-amber-800">{o.otherOrdersFromIp} other orders</span>}</span></div>
              <div className="flex gap-2"><MonitorSmartphone className="size-4 shrink-0 text-muted" /><span>{[o.device_info.device, o.device_info.os, o.device_info.browser].filter(Boolean).join(' · ') || '—'} {o.device_info.type && <span className="text-muted">({o.device_info.type})</span>}</span></div>
            </dl>
          </Panel>

          {o.previousOrders.length > 0 && (
            <Panel title="Other orders from this phone">
              <ul className="space-y-2 text-[13px]">
                {o.previousOrders.map((p) => <li key={p.id}><Link to={`/admin/orders/${p.id}`} className="flex items-center justify-between gap-2 hover:text-brand-600"><span>#{p.order_no}</span><StatusBadge status={p.status} /><span className="font-semibold">{money(p.total)}</span></Link></li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <Sheet open={courierSheet} onClose={() => setCourierSheet(false)} title="Send to courier">
        <div className="space-y-3 text-[13.5px]">
          <Field label="Courier"><Select value={courierId} onChange={(e) => setCourierId(e.target.value)}>{couriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_default ? ' (default)' : ''}</option>)}</Select></Field>
          <div className="rounded-2xl bg-soft p-3">
            <p className="font-semibold">{o.customer_name} · {o.phone}</p>
            <p className="text-ink-2">{o.address}, {o.upazila}, {o.district}</p>
            <p className="mt-1 font-bold">COD amount: {money(o.total)}</p>
          </div>
          <Button block size="lg" icon={<Send className="size-4" />} loading={send.isPending} onClick={() => send.mutate()}>Book parcel</Button>
        </div>
      </Sheet>
      {editing && <EditOrder o={o} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {dialog}
    </div>
  );
}

function EditOrder({ o, onClose, onSaved }: { o: OrderFull; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ customer_name: o.customer_name, phone: o.phone, district: o.district, upazila: o.upazila, address: o.address, note: o.note ?? '', admin_note: o.admin_note ?? '', delivery_charge: String(o.delivery_charge), discount: String(o.discount) });
  const [items, setItems] = useState(o.items.map((i) => ({ id: i.id as number | undefined, productId: i.product_id, variantId: i.variant_id, name: i.name, size: i.size, unitPrice: String(i.unit_price), qty: String(i.quantity), combo: Boolean(i.combo_id) })));
  const [picker, setPicker] = useState(false);
  const hasCombo = items.some((i) => i.combo);
  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.unitPrice) * Number(i.qty), 0), [items]);
  const save = useMutation({
    mutationFn: () => api.put(`/api/admin/orders/${o.id}`, {
      ...f, delivery_charge: Number(f.delivery_charge), discount: Number(f.discount), note: f.note || null, admin_note: f.admin_note || null,
      ...(hasCombo ? {} : { items: items.map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, name: i.name, size: i.size, unitPrice: Number(i.unitPrice), qty: Number(i.qty) })) }),
    }),
    onSuccess: () => { toast.success('Order updated'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const onPick = (p: LookupProduct, variantId?: number | null) => {
    const v = p.variants.find((x) => x.id === variantId);
    setItems([...items, { id: undefined, productId: p.id, variantId: variantId ?? null, name: p.name, size: v?.size ?? null, unitPrice: String(v?.sale_price ?? v?.price ?? p.sale_price ?? p.price), qty: '1', combo: false }]);
  };
  return (
    <Sheet open onClose={onClose} title={`Edit #${o.order_no}`} wide footer={<div className="flex items-center justify-between gap-3"><span className="text-[14px]">New total: <b>{money(subtotal - Number(f.discount) + Number(f.delivery_charge))}</b></span><Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name"><Input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="District"><Input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></Field>
        <Field label="Upazila / Thana"><Input value={f.upazila} onChange={(e) => setF({ ...f, upazila: e.target.value })} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Customer note"><Textarea rows={2} className="min-h-[60px]" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <Field label="Admin note"><Textarea rows={2} className="min-h-[60px]" value={f.admin_note} onChange={(e) => setF({ ...f, admin_note: e.target.value })} /></Field>
      </div>
      <h3 className="mt-5 mb-2 font-bold">Items</h3>
      {hasCombo && <p className="mb-2 rounded-xl bg-amber-50 p-2.5 text-[12.5px] text-amber-800">This order contains a combo offer — items are locked; customer and delivery details can still be edited.</p>}
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[1fr_90px_70px_32px] items-center gap-2 rounded-2xl bg-soft p-2 pl-3 text-[13px]">
            <span className="truncate font-semibold">{it.name}{it.size && ` · ${it.size}`}</span>
            <Input disabled={hasCombo} className="!h-9 !py-0 !text-[13px]" type="number" min={0} value={it.unitPrice} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} aria-label="Unit price" />
            <Input disabled={hasCombo} className="!h-9 !py-0 !text-[13px]" type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity" />
            <button disabled={hasCombo || items.length <= 1} onClick={() => setItems(items.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-full text-danger disabled:opacity-30" aria-label="Remove"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      {!hasCombo && <Button className="mt-2" size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>Add product</Button>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Delivery charge"><Input type="number" min={0} value={f.delivery_charge} onChange={(e) => setF({ ...f, delivery_charge: e.target.value })} /></Field>
        <Field label="Discount"><Input type="number" min={0} value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
      </div>
      <ProductPicker open={picker} onClose={() => setPicker(false)} onPick={onPick} />
    </Sheet>
  );
}
