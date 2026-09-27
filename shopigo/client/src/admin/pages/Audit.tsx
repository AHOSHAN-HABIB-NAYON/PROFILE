import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Button, Sheet } from '../../components/ui';
import { DataTable, PageHeader, Panel, SearchBox } from '../components/kit';

interface Log { id: number; admin_name: string | null; action: string; target_type: string | null; target_id: string | null; old_value: unknown; new_value: unknown; ip: string | null; created_at: string }

export default function Audit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Log | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['audit', action, page], queryFn: () => api.get<{ items: Log[] }>(`/api/admin/system/audit${qs({ action, page })}`) });
  return (
    <div>
      <PageHeader title="Activity Log" subtitle="Who changed what, when and from where." />
      <Panel pad={false}>
        <div className="p-4"><SearchBox value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="Filter by action prefix, e.g. order. or product.updated" /></div>
        <DataTable rows={data?.items ?? []} loading={isLoading} rowKey={(r) => r.id} onRowClick={setOpen} columns={[
          { key: 't', label: 'Time', render: (l) => <span className="text-[12.5px]">{dateTime(l.created_at)}</span> },
          { key: 'a', label: 'Admin', render: (l) => l.admin_name ?? 'System' },
          { key: 'ac', label: 'Action', render: (l) => <span className="font-mono text-[12.5px] font-semibold">{l.action}</span> },
          { key: 'tg', label: 'Target', render: (l) => (l.target_type ? `${l.target_type} #${l.target_id ?? ''}` : '—') },
          { key: 'ip', label: 'IP', render: (l) => <span className="text-[12px] text-muted">{l.ip}</span> },
        ]} />
        <div className="flex justify-center gap-2 p-3"><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button><Button size="sm" variant="ghost" disabled={(data?.items.length ?? 0) < 40} onClick={() => setPage(page + 1)}>Older</Button></div>
      </Panel>
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} wide title={open?.action}>
        {open && <div className="grid gap-3 md:grid-cols-2 text-[12px]">
          <div><p className="mb-1 font-bold">Old value</p><pre className="max-h-96 overflow-auto rounded-xl bg-soft p-3 whitespace-pre-wrap">{JSON.stringify(open.old_value, null, 2) ?? '—'}</pre></div>
          <div><p className="mb-1 font-bold">New value</p><pre className="max-h-96 overflow-auto rounded-xl bg-soft p-3 whitespace-pre-wrap">{JSON.stringify(open.new_value, null, 2) ?? '—'}</pre></div>
        </div>}
      </Sheet>
    </div>
  );
}
