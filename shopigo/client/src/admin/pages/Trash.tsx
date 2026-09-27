import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, Button, toast, useConfirm } from '../../components/ui';
import { DataTable, PageHeader, Panel } from '../components/kit';

interface T { id: number; entity_type: string; entity_id: number; title: string; deleted_at: string; deleted_by_name: string | null }

export default function Trash() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['trash'], queryFn: () => api.get<T[]>('/api/admin/system/trash') });
  const refresh = () => void qc.invalidateQueries();
  const restore = useMutation({ mutationFn: (id: number) => api.post(`/api/admin/system/trash/${id}/restore`), onSuccess: () => { toast.success('Restored'); refresh(); } });
  const purge = useMutation({ mutationFn: (id: number) => api.del(`/api/admin/system/trash/${id}`), onSuccess: () => { toast.success('Permanently deleted'); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <div>
      <PageHeader title="Trash" subtitle="Deleted products, orders, categories, banners, coupons and combos. Restore anytime." />
      <Panel pad={false}>
        <DataTable rows={data ?? []} loading={isLoading} rowKey={(r) => r.id} empty="Trash is empty." columns={[
          { key: 'e', label: 'Item', render: (t) => <span><Badge tone="gray">{t.entity_type}</Badge> <b className="ml-1">{t.title}</b></span> },
          { key: 'd', label: 'Deleted', render: (t) => <span className="text-[12.5px]">{dateTime(t.deleted_at)}{t.deleted_by_name ? ` · ${t.deleted_by_name}` : ''}</span> },
          { key: 'a', label: '', render: (t) => <span className="flex justify-end gap-1"><Button size="sm" variant="soft" icon={<RotateCcw className="size-4" />} onClick={() => restore.mutate(t.id)}>Restore</Button><Button size="sm" variant="ghost" className="!text-danger" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm('Delete permanently?', { text: 'This cannot be undone.', danger: true, confirmLabel: 'Delete forever' })) purge.mutate(t.id); }}>Delete forever</Button></span> },
        ]} />
      </Panel>
      {dialog}
    </div>
  );
}
