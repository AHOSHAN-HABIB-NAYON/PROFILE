import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { useBootstrap } from '../../lib/settings';
import { PageSpinner } from '../../components/ui';

interface O { order_no: string; customer_name: string; phone: string; district: string; upazila: string; address: string; note: string | null; subtotal: number; discount: number; delivery_charge: number; total: number; created_at: string; consignment_id: string | null; items: Array<{ id: number; name: string; size: string | null; color: string | null; unit_price: number; quantity: number; line_total: number }> }

/** Printable invoice / packing slip (A5-friendly). */
export default function OrderPrint() {
  const { id = '' } = useParams();
  const boot = useBootstrap();
  const { data: o } = useQuery({ queryKey: ['order', id], queryFn: () => api.get<O>(`/api/admin/orders/${id}`) });
  useEffect(() => { if (o) setTimeout(() => window.print(), 400); }, [o]);
  if (!o) return <PageSpinner />;
  const s = boot.data?.settings;
  return (
    <div className="fixed inset-0 z-[200] overflow-auto bg-white p-6 text-[13px] text-black print:static print:p-0">
      <style>{'@media print { @page { size: A5; margin: 10mm } nav, header, aside { display: none !important } }'}</style>
      <div className="mx-auto max-w-[560px]">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div><p className="text-[20px] font-extrabold">{s?.site_name}</p><p>{s?.contact_phone} {s?.contact_address && `· ${s.contact_address}`}</p></div>
          <div className="text-right"><p className="text-[16px] font-bold">INVOICE</p><p>#{o.order_no}</p><p>{dateTime(o.created_at)}</p>{o.consignment_id && <p>CN: {o.consignment_id}</p>}</div>
        </div>
        <div className="mt-3"><p className="font-bold">Deliver to</p><p>{o.customer_name} · {o.phone}</p><p>{o.address}, {o.upazila}, {o.district}</p>{o.note && <p>Note: {o.note}</p>}</div>
        <table className="mt-4 w-full border-collapse">
          <thead><tr className="border-y border-black text-left"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Price</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 text-right">Total</th></tr></thead>
          <tbody>{o.items.map((i) => <tr key={i.id} className="border-b border-gray-300"><td className="py-1.5">{i.name}{(i.size || i.color) && ` (${[i.color, i.size].filter(Boolean).join(', ')})`}</td><td className="py-1.5 text-right">{money(i.unit_price)}</td><td className="py-1.5 text-right">{i.quantity}</td><td className="py-1.5 text-right">{money(i.line_total)}</td></tr>)}</tbody>
        </table>
        <div className="mt-3 ml-auto w-60 space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
          {o.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>- {money(o.discount)}</span></div>}
          <div className="flex justify-between"><span>Delivery</span><span>{money(o.delivery_charge)}</span></div>
          <div className="flex justify-between border-t-2 border-black pt-1 text-[16px] font-extrabold"><span>COD Amount</span><span>{money(o.total)}</span></div>
        </div>
        <p className="mt-8 text-center">ধন্যবাদ, আবার আসবেন!</p>
        <button onClick={() => window.print()} className="mt-4 w-full rounded-xl bg-black py-2 text-white print:hidden">Print</button>
      </div>
    </div>
  );
}
