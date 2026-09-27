import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus, ShieldOff } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, Button, Field, Input, Select, Sheet, Tabs, toast } from '../../components/ui';
import { DataTable, PageHeader, Panel, RiskBadge, StatCard } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface Block { id: number; value: string; reason: string | null; attempts: number; expires_at: string | null; created_at: string; active: boolean; lifetime: boolean }
interface Event { id: number; type: string; ip: string | null; phone: string | null; device_hash: string | null; order_id: number | null; order_no: string | null; risk_score: number; risk_level: string; reasons: string[]; action: string; created_at: string }

export default function Fraud() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'events' | 'ip' | 'phone' | 'device' | 'settings'>('events');
  const [add, setAdd] = useState<{ type: string; value: string; reason: string; hours: string } | null>(null);
  const summary = useQuery({ queryKey: ['fraud-summary'], queryFn: () => api.get<{ events: Record<string, number>; activeBlocks: Record<string, number>; highRiskOrders: number }>('/api/admin/fraud/summary') });
  const events = useQuery({ queryKey: ['fraud-events'], queryFn: () => api.get<{ items: Event[] }>('/api/admin/fraud/events'), enabled: tab === 'events' });
  const blocks = useQuery({ queryKey: ['fraud-blocks', tab], queryFn: () => api.get<Block[]>(`/api/admin/fraud/blocks?type=${tab}`), enabled: ['ip', 'phone', 'device'].includes(tab) });
  const unblock = useMutation({ mutationFn: (id: number) => api.del(`/api/admin/fraud/blocks/${tab}/${id}`), onSuccess: () => { toast.success('Unblocked'); void qc.invalidateQueries({ queryKey: ['fraud-blocks'] }); void qc.invalidateQueries({ queryKey: ['fraud-summary'] }); } });
  const create = useMutation({ mutationFn: () => api.post('/api/admin/fraud/blocks', { ...add, hours: add!.hours ? Number(add!.hours) : null }), onSuccess: () => { toast.success('Blocked'); setAdd(null); void qc.invalidateQueries({ queryKey: ['fraud-blocks'] }); }, onError: (e: Error) => toast.error(e.message) });
  const s = summary.data;
  return (
    <div>
      <PageHeader title="Fraud Protection" subtitle="Risk scoring from IP, phone, device, address, order frequency, past cancellations and quantity." actions={<Button icon={<Plus className="size-4" />} onClick={() => setAdd({ type: 'ip', value: '', reason: 'Manual block', hours: '' })}>Block manually</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Rejected (7 days)" value={s?.events.rejected ?? 0} icon={<ShieldOff className="size-5" />} tone="red" />
        <StatCard label="Flagged orders (7 days)" value={s?.events.flagged ?? 0} icon={<ShieldOff className="size-5" />} tone="amber" />
        <StatCard label="High-risk orders" value={s?.highRiskOrders ?? 0} icon={<ShieldOff className="size-5" />} tone="violet" />
        <StatCard label="Active blocks" value={Object.values(s?.activeBlocks ?? {}).reduce((a, b) => a + b, 0)} icon={<ShieldOff className="size-5" />} tone="blue" hint={s ? `IP ${s.activeBlocks.ip ?? 0} · Phone ${s.activeBlocks.phone ?? 0} · Device ${s.activeBlocks.device ?? 0}` : undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ value: 'events', label: 'Events' }, { value: 'ip', label: 'Blocked IPs' }, { value: 'phone', label: 'Blocked phones' }, { value: 'device', label: 'Blocked devices' }, { value: 'settings', label: 'Settings' }]} />
      {tab === 'events' && (
        <Panel pad={false}>
          <DataTable rows={events.data?.items ?? []} loading={events.isLoading} rowKey={(r) => r.id} columns={[
            { key: 't', label: 'Event', render: (e) => <span><b>{e.type.replace(/_/g, ' ')}</b><span className="block text-[12px] text-muted">{dateTime(e.created_at)}</span></span> },
            { key: 'w', label: 'Who', render: (e) => <span className="text-[12.5px]">{e.phone ?? '—'}<span className="block text-muted">{e.ip}</span></span> },
            { key: 'r', label: 'Risk', render: (e) => <RiskBadge level={e.risk_level} score={e.risk_score} /> },
            { key: 'why', label: 'Reasons', render: (e) => <span className="block max-w-sm text-[12.5px]">{e.reasons.join('; ')}</span> },
            { key: 'a', label: 'Action', render: (e) => <Badge tone={e.action === 'flagged' ? 'amber' : 'red'}>{e.action}</Badge> },
            { key: 'o', label: 'Order', render: (e) => (e.order_id ? <Link to={`/admin/orders/${e.order_id}`} className="font-semibold text-brand-600">#{e.order_no}</Link> : '—') },
          ]} />
        </Panel>
      )}
      {['ip', 'phone', 'device'].includes(tab) && (
        <Panel pad={false}>
          <DataTable rows={blocks.data ?? []} loading={blocks.isLoading} rowKey={(r) => r.id} empty="Nothing blocked." columns={[
            { key: 'v', label: 'Value', render: (b) => <span className="font-mono text-[12.5px]">{tab === 'device' ? `${b.value.slice(0, 16)}…` : b.value}</span> },
            { key: 'r', label: 'Reason', render: (b) => <span className="text-[12.5px]">{b.reason}</span> },
            { key: 'a', label: 'Blocks', render: (b) => b.attempts },
            { key: 'e', label: 'Duration', render: (b) => (b.lifetime ? <Badge tone="red">Lifetime</Badge> : b.active ? `until ${dateTime(b.expires_at)}` : <Badge tone="gray">Expired</Badge>) },
            { key: 'x', label: '', render: (b) => <Button size="sm" variant="ghost" onClick={() => unblock.mutate(b.id)}>Unblock</Button> },
          ]} />
        </Panel>
      )}
      {tab === 'settings' && <Panel><SettingsForm groups={['fraud']} /></Panel>}
      <Sheet open={Boolean(add)} onClose={() => setAdd(null)} title="Block" footer={<Button block loading={create.isPending} onClick={() => create.mutate()}>Block</Button>}>
        {add && <div className="space-y-3">
          <Field label="Type"><Select value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })}><option value="ip">IP address</option><option value="phone">Phone number</option></Select></Field>
          <Field label="Value"><Input value={add.value} onChange={(e) => setAdd({ ...add, value: e.target.value })} /></Field>
          <Field label="Reason"><Input value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></Field>
          <Field label="Duration (hours)" hint="Empty = lifetime block"><Input type="number" value={add.hours} onChange={(e) => setAdd({ ...add, hours: e.target.value })} /></Field>
        </div>}
      </Sheet>
    </div>
  );
}
