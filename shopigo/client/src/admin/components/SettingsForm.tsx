import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Field, Input, Select, Switch, Textarea, toast } from '../../components/ui';
import { SingleImage } from './kit';

export interface SettingDef { key: string; group: string; type: 'string' | 'text' | 'number' | 'boolean' | 'json' | 'image' | 'color' | 'select'; label: string; public?: boolean; secret?: boolean; options?: string[]; help?: string }
export interface SettingsPayload { groups: string[]; definitions: SettingDef[]; values: Record<string, unknown> }

export function useSettingsData() {
  return useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<SettingsPayload>('/api/admin/settings') });
}

const IMAGE_KIND: Record<string, 'logo' | 'icon' | 'image'> = { logo: 'logo', favicon: 'icon', app_icon: 'icon', og_image: 'image' };

/** Renders and saves any subset of settings groups — no code editing needed. */
export function SettingsForm({ groups, keys }: { groups?: string[]; keys?: string[] }) {
  const qc = useQueryClient();
  const { data } = useSettingsData();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  useEffect(() => { if (data) { setValues(data.values); setDirty(new Set()); } }, [data]);
  const defs = (data?.definitions ?? []).filter((d) => (keys ? keys.includes(d.key) : groups?.includes(d.group)));
  const set = (k: string, v: unknown) => { setValues((x) => ({ ...x, [k]: v })); setDirty((d) => new Set(d).add(k)); };
  const save = useMutation({
    mutationFn: () => api.put<{ changed: string[] }>('/api/admin/settings', { values: Object.fromEntries([...dirty].map((k) => [k, values[k]])) }),
    onSuccess: (r) => { toast.success(r.changed.length ? `Saved ${r.changed.length} setting(s)` : 'No changes'); void qc.invalidateQueries({ queryKey: ['admin-settings'] }); void qc.invalidateQueries({ queryKey: ['bootstrap'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {defs.map((d) => {
          const v = values[d.key];
          const full = d.type === 'text' || d.type === 'json' || d.type === 'image';
          if (d.type === 'boolean') return <div key={d.key} className="sm:col-span-2"><Switch checked={Boolean(v)} onChange={(x) => set(d.key, x)} label={d.label} description={d.help} /></div>;
          return (
            <Field key={d.key} label={d.label} hint={d.secret ? (v === '__SET__' ? 'Saved securely (encrypted). Type a new value to replace it.' : 'Stored encrypted, never shown again.') : d.help} className={full ? 'sm:col-span-2' : ''}>
              {d.type === 'text' ? <Textarea value={String(v ?? '')} onChange={(e) => set(d.key, e.target.value)} />
                : d.type === 'number' ? <Input type="number" step="any" value={String(v ?? '')} onChange={(e) => set(d.key, e.target.value)} />
                : d.type === 'select' ? <Select value={String(v ?? '')} onChange={(e) => set(d.key, e.target.value)}>{d.options?.map((o) => <option key={o}>{o}</option>)}</Select>
                : d.type === 'color' ? <div className="flex gap-2"><input type="color" value={String(v || '#F26B3A')} onChange={(e) => set(d.key, e.target.value)} className="h-12 w-14 cursor-pointer rounded-2xl border border-line p-1" /><Input value={String(v ?? '')} onChange={(e) => set(d.key, e.target.value)} /></div>
                : d.type === 'image' ? <SingleImage value={(v as string) || null} onChange={(x) => set(d.key, x ?? '')} folder="branding" kind={IMAGE_KIND[d.key] ?? 'image'} />
                : d.type === 'json' ? <Input value={Array.isArray(v) ? (v as string[]).join(', ') : JSON.stringify(v)} onChange={(e) => set(d.key, e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
                : <Input type={d.secret ? 'password' : 'text'} autoComplete="off" value={d.secret && v === '__SET__' ? '' : String(v ?? '')} placeholder={d.secret && v === '__SET__' ? '•••••••• (saved)' : undefined} onChange={(e) => set(d.key, e.target.value || (d.secret ? '__SET__' : ''))} />}
            </Field>
          );
        })}
      </div>
      <div className="sticky bottom-20 mt-5 flex justify-end lg:bottom-4">
        <Button loading={save.isPending} disabled={!dirty.size} icon={<Save className="size-4" />}>Save changes</Button>
      </div>
    </form>
  );
}
