import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Field, Input, Select, Sheet, Switch, Textarea, toast, useConfirm } from '../../components/ui';
import { CategoryIcon } from '../../components/CategoryIcon';
import { DataTable, PageHeader, Panel, SingleImage, type Column } from './kit';
import { RichText } from './RichText';

export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'image' | 'icon-image' | 'datetime' | 'fa-icon' | 'richtext' | 'multiselect';
  options?: Array<{ value: string | number; label: string }>;
  required?: boolean;
  hint?: ReactNode;
  folder?: string;
  full?: boolean;
  show?: (form: Record<string, any>) => boolean;
  placeholder?: string;
};

export interface ResourceConfig<T> {
  title: string;
  subtitle?: string;
  endpoint: string;
  queryKey: string;
  fields: FieldDef[];
  columns: Column<T>[];
  defaults: Record<string, unknown>;
  toForm?: (row: T) => Record<string, unknown>;
  toBody?: (form: Record<string, any>) => Record<string, unknown>;
  canEdit?: boolean;
  deleteLabel?: string;
  headerExtra?: ReactNode;
  invalidate?: string[];
}

const toLocalInput = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ResourcePage<T extends { id: number }>({ config }: { config: ResourceConfig<T> }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<{ id: number | null; form: Record<string, any> } | null>(null);
  const list = useQuery({ queryKey: [config.queryKey], queryFn: () => api.get<T[]>(config.endpoint) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: [config.queryKey] }); for (const k of config.invalidate ?? []) void qc.invalidateQueries({ queryKey: [k] }); };

  const save = useMutation({
    mutationFn: () => {
      const form = { ...editing!.form };
      for (const f of config.fields) {
        if (f.type === 'datetime') form[f.key] = form[f.key] ? new Date(form[f.key]).toISOString() : null;
        if (f.type === 'number' && form[f.key] === '') form[f.key] = null;
      }
      const body = config.toBody ? config.toBody(form) : form;
      return editing!.id ? api.put(`${config.endpoint}/${editing!.id}`, body) : api.post(config.endpoint, body);
    },
    onSuccess: () => { toast.success('Saved'); setEditing(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`${config.endpoint}/${id}`), onSuccess: () => { toast.success(config.deleteLabel ?? 'Moved to trash'); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  const open = (row?: T) => {
    const base = row ? (config.toForm ? config.toForm(row) : { ...row }) : { ...config.defaults };
    const form: Record<string, any> = { ...config.defaults, ...base };
    for (const f of config.fields) {
      if (f.type === 'datetime') form[f.key] = toLocalInput(form[f.key]);
      if (f.type === 'switch') form[f.key] = Boolean(form[f.key]);
      if (form[f.key] === null || form[f.key] === undefined) form[f.key] = f.type === 'switch' ? false : f.type === 'multiselect' ? [] : '';
    }
    setEditing({ id: row?.id ?? null, form });
  };
  const set = (k: string, v: unknown) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const editable = config.canEdit !== false;

  const columns: Column<T>[] = [
    ...config.columns,
    ...(editable ? [{
      key: '_actions', label: '', className: 'w-24 text-right', render: (r: T) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => open(r)} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-soft" aria-label="Edit"><Pencil className="size-4" /></button>
          <button onClick={async () => { if (await confirm('Delete this item?', { text: config.deleteLabel ? undefined : 'It will be moved to Trash and can be restored.', danger: true })) del.mutate(r.id); }} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button>
        </span>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title={config.title} subtitle={config.subtitle} actions={<>{config.headerExtra}{editable && <Button icon={<Plus className="size-4" />} onClick={() => open()}>Add</Button>}</>} />
      <Panel pad={false}>
        <DataTable rows={list.data ?? []} loading={list.isLoading} rowKey={(r) => r.id} columns={columns} onRowClick={editable ? (r) => open(r) : undefined} />
      </Panel>
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${config.title.replace(/s$/, '').toLowerCase()}` : `New ${config.title.replace(/s$/, '').toLowerCase()}`} wide footer={<Button block loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}>
        {editing && (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {config.fields.filter((f) => !f.show || f.show(editing.form)).map((f) => <FieldInput key={f.key} def={f} value={editing.form[f.key]} onChange={(v) => set(f.key, v)} form={editing.form} />)}
            <button type="submit" hidden />
          </form>
        )}
      </Sheet>
      {dialog}
    </div>
  );
}

function FieldInput({ def, value, onChange, form }: { def: FieldDef; value: any; onChange: (v: unknown) => void; form: Record<string, any> }) {
  const full = def.full || ['textarea', 'richtext', 'image', 'multiselect'].includes(def.type);
  const cls = full ? 'sm:col-span-2' : '';
  switch (def.type) {
    case 'switch':
      return <div className={cls}><Switch checked={Boolean(value)} onChange={onChange} label={def.label} description={def.hint} /></div>;
    case 'textarea':
      return <Field label={def.label} hint={def.hint} className={cls}><Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} /></Field>;
    case 'richtext':
      return <div className={cls}><span className="label">{def.label}</span><RichText value={value ?? ''} onChange={onChange} /></div>;
    case 'number':
      return <Field label={def.label} hint={def.hint} required={def.required} className={cls}><Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} /></Field>;
    case 'datetime':
      return <Field label={def.label} hint={def.hint} className={cls}><Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
    case 'select':
      return <Field label={def.label} hint={def.hint} required={def.required} className={cls}><Select value={value} onChange={(e) => onChange(e.target.value)}>{def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>;
    case 'multiselect':
      return (
        <Field label={def.label} hint={def.hint} className={cls}>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-line p-2">
            {def.options?.map((o) => {
              const on = (value as Array<number | string>).includes(o.value);
              return <button type="button" key={o.value} onClick={() => onChange(on ? (value as Array<number | string>).filter((x) => x !== o.value) : [...value, o.value])} className={on ? 'rounded-lg bg-brand-500 px-2.5 py-1 text-[12px] font-semibold text-white' : 'rounded-lg bg-soft px-2.5 py-1 text-[12px] font-semibold'}>{o.label}</button>;
            })}
          </div>
        </Field>
      );
    case 'image':
    case 'icon-image':
      return <Field label={def.label} hint={def.hint} className={cls}><SingleImage value={value || null} onChange={(v) => onChange(v ?? '')} folder={def.folder ?? 'media'} kind={def.type === 'icon-image' ? 'icon' : 'image'} /></Field>;
    case 'fa-icon':
      return (
        <Field label={def.label} hint={def.hint ?? <>Any Font Awesome 6 free icon, e.g. <code>fa-solid fa-shirt</code></>} className={cls}>
          <div className="flex items-center gap-2">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-500"><CategoryIcon type="fa" value={value} name="" /></span>
            <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="fa-solid fa-tag" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['fa-solid fa-laptop', 'fa-solid fa-mobile-screen', 'fa-solid fa-shirt', 'fa-solid fa-person-dress', 'fa-solid fa-shoe-prints', 'fa-solid fa-couch', 'fa-solid fa-spa', 'fa-solid fa-dumbbell', 'fa-solid fa-puzzle-piece', 'fa-solid fa-book', 'fa-solid fa-car', 'fa-solid fa-baby', 'fa-solid fa-gem', 'fa-solid fa-headphones', 'fa-solid fa-kitchen-set', 'fa-solid fa-basket-shopping', 'fa-solid fa-gift', 'fa-solid fa-paw'].map((ic) => (
              <button type="button" key={ic} onClick={() => onChange(ic)} className={`grid size-9 place-items-center rounded-xl ${value === ic ? 'bg-brand-500 text-white' : 'bg-soft text-ink-2'}`} title={ic}><i className={`${ic} text-[15px]`} /></button>
            ))}
          </div>
          {form.icon_type !== 'fa' && <span className="mt-1 block text-[12px] text-amber-700">Set “Icon type” to Font Awesome to use this.</span>}
        </Field>
      );
    default:
      return <Field label={def.label} hint={def.hint} required={def.required} className={cls}><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} /></Field>;
  }
}
