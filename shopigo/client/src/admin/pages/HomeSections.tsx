import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { Button, Field, Input, Select, Switch, toast } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';

interface Section { id: number; section_key: string; title: string; subtitle: string | null; is_enabled: number | boolean; sort_order: number; product_limit: number; grid_columns: number; per_page: number }

const DESCRIPTIONS: Record<string, string> = {
  categories: 'Icon row of top-level categories', flash_sale: 'Products in the currently running flash sale with countdown', combo_offers: 'Bundle offers', free_delivery: 'Products marked "Free delivery"',
  coupon_highlight: 'Coupons marked "Highlight on home"', best_selling: 'Most sold products', new_arrivals: 'Newest products', featured: 'Products marked "Featured"', recommended: 'Top rated + popular mix',
};

export default function HomeSections() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-home-sections'], queryFn: () => api.get<Section[]>('/api/admin/marketing/home-sections') });
  const [list, setList] = useState<Section[]>([]);
  useEffect(() => { if (data) setList(data); }, [data]);
  const move = (i: number, d: number) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); setList(n); };
  const upd = (i: number, patch: Partial<Section>) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = useMutation({
    mutationFn: () => api.put('/api/admin/marketing/home-sections', { sections: list.map((s) => ({ id: s.id, title: s.title, subtitle: s.subtitle, is_enabled: Boolean(s.is_enabled), product_limit: Number(s.product_limit), grid_columns: Number(s.grid_columns), per_page: Number(s.per_page) })) }),
    onSuccess: () => { toast.success('Home page updated'); void qc.invalidateQueries({ queryKey: ['admin-home-sections'] }); void qc.invalidateQueries({ queryKey: ['home'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div>
      <PageHeader title="Home Sections" subtitle="Turn sections on/off, reorder them, and control how many products they show." actions={<Button icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>} />
      <div className="space-y-3">
        {list.map((s, i) => (
          <Panel key={s.id} className={cx(!s.is_enabled && 'opacity-60')}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-1">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-lg bg-soft disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-4" /></button>
                <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-lg bg-soft disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-4" /></button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="font-bold">{s.title}</p><p className="text-[12.5px] text-muted">{DESCRIPTIONS[s.section_key] ?? s.section_key}</p></div>
                  <Switch checked={Boolean(s.is_enabled)} onChange={(v) => upd(i, { is_enabled: v })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                  <Field label="Title"><Input className="!h-10 !py-0" value={s.title} onChange={(e) => upd(i, { title: e.target.value })} /></Field>
                  <Field label="Subtitle"><Input className="!h-10 !py-0" value={s.subtitle ?? ''} onChange={(e) => upd(i, { subtitle: e.target.value })} /></Field>
                  <Field label="Product count"><Input className="!h-10 !py-0" type="number" min={1} max={60} value={s.product_limit} onChange={(e) => upd(i, { product_limit: Number(e.target.value) })} /></Field>
                  <Field label="Grid columns"><Select className="!h-10 !py-0" value={s.grid_columns} onChange={(e) => upd(i, { grid_columns: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                  <Field label="Per page (Load more)"><Input className="!h-10 !py-0" type="number" min={1} max={60} value={s.per_page} onChange={(e) => upd(i, { per_page: Number(e.target.value) })} /></Field>
                </div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
