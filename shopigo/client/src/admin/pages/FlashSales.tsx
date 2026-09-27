import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { Badge, Button, Field, Input, Sheet, Switch, toast, useConfirm } from '../../components/ui';
import { PageHeader, Panel, ProductPicker } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface Item { product_id: number; name: string; price: number; stock: number; sale_price: number; stock_limit: number | null; sold_count?: number }
interface Sale { id: number; title: string; starts_at: string; ends_at: string; is_active: number; items: Item[] }

const local = (v: string) => { const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function FlashSales() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data } = useQuery({ queryKey: ['admin-flash'], queryFn: () => api.get<Sale[]>('/api/admin/marketing/flash-sales') });
  const [edit, setEdit] = useState<{ id: number | null; title: string; starts_at: string; ends_at: string; is_active: boolean; items: Array<{ product_id: number; name: string; price: number; sale_price: string; stock_limit: string }> } | null>(null);
  const [picker, setPicker] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const body = { title: edit!.title, starts_at: new Date(edit!.starts_at).toISOString(), ends_at: new Date(edit!.ends_at).toISOString(), is_active: edit!.is_active, items: edit!.items.map((i) => ({ product_id: i.product_id, sale_price: Number(i.sale_price), stock_limit: i.stock_limit })) };
      return edit!.id ? api.put(`/api/admin/marketing/flash-sales/${edit!.id}`, body) : api.post('/api/admin/marketing/flash-sales', body);
    },
    onSuccess: () => { toast.success('Flash sale saved'); setEdit(null); void qc.invalidateQueries({ queryKey: ['admin-flash'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/admin/marketing/flash-sales/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-flash'] }) });
  const now = Date.now();
  const open = (s?: Sale) => setEdit(s ? { id: s.id, title: s.title, starts_at: local(s.starts_at), ends_at: local(s.ends_at), is_active: Boolean(s.is_active), items: s.items.map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, sale_price: String(i.sale_price), stock_limit: i.stock_limit ? String(i.stock_limit) : '' })) }
    : { id: null, title: 'Flash Sale', starts_at: local(new Date().toISOString()), ends_at: local(new Date(Date.now() + 2 * 86400_000).toISOString()), is_active: true, items: [] });
  return (
    <div>
      <PageHeader title="Flash Sales" subtitle="Time-limited prices with a live countdown on the storefront." actions={<Button icon={<Plus className="size-4" />} onClick={() => open()}>New flash sale</Button>} />
      <div className="space-y-3">
        {data?.map((s) => {
          const live = s.is_active && new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now;
          return (
            <Panel key={s.id} title={<span className="flex items-center gap-2"><Zap className="size-4 text-brand-500" />{s.title} {live ? <Badge tone="green">Live</Badge> : new Date(s.ends_at).getTime() < now ? <Badge tone="gray">Ended</Badge> : <Badge tone="blue">Scheduled</Badge>}</span>}
              actions={<span className="flex gap-1"><Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => open(s)}>Edit</Button><Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm('Delete this flash sale?', { danger: true })) del.mutate(s.id); }}>Delete</Button></span>}>
              <p className="mb-3 text-[13px] text-muted">{dateTime(s.starts_at)} → {dateTime(s.ends_at)}</p>
              <ul className="divide-y divide-line text-[13.5px]">{s.items.map((i) => <li key={i.product_id} className="flex justify-between gap-3 py-2"><span className="truncate">{i.name}</span><span className="shrink-0"><span className="text-muted line-through">{money(i.price)}</span> <b>{money(i.sale_price)}</b> <span className="text-muted">· sold {i.sold_count ?? 0}{i.stock_limit ? `/${i.stock_limit}` : ''}</span></span></li>)}</ul>
            </Panel>
          );
        })}
        {!data?.length && <Panel><p className="py-8 text-center text-[14px] text-muted">No flash sales yet.</p></Panel>}
        <Panel title="Flash sale section"><SettingsForm keys={['flash_sale_enabled']} /></Panel>
      </div>
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} wide title={edit?.id ? 'Edit flash sale' : 'New flash sale'} footer={<Button block loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}>
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
              <Field label="Start"><Input type="datetime-local" value={edit.starts_at} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value })} /></Field>
              <Field label="End"><Input type="datetime-local" value={edit.ends_at} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value })} /></Field>
            </div>
            <Switch checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Active" />
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="label !mb-0">Products</span><Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>Add product</Button></div>
              <ul className="space-y-2">
                {edit.items.map((i, idx) => (
                  <li key={i.product_id} className="grid grid-cols-[1fr_110px_110px_36px] items-center gap-2 rounded-2xl bg-soft p-2 pl-3 text-[13px]">
                    <span className="truncate font-semibold">{i.name} <span className="font-normal text-muted">({money(i.price)})</span></span>
                    <Input className="!h-9 !py-0" type="number" placeholder="Sale price" value={i.sale_price} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === idx ? { ...x, sale_price: e.target.value } : x)) })} />
                    <Input className="!h-9 !py-0" type="number" placeholder="Stock limit" value={i.stock_limit} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === idx ? { ...x, stock_limit: e.target.value } : x)) })} />
                    <button onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== idx) })} className="grid size-9 place-items-center text-danger" aria-label="Remove"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>
      <ProductPicker open={picker} onClose={() => setPicker(false)} onPick={(p) => edit && !edit.items.some((i) => i.product_id === p.id) && setEdit({ ...edit, items: [...edit.items, { product_id: p.id, name: p.name, price: Number(p.price), sale_price: String(Math.round(Number(p.sale_price ?? p.price) * 0.9)), stock_limit: '' }] })} />
      {dialog}
    </div>
  );
}
