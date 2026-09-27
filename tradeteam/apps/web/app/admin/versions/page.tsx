'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { AdminTitle, useAdmin } from '@/components/admin/admin-shell';
import { Button, Card, InfoBox, Row, SectionTitle, StatusBadge } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';

interface V {
  appVersion: string;
  installedVersion: string;
  schemaVersion: number;
  applied: { version: number; name: string; status: string; appliedAt: string }[];
  pending: { version: number; name: string }[];
}

export default function AdminVersions() {
  const qc = useQueryClient();
  const me = useAdmin().data;
  const q = useQuery({ queryKey: ['admin', 'versions'], queryFn: () => get<V>('/admin/system/version') });
  const run = useMutation({
    mutationFn: () => post<{ applied: number[] }>('/admin/system/migrate'),
    onSuccess: (r) => (
      toast(`Applied ${r.applied.length} migrations`),
      qc.invalidateQueries({ queryKey: ['admin', 'versions'] })
    ),
    onError: (e) => toast.error('Migration failed', errorMessage(e)),
  });
  const v = q.data;
  return (
    <div className="space-y-4 max-w-3xl">
      <AdminTitle title="Version & migrations" />
      <Card>
        <Row label="Application version" value={v?.appVersion} />
        <Row label="Installed version" value={v?.installedVersion} />
        <Row label="Latest schema version" value={v?.schemaVersion} />
      </Card>
      {v && v.pending.length > 0 ? (
        <Card className="space-y-3">
          <SectionTitle>Pending migrations</SectionTitle>
          {v.pending.map((m) => (
            <Row key={m.version} label={`#${m.version}`} value={m.name} />
          ))}
          <InfoBox tone="warn">
            Back up the database before applying. Migrations only add/alter schema; users, balances,
            transactions and settings are preserved.
          </InfoBox>
          {me?.role === 'super_admin' && (
            <Button loading={run.isPending} onClick={() => run.mutate()}>
              Apply pending migrations
            </Button>
          )}
        </Card>
      ) : (
        <InfoBox>
          Database schema is up to date. Updates are applied automatically at startup (AUTO_MIGRATE) and never
          re-run the installer.
        </InfoBox>
      )}
      <Card padded={false}>
        <div className="px-4 pt-4">
          <SectionTitle>Applied migrations</SectionTitle>
        </div>
        <DataTable
          rows={v?.applied}
          loading={q.isLoading}
          rowKey={(m) => String(m.version)}
          columns={[
            { key: 'v', header: 'Version', render: (m) => `#${m.version}` },
            { key: 'n', header: 'Name', render: (m) => m.name },
            {
              key: 's',
              header: 'Status',
              render: (m) => <StatusBadge status={m.status === 'applied' ? 'completed' : 'pending'} />,
            },
            { key: 'a', header: 'Applied', render: (m) => fmtDateTime(m.appliedAt) },
          ]}
        />
      </Card>
    </div>
  );
}
