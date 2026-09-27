'use client';
import { useState } from 'react';
import { fmtDateTime } from '@/lib/format';
import { AdminTitle } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { Input, Row } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/sheet';

interface L {
  id: number;
  adminId: number | null;
  adminEmail: string | null;
  userId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
}

export default function AdminAudit() {
  const [f, setF] = useState({ action: '', target: '' });
  const [sel, setSel] = useState<L | null>(null);
  return (
    <div>
      <AdminTitle
        title="Audit logs"
        subtitle="Every sensitive administrative action, with before/after state."
      />
      <AdminList<L>
        path="/admin/audit"
        filters={{ action: f.action || undefined, target: f.target || undefined }}
        rowKey={(l) => String(l.id)}
        onRowClick={setSel}
        mobileTitle={(l) => l.action}
        toolbar={
          <div className="grid sm:grid-cols-2 gap-2">
            <Input
              icon="search"
              placeholder="Action (e.g. withdrawal, user.)"
              value={f.action}
              onChange={(e) => setF({ ...f, action: e.target.value })}
            />
            <Input
              placeholder="Target ID"
              value={f.target}
              onChange={(e) => setF({ ...f, target: e.target.value })}
            />
          </div>
        }
        columns={[
          { key: 't', header: 'Time', render: (l) => fmtDateTime(l.createdAt) },
          { key: 'a', header: 'Admin', render: (l) => l.adminEmail ?? '—' },
          {
            key: 'ac',
            header: 'Action',
            render: (l) => <span className="font-mono text-[12px]">{l.action}</span>,
          },
          {
            key: 'tg',
            header: 'Target',
            render: (l) => (l.targetType ? `${l.targetType} #${l.targetId}` : '—'),
          },
          { key: 'ip', header: 'IP', render: (l) => l.ip ?? '—' },
        ]}
      />
      <Sheet open={sel !== null} onClose={() => setSel(null)} title={sel?.action} size="lg">
        {sel && (
          <div className="space-y-3">
            <Row label="Admin" value={sel.adminEmail ?? '—'} />
            <Row label="Target" value={`${sel.targetType ?? ''} ${sel.targetId ?? ''}`} />
            <Row label="Time" value={fmtDateTime(sel.createdAt)} />
            <p className="text-[13px] font-semibold">Before</p>
            <pre className="text-[12px] bg-card-2 rounded-xl p-3 overflow-auto max-h-60">
              {JSON.stringify(sel.beforeData, null, 2)}
            </pre>
            <p className="text-[13px] font-semibold">After</p>
            <pre className="text-[12px] bg-card-2 rounded-xl p-3 overflow-auto max-h-60">
              {JSON.stringify(sel.afterData, null, 2)}
            </pre>
          </div>
        )}
      </Sheet>
    </div>
  );
}
