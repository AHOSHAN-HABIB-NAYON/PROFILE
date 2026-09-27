import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Plug, Star, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { Badge, Button, Field, Input, Switch, Textarea, toast } from '../../components/ui';
import { DataTable, PageHeader, Panel } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface FieldV { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; help?: string; type?: string; value: string; fromEnv: boolean }
interface Courier { id: number; code: string; name: string; driver: string; is_enabled: number; is_default: number; label: string; description: string; capabilities: { shipments: boolean; tracking: boolean; customerHistory: boolean }; fields: FieldV[] }
interface Report { couriers: Array<{ id: number; name: string; total: number; delivered: number; cancelled: number; returned: number; pending: number; cod_total: number; cod_collected: number; success_rate: number | null }>; failedRequests: number }

export default function Couriers() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-couriers'], queryFn: () => api.get<Courier[]>('/api/admin/couriers') });
  const report = useQuery({ queryKey: ['courier-report'], queryFn: () => api.get<Report>('/api/admin/couriers/report') });
  return (
    <div>
      <PageHeader title="Couriers" subtitle="Credentials are encrypted on the server and never sent to the browser. Values set via environment variables override these." />
      <Panel title="Courier performance (last 30 days)" pad={false} className="mb-4">
        <DataTable rows={report.data?.couriers ?? []} loading={report.isLoading} rowKey={(r) => r.id} empty="No parcels yet." columns={[
          { key: 'n', label: 'Courier', render: (r) => <b>{r.name}</b> },
          { key: 't', label: 'Total', render: (r) => r.total },
          { key: 'd', label: 'Delivered', render: (r) => <span className="text-green-700">{r.delivered}</span> },
          { key: 'c', label: 'Cancelled', render: (r) => <span className="text-danger">{r.cancelled}</span> },
          { key: 'r', label: 'Returned', render: (r) => <span className="text-amber-700">{r.returned}</span> },
          { key: 'p', label: 'In transit', render: (r) => r.pending },
          { key: 's', label: 'Success rate', render: (r) => (r.success_rate === null ? '—' : <b>{r.success_rate}%</b>) },
          { key: 'cod', label: 'COD value / collected', render: (r) => <span className="tabular-nums">{money(r.cod_total)} / {money(r.cod_collected)}</span> },
        ]} />
        {Boolean(report.data?.failedRequests) && <p className="px-5 pb-4 text-[12.5px] text-danger">{report.data!.failedRequests} failed courier API requests in this period — see order API logs.</p>}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">{data?.map((c) => <CourierCard key={c.id} c={c} onSaved={() => { void qc.invalidateQueries({ queryKey: ['admin-couriers'] }); void qc.invalidateQueries({ queryKey: ['couriers-enabled'] }); }} />)}</div>
      <Panel title="Courier automation" className="mt-4"><SettingsForm groups={['courier']} /></Panel>
    </div>
  );
}

function CourierCard({ c, onSaved }: { c: Courier; onSaved: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>(Object.fromEntries(c.fields.map((f) => [f.key, f.value])));
  const [enabled, setEnabled] = useState(Boolean(c.is_enabled));
  const save = useMutation({ mutationFn: (extra: Record<string, unknown> = {}) => api.put(`/api/admin/couriers/${c.id}`, { is_enabled: enabled, credentials: creds, ...extra }), onSuccess: () => { toast.success(`${c.name} saved`); onSaved(); }, onError: (e: Error) => toast.error(e.message) });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>(`/api/admin/couriers/${c.id}/test`), onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)) });
  return (
    <Panel title={<span className="flex items-center gap-2"><Truck className="size-4 text-brand-500" />{c.name} {c.is_default ? <Badge><Star className="size-3 fill-current" />Default</Badge> : null} {c.is_enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="gray">Disabled</Badge>}</span>}>
      <p className="mb-4 text-[13px] text-muted">{c.description}</p>
      <div className="space-y-3">
        {c.fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.fromEnv ? 'Provided by an environment variable (read-only here)' : f.help ?? (f.secret ? (f.value === '__SET__' ? 'Saved (encrypted) — type to replace' : 'Stored encrypted') : undefined)}>
            {f.type === 'textarea' ? <Textarea className="font-mono text-[12px]" disabled={f.fromEnv} value={f.secret && creds[f.key] === '__SET__' ? '' : creds[f.key] ?? ''} placeholder={f.secret && creds[f.key] === '__SET__' ? '•••••• (saved)' : f.placeholder} onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value || (f.secret ? '__SET__' : '') })} />
              : <Input type={f.secret ? 'password' : 'text'} autoComplete="off" disabled={f.fromEnv} value={f.secret && creds[f.key] === '__SET__' ? '' : creds[f.key] ?? ''} placeholder={f.secret && creds[f.key] === '__SET__' ? '•••••• (saved)' : f.placeholder} onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value || (f.secret && c.fields.find((x) => x.key === f.key)?.value === '__SET__' ? '__SET__' : '') })} />}
          </Field>
        ))}
        <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={save.isPending} onClick={() => save.mutate({})}>Save</Button>
        <Button variant="soft" icon={<Plug className="size-4" />} loading={test.isPending} onClick={() => test.mutate()}>Test connection</Button>
        {c.capabilities.shipments && !c.is_default && <Button variant="ghost" icon={<CircleCheck className="size-4" />} onClick={() => save.mutate({ is_default: true })}>Make default</Button>}
      </div>
    </Panel>
  );
}
