import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Wrench } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, toast } from '../../components/ui';
import { PageHeader, Panel } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface H { database: { ok: boolean; ms?: number; error?: string }; redis: { ok: boolean; status: string }; version: { code: string; database: string; installedAt: string; pendingMigrations: string[] }; runtime: { node: string; platform: string; uptime: number; memoryMb: number; freeMemMb: number; load: string[] }; maintenance: { enabled: boolean; bypassToken?: string; reason?: string } }

export default function Health() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['health'], queryFn: () => api.get<H>('/api/admin/system/health'), refetchInterval: 30_000 });
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api.post('/api/admin/system/maintenance', { enabled }), onSuccess: () => { toast.success('Maintenance mode updated'); void qc.invalidateQueries({ queryKey: ['health'] }); } });
  const ok = (v?: boolean) => (v ? <CircleCheck className="size-5 text-green-600" /> : <CircleX className="size-5 text-danger" />);
  const m = data?.maintenance;
  return (
    <div>
      <PageHeader title="System Health" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Services">
          <ul className="space-y-3 text-[14px]">
            <li className="flex items-center gap-3">{ok(data?.database.ok)}<span className="flex-1">Database</span><span className="text-muted">{data?.database.ok ? `${data.database.ms} ms` : data?.database.error}</span></li>
            <li className="flex items-center gap-3">{ok(data?.redis.ok)}<span className="flex-1">Cache / Redis</span><span className="text-muted">{data?.redis.status}</span></li>
            <li className="flex items-center gap-3">{ok(!data?.version.pendingMigrations.length)}<span className="flex-1">Schema migrations</span><span className="text-muted">{data?.version.pendingMigrations.length ? `${data.version.pendingMigrations.length} pending` : 'up to date'}</span></li>
          </ul>
        </Panel>
        <Panel title="Runtime">
          <dl className="grid grid-cols-2 gap-2 text-[13.5px]">
            <dt className="text-muted">Version</dt><dd className="font-semibold">{data?.version.code}</dd>
            <dt className="text-muted">Node.js</dt><dd className="font-semibold">{data?.runtime.node}</dd>
            <dt className="text-muted">Platform</dt><dd className="font-semibold">{data?.runtime.platform}</dd>
            <dt className="text-muted">Uptime</dt><dd className="font-semibold">{Math.round((data?.runtime.uptime ?? 0) / 60)} min</dd>
            <dt className="text-muted">Memory used / free</dt><dd className="font-semibold">{data?.runtime.memoryMb} MB / {data?.runtime.freeMemMb} MB</dd>
            <dt className="text-muted">Load</dt><dd className="font-semibold">{data?.runtime.load.join(' · ')}</dd>
          </dl>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Wrench className="size-4" />Maintenance mode {m?.enabled ? <Badge tone="amber">ON</Badge> : <Badge tone="green">OFF</Badge>}</span>} className="lg:col-span-2">
          <p className="mb-3 text-[13px] text-muted">Customers see a friendly maintenance page; admins keep full access.</p>
          {m?.enabled && m.bypassToken && <p className="mb-3 rounded-xl bg-soft p-3 text-[12.5px]">Preview link: <code className="break-all">{location.origin}/?preview={m.bypassToken}</code></p>}
          <Button variant={m?.enabled ? 'success' : 'dark'} loading={toggle.isPending} onClick={() => toggle.mutate(!m?.enabled)}>{m?.enabled ? 'Disable maintenance' : 'Enable maintenance'}</Button>
          <div className="mt-5 border-t border-line pt-4"><SettingsForm groups={['maintenance']} /></div>
        </Panel>
      </div>
    </div>
  );
}
