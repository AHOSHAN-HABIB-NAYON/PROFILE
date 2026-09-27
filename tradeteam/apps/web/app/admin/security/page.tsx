'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, put, del, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { AdminTitle, useAdmin, useCan } from '@/components/admin/admin-shell';
import { AdminList } from '@/components/admin/list';
import { SimpleForm, type FieldDef } from '@/components/admin/form';
import {
  Badge,
  Button,
  Card,
  InfoBox,
  Input,
  SectionTitle,
  Select,
  StatusBadge,
  Tabs,
} from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { Sheet } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { registerPasskey, defaultPasskeyName } from '@/components/auth/passkey';

interface Adm {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  twoFactor: number;
  passkeys: number;
}
interface Sess {
  id: number;
  adminId: number;
  email: string;
  ip: string;
  userAgent: string;
  method: string;
  mfa: number;
  createdAt: string;
  lastSeenAt: string;
}
const NEW_ADMIN: FieldDef[] = [
  { name: 'name', label: 'Name', required: true },
  { name: 'email', label: 'Email', required: true },
  { name: 'password', label: 'Temporary password (min 10, mixed case + digit)', required: true },
  {
    name: 'role',
    label: 'Role',
    type: 'select',
    options: [
      { value: 'support', label: 'Support (read-only)' },
      { value: 'admin', label: 'Admin' },
      { value: 'super_admin', label: 'Super admin' },
    ],
  },
];

