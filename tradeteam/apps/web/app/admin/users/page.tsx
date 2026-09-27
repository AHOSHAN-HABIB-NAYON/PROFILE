'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminTitle } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { Badge, Input, Select, StatusBadge } from '@/components/ui/primitives';
import { fmtDateTime } from '@/lib/format';

interface U {
  id: number;
  uid: string;
  email: string;
  name: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactor: number;
  passkeys: number;
}

export default function AdminUsers() {
  const router = useRouter();
  const [f, setF] = useState({ q: '', status: '', verified: '' });
  return (
    <div>
      <AdminTitle title="Users" />
      <AdminList<U>
        path="/admin/users"
        filters={{ q: f.q || undefined, status: f.status || undefined, verified: f.verified || undefined }}
        rowKey={(u) => String(u.id)}
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        mobileTitle={(u) => u.email}
        toolbar={
          <div className="grid sm:grid-cols-3 gap-2">
            <Input
              placeholder="Search email, name or UID"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              icon="search"
            />
            <Select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              aria-label="Status"
            >
              <option value="">All statuses</option>
              {['active', 'suspended', 'locked', 'closed'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select
              value={f.verified}
              onChange={(e) => setF({ ...f, verified: e.target.value })}
              aria-label="Verified"
            >
              <option value="">Any verification</option>
              <option value="yes">Email verified</option>
              <option value="no">Unverified</option>
            </Select>
          </div>
        }
        columns={[
          { key: 'uid', header: 'UID', render: (u) => <span className="num">{u.uid}</span> },
          {
            key: 'user',
            header: 'User',
            hideOnMobile: true,
            render: (u) => (
              <span>
                <span className="font-semibold block">{u.name}</span>
                <span className="text-muted text-[12px]">{u.email}</span>
              </span>
            ),
          },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          {
            key: 'sec',
            header: 'Security',
            render: (u) => (
              <span className="flex gap-1">
                {u.emailVerifiedAt ? <Badge tone="up">email</Badge> : <Badge tone="warn">unverified</Badge>}
                {u.twoFactor > 0 && <Badge tone="accent">2fa</Badge>}
                {u.passkeys > 0 && <Badge tone="accent">passkey</Badge>}
              </span>
            ),
          },
          { key: 'created', header: 'Joined', render: (u) => fmtDateTime(u.createdAt) },
          { key: 'last', header: 'Last login', render: (u) => fmtDateTime(u.lastLoginAt) },
        ]}
      />
    </div>
  );
}
