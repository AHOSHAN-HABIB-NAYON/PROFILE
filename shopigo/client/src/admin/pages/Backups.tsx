import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, HardDrive, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { bytes, dateTime } from '../../lib/format';
import { Badge, Button, Field, Input, Sheet, toast, useConfirm } from '../../components/ui';
import { DataTable, PageHeader, Panel, useMe } from '../components/kit';
import { SettingsForm } from '../components/SettingsForm';

interface B { id: number; type: string; file: string; size: number; status: string; note: string | null; created_at: string; created_by_name: string | null }

export default function Backups() {
  const qc = useQueryClient();
  const me = useMe();
  const isSuper = me.data?.admin?.role === 'super_admin';
  const { confirm, dialog } = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['backups'], queryFn: () => api.get<B[]>('/api/admin/system/backups') });
  const [restore, setRestore] = useState<{ b: B; confirm: string; password: string } | null>(null);
  const create = useMutation({ mutationFn: (type: string) => api.post<B>('/api/admin/system/backups', { type }), onSuccess: (b) => { toast.success(`Backup created (${bytes(b.size)})`); void qc.invalidateQueries({ queryKey: ['backups'] }); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/admin/system/backups/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['backups'] }) });
  const doRestore = useMutation({ mutationFn: () => api.post<{ safetyBackup: string }>(`/api/admin/system/backups/${restore!.b.id}/restore`, { confirm: restore!.confirm, password: restore!.password }), onSuccess: (r) => { toast.success(`Restored. Safety copy: ${r.safetyBackup}`); setRestore(null); void qc.invalidateQueries(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <div>
      <PageHeader title="Backups" subtitle="Stored privately in storage/backups (never web-accessible)." actions={<>
        <Button variant="soft" icon={<Database className="size-4" />} loading={create.isPending && create.variables === 'database'} onClick={() => create.mutate('database')}>Database backup</Button>
        <Button variant="soft" icon={<Settings2 className="size-4" />} loading={create.isPending && create.variables === 'config'} onClick={() => create.mutate('config')}>Configuration</Button>
        <Button icon={<HardDrive className="size-4" />} loading={create.isPending && create.variables === 'full'} onClick={() => create.mutate('full')}>Full backup</Button>
      </>} />
      <Panel pad={false}>
        <DataTable rows={data ?? []} loading={isLoading} rowKey={(r) => r.id} empty="No backups yet." columns={[
          { key: 'f', label: 'Backup', render: (b) => <span><span className="font-mono text-[12.5px] font-semibold">{b.file}</span><span className="block text-[12px] text-muted">{b.note}</span></span> },
          { key: 't', label: 'Type', render: (b) => <Badge tone={b.type === 'full' ? 'violet' : b.type === 'database' ? 'blue' : 'gray'}>{b.type}</Badge> },
          { key: 's', label: 'Size', render: (b) => bytes(b.size) },
          { key: 'd', label: 'Created', render: (b) => <span className="text-[12.5px]">{dateTime(b.created_at)}{b.created_by_name ? ` · ${b.created_by_name}` : ' · auto'}</span> },
          { key: 'st', label: 'Status', render: (b) => <Badge tone={b.status === 'completed' ? 'green' : 'red'}>{b.status}</Badge> },
          { key: 'a', label: '', render: (b) => isSuper && b.status === 'completed' ? (
            <span className="flex justify-end gap-1">
              <a href={`/api/admin/system/backups/${b.id}/download`} className="grid size-8 place-items-center rounded-lg hover:bg-soft" aria-label="Download"><Download className="size-4" /></a>
              {b.type !== 'config' && !b.file.includes('uploads') && <button onClick={() => setRestore({ b, confirm: '', password: '' })} className="grid size-8 place-items-center rounded-lg text-amber-700 hover:bg-amber-50" aria-label="Restore"><RotateCcw className="size-4" /></button>}
              <button onClick={async () => { if (await confirm('Delete this backup file?', { danger: true })) del.mutate(b.id); }} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-red-50" aria-label="Delete"><Trash2 className="size-4" /></button>
            </span>
          ) : null },
        ]} />
      </Panel>
      <Panel title="Automatic backups" className="mt-4"><SettingsForm groups={['backup']} /></Panel>
      <Sheet open={Boolean(restore)} onClose={() => setRestore(null)} title="Restore database" footer={<Button variant="danger" block loading={doRestore.isPending} disabled={restore?.confirm !== 'RESTORE' || !restore?.password} onClick={() => doRestore.mutate()}>Restore now</Button>}>
        {restore && <div className="space-y-3 text-[13.5px]">
          <p className="rounded-2xl bg-red-50 p-3 text-danger">This replaces the current database with <b>{restore.b.file}</b>. Anything created after {dateTime(restore.b.created_at)} will be lost. A safety backup of the current database is taken automatically first.</p>
          <Field label='Type "RESTORE" to confirm'><Input value={restore.confirm} onChange={(e) => setRestore({ ...restore, confirm: e.target.value })} /></Field>
          <Field label="Your password"><Input type="password" value={restore.password} onChange={(e) => setRestore({ ...restore, password: e.target.value })} /></Field>
        </div>}
      </Sheet>
      {dialog}
    </div>
  );
}
