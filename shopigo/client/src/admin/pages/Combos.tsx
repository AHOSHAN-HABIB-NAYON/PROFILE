import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Badge, Button, Field, Input, Sheet, Switch, Textarea, toast, useConfirm } from '../../components/ui';
import { PageHeader, Panel, ProductPicker, SingleImage } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface Combo { id: number; name: string; slug: string; description: string | null; image: string | null; price: number; is_active: number; sort_order: number; items: Array<{ product_id: number; quantity: number; name: string; price: number }>; regular_price: number; savings: number }
interface Form { id: number | null; name: string; slug: string; description: string; image: string | null; price: string; is_active: boolean; sort_order: string; items: Array<{ product_id: number; name: string; price: number; quantity: string }> }

export default function Combos() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data } = useQuery({ queryKey: ['admin-combos'], queryFn: () => api.get<Combo[]>('/api/admin/marketing/combos') });
  const [f, setF] = useState<Form | null>(null);
  const [picker, setPicker] = useState(false);
  const regular = f ? f.items.reduce((s, i) => s + i.price * Number(i.quantity || 1), 0) : 0;
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f!.name, slug: f!.slug || null, description: f!.description || null, image: f!.image, price: Number(f!.price), is_active: f!.is_active, sort_order: Number(f!.sort_order || 0), starts_at: null, ends_at: null, items: f!.items.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity || 1) })) };
      return f!.id ? api.put(`/api/admin/marketing/combos/${f!.id}`, body) : api.post('/api/admin/marketing/combos', body);
    },
    onSuccess: () => { toast.success('Combo saved'); setF(null); void qc.invalidateQueries({ queryKey: ['admin-combos'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/admin/marketing/combos/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-combos'] }) });
  const open = (c?: Combo) => setF(c ? { id: c.id, name: c.name, slug: c.slug, description: c.description ?? '', image: c.image, price: String(c.price), is_active: Boolean(c.is_active), sort_order: String(c.sort_order), items: c.items.map((i) => ({ product_id: i.product_id, name: i.name, price: Number(i.price), quantity: String(i.quantity) })) }
    : { id: null, name: '', slug: '', description: '', image: null, price: '', is_active: true, sort_order: '0', items: [] });
  return (
    <div>
      <PageHeader title="Combo Offers" subtitle="Bundle products at a special price — savings are shown automatically." actions={<Button icon={<Plus className="size-4" />} onClick={() => open()}>New combo</Button>} />
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((c) => (
          <Panel key={c.id} title={<span className="flex items-center gap-2"><Gift className="size-4 text-brand-500" />{c.name} <Badge tone={c.is_active ? 'green' : 'gray'}>{c.is_active ? 'Active' : 'Off'}</Badge></span>} actions={<span className="flex gap-1"><button onClick={() => open(c)} className="grid size-8 place-items-center rounded-lg hover:bg-soft" aria-label="Edit"><Pencil className="size-4" /></button><button onClick={async () => { if (await confirm('Move combo to trash?', { danger: true })) del.mutate(c.id); }} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button></span>}>
            <p className="text-[13.5px]">{c.items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(' + ')}</p>
            <p className="mt-2 text-[14px]"><span className="text-muted line-through">{money(c.regular_price)}</span> <b className="text-[17px]">{money(c.price)}</b> <Badge tone="green">Save {money(c.savings)}</Badge></p>
          </Panel>
        ))}
      </div>
      {!data?.length && <Panel><p className="py-8 text-center text-[14px] text-muted">No combo offers yet.</p></Panel>}
      <Panel title="Combo section" className="mt-4"><SettingsForm keys={['combo_enabled']} /></Panel>
      <Sheet open={Boolean(f)} onClose={() => setF(null)} wide title={f?.id ? 'Edit combo' : 'New combo'} footer={<div className="flex items-center justify-between gap-3"><span className="text-[13px]">Normal {money(regular)} → Combo {money(Number(f?.price || 0))} · <b className="text-green-700">Save {money(Math.max(0, regular - Number(f?.price || 0)))}</b></span><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>}>
        {f && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Combo price (৳)"><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Image (optional)"><SingleImage value={f.image} onChange={(v) => setF({ ...f, image: v })} folder="combos" /></Field>
            <div className="space-y-3"><Field label="Sort order"><Input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field><Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Active" /></div>
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between"><span className="label !mb-0">Products (at least 2)</span><Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>Add product</Button></div>
              <ul className="space-y-2">{f.items.map((i, idx) => (
                <li key={i.product_id} className="grid grid-cols-[1fr_80px_36px] items-center gap-2 rounded-2xl bg-soft p-2 pl-3 text-[13px]">
                  <span className="truncate font-semibold">{i.name} <span className="font-normal text-muted">{money(i.price)}</span></span>
                  <Input className="!h-9 !py-0" type="number" min={1} value={i.quantity} onChange={(e) => setF({ ...f, items: f.items.map((x, j) => (j === idx ? { ...x, quantity: e.target.value } : x)) })} />
                  <button onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== idx) })} className="grid size-9 place-items-center text-danger" aria-label="Remove"><Trash2 className="size-4" /></button>
                </li>
              ))}</ul>
            </div>
          </div>
        )}
      </Sheet>
      <ProductPicker open={picker} onClose={() => setPicker(false)} onPick={(p) => f && !f.items.some((i) => i.product_id === p.id) && setF({ ...f, items: [...f.items, { product_id: p.id, name: p.name, price: Number(p.price), quantity: '1' }] })} />
      {dialog}
    </div>
  );
}