function MySecurity() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'my-security'],
    queryFn: () =>
      get<{
        twoFactor: { enabled: boolean; backupCodesRemaining: number };
        passkeys: { id: string; name: string; created_at: string; last_used_at: string | null }[];
      }>('/admin/auth/security'),
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const add = useMutation({
    mutationFn: () => registerPasskey(defaultPasskeyName(), '/admin/auth/passkey/register'),
    onSuccess: () => (toast('Passkey added'), qc.invalidateQueries({ queryKey: ['admin', 'my-security'] })),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  const rm = useMutation({
    mutationFn: (id: string) => del(`/admin/auth/passkeys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'my-security'] }),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  const chpw = useMutation({
    mutationFn: () => post('/admin/auth/password', pw),
    onSuccess: () => (toast('Password changed'), setPw({ currentPassword: '', newPassword: '' })),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <SectionTitle
          action={
            <Button size="sm" icon="plus" loading={add.isPending} onClick={() => add.mutate()}>
              Add passkey
            </Button>
          }
        >
          My second factors
        </SectionTitle>
        <p className="text-sm mb-2">
          Authenticator app:{' '}
          {q.data?.twoFactor.enabled ? <Badge tone="up">enabled</Badge> : <Badge tone="warn">not set</Badge>}{' '}
          {q.data?.twoFactor.enabled && (
            <span className="text-muted text-[12px]">
              · {q.data.twoFactor.backupCodesRemaining} backup codes
            </span>
          )}
        </p>
        {q.data?.passkeys.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between py-2 border-b border-line last:border-0 text-sm"
          >
            <span>
              <b>{p.name}</b>{' '}
              <span className="text-muted text-[12px]">· added {fmtDateTime(p.created_at)}</span>
            </span>
            <Button size="sm" variant="danger" onClick={() => rm.mutate(p.id)}>
              Remove
            </Button>
          </div>
        ))}
      </Card>
      <Card className="space-y-3">
        <SectionTitle>Change my password</SectionTitle>
        <Input
          label="Current password"
          type="password"
          value={pw.currentPassword}
          onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
        />
        <Input
          label="New password"
          type="password"
          value={pw.newPassword}
          onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
        />
        <Button
          loading={chpw.isPending}
          disabled={!pw.currentPassword || pw.newPassword.length < 10}
          onClick={() => chpw.mutate()}
        >
          Update password
        </Button>
      </Card>
    </div>
  );
}

function IpAllowlist() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => get<{ settings: Record<string, { value: unknown }> }>('/admin/settings'),
  });
  const [text, setText] = useState('');
  useEffect(() => {
    const v = q.data?.settings['admin.ip_allowlist']?.value as string[] | undefined;
    if (v) setText(v.join('\n'));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      put('/admin/settings', {
        'admin.ip_allowlist': text
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => (
      toast('IP restrictions saved'),
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
    ),
    onError: (e) => toast.error('Not saved', errorMessage(e)),
  });
  return (
    <Card className="space-y-3 max-w-xl">
      <SectionTitle>Admin IP restrictions</SectionTitle>
      <InfoBox>
        One IPv4 address, IPv4 CIDR range or IPv6 address per line. Empty = no restriction. Your current IP
        must be included.
      </InfoBox>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full rounded-xl border border-line-strong bg-elev p-3 font-mono text-sm outline-none"
        placeholder={'203.0.113.10\n10.0.0.0/8'}
      />
      <Button loading={save.isPending} onClick={() => save.mutate()}>
        Save allowlist
      </Button>
    </Card>
  );
}

export default function AdminSecurity() {
  const me = useAdmin().data;
  const canSec = useCan('security.manage');
  const canAudit = useCan('audit.view');
  const qc = useQueryClient();
  const [tab, setTab] = useState('me');
  const [create, setCreate] = useState(false);
  const admins = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: () => get<{ items: Adm[] }>('/admin/admins'),
    enabled: canSec && tab === 'admins',
  });
  const sessions = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => get<{ items: Sess[] }>('/admin/sessions'),
    enabled: canSec && tab === 'sessions',
  });
  const add = useMutation({
    mutationFn: (b: Record<string, unknown>) => post('/admin/admins', b),
    onSuccess: () => (
      toast('Admin created — they must enrol a second factor at first sign-in'),
      setCreate(false),
      qc.invalidateQueries({ queryKey: ['admin', 'admins'] })
    ),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  const upd = useMutation({
    mutationFn: (b: { id: number; role?: string; status?: string }) => patch(`/admin/admins/${b.id}`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] }),
    onError: (e) => toast.error('Failed', errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => del(`/admin/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
  });
  const tabs = [
    { value: 'me', label: 'My security' },
    ...(canSec
      ? [
          { value: 'admins', label: 'Administrators' },
          { value: 'sessions', label: 'Sessions' },
          { value: 'ip', label: 'IP restrictions' },
        ]
      : []),
    ...(canAudit
      ? [
          { value: 'logins', label: 'Login history' },
          { value: 'events', label: 'Security events' },
        ]
      : []),
  ];
  return (
    <div className="space-y-4">
      <AdminTitle
        title="Security"
        actions={
          tab === 'admins' && (
            <Button icon="plus" onClick={() => setCreate(true)}>
              New admin
            </Button>
          )
        }
      />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      {tab === 'me' && <MySecurity />}
      {tab === 'ip' && <IpAllowlist />}
      {tab === 'admins' && (
        <Card padded={false}>
          <DataTable
            rows={admins.data?.items}
            loading={admins.isLoading}
            rowKey={(a) => String(a.id)}
            columns={[
              {
                key: 'n',
                header: 'Admin',
                render: (a) => (
                  <span>
                    <b>{a.name}</b>
                    <span className="block text-[12px] text-muted">{a.email}</span>
                  </span>
                ),
              },
              {
                key: 'r',
                header: 'Role',
                render: (a) =>
                  String(a.id) === me?.id ? (
                    <Badge tone="accent">{a.role}</Badge>
                  ) : (
                    <Select
                      value={a.role}
                      onChange={(e) => upd.mutate({ id: a.id, role: e.target.value })}
                      aria-label="Role"
                    >
                      {['support', 'admin', 'super_admin'].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  ),
              },
              { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              {
                key: 'm',
                header: '2nd factor',
                render: (a) =>
                  a.twoFactor || a.passkeys ? (
                    <Badge tone="up">
                      {[a.twoFactor && 'totp', a.passkeys && `${a.passkeys} passkey`]
                        .filter(Boolean)
                        .join(' + ')}
                    </Badge>
                  ) : (
                    <Badge tone="warn">not enrolled</Badge>
                  ),
              },
              { key: 'l', header: 'Last login', render: (a) => fmtDateTime(a.lastLoginAt) },
              {
                key: 'x',
                header: '',
                align: 'right',
                render: (a) =>
                  String(a.id) !== me?.id ? (
                    <Button
                      size="sm"
                      variant={a.status === 'active' ? 'danger' : 'secondary'}
                      onClick={() =>
                        upd.mutate({ id: a.id, status: a.status === 'active' ? 'disabled' : 'active' })
                      }
                    >
                      {a.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </Card>
      )}
      {tab === 'sessions' && (
        <Card padded={false}>
          <DataTable
            rows={sessions.data?.items}
            loading={sessions.isLoading}
            rowKey={(s) => String(s.id)}
            columns={[
              { key: 'e', header: 'Admin', render: (s) => s.email },
              { key: 'ip', header: 'IP', render: (s) => s.ip },
              { key: 'm', header: 'Method', render: (s) => `${s.method}${s.mfa ? ' (MFA)' : ''}` },
              { key: 'c', header: 'Started', render: (s) => fmtDateTime(s.createdAt) },
              { key: 'l', header: 'Last seen', render: (s) => fmtDateTime(s.lastSeenAt) },
              {
                key: 'x',
                header: '',
                align: 'right',
                render: (s) => (
                  <Button size="sm" variant="danger" onClick={() => revoke.mutate(s.id)}>
                    Revoke
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
      {tab === 'logins' && (
        <AdminList<Record<string, string | number>>
          path="/admin/login-history"
          queryKey="logins"
          filters={{ principal: 'admin' }}
          rowKey={(r) => String(r.id)}
          columns={['createdAt', 'email', 'ip', 'method', 'success', 'reason'].map((k) => ({
            key: k,
            header: k,
            render: (r: Record<string, string | number>) =>
              k === 'createdAt' ? (
                fmtDateTime(String(r[k]))
              ) : k === 'success' ? (
                r[k] ? (
                  <Badge tone="up">ok</Badge>
                ) : (
                  <Badge tone="down">failed</Badge>
                )
              ) : (
                String(r[k] ?? '—')
              ),
          }))}
        />
      )}
      {tab === 'events' && (
        <AdminList<Record<string, string | number>>
          path="/admin/security-events"
          filters={{}}
          rowKey={(r) => String(r.id)}
          columns={['createdAt', 'principalType', 'principalId', 'type', 'ip'].map((k) => ({
            key: k,
            header: k,
            render: (r: Record<string, string | number>) =>
              k === 'createdAt' ? fmtDateTime(String(r[k])) : String(r[k] ?? '—'),
          }))}
        />
      )}
      <Sheet open={create} onClose={() => setCreate(false)} title="New administrator">
        <SimpleForm
          fields={NEW_ADMIN}
          initial={{ role: 'support' }}
          busy={add.isPending}
          submitLabel="Create admin"
          onSubmit={(v) => add.mutate(v)}
        />
      </Sheet>
    </div>
  );
}
