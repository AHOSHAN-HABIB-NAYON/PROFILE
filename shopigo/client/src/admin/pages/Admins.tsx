import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, Button, Field, Input, Select, Sheet, Tabs, toast } from '../../components/ui';
import { DataTable, PageHeader, Panel, useMe } from '../components/kit';

interface AdminRow { id: number; name: string; email: string; phone: string | null; status: string; totp_enabled: number; passkeys: number; last_login_at: string | null; role_name: string; role_slug: string; role_id: number }
interface Roles { roles: Array<{ id: number; name: string; slug: string; is_system: number; permissions: string[] }>; permissions: Array<{ id: number; slug: string; name: string; group: string }> }

export default function Admins() {
  const qc = useQueryClient();
  const me = useMe();
  const [tab, setTab] = useState<'admins' | 'roles'>('admins');
  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api.get<AdminRow[]>('/api/admin/system/admins') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Roles>('/api/admin/system/roles') });
  const [edit, setEdit] = useState<{ id: number | null; name: string; email: string; phone: string; role_id: string; status: string; password: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ id: number | null; name: string; permissions: string[] } | null>(null);
  const save = useMutation({ mutationFn: () => { const b = { ...edit!, role_id: Number(edit!.role_id), password: edit!.password || undefined }; return edit!.id ? api.put(`/api/admin/system/admins/${edit!.id}`, b) : api.post('/api/admin/system/admins', b); }, onSuccess: () => { toast.success('Saved'); setEdit(null); void qc.invalidateQueries({ queryKey: ['admins'] }); }, onError: (e: Error) => toast.error(e.message) });
  const saveRole = useMutation({ mutationFn: () => (roleEdit!.id ? api.put(`/api/admin/system/roles/${roleEdit!.id}`, roleEdit) : api.post('/api/admin/system/roles', roleEdit)), onSuccess: () => { toast.success('Role saved'); setRoleEdit(null); void qc.invalidateQueries({ queryKey: ['roles'] }); }, onError: (e: Error) => toast.error(e.message) });
  const reset2fa = useMutation({ mutationFn: (id: number) => api.post(`/api/admin/system/admins/${id}/reset-2fa`), onSuccess: () => { toast.success('2FA and passkeys reset'); void qc.invalidateQueries({ queryKey: ['admins'] }); } });
  const groups = [...new Set(roles.data?.permissions.map((p) => p.group) ?? [])];
  return (
    <div>
      <PageHeader title="Admins & Roles" actions={tab === 'admins' ? <Button icon={<Plus className="size-4" />} onClick={() => setEdit({ id: null, name: '', email: '', phone: '', role_id: String(roles.data?.roles.find((r) => r.slug === 'order_staff')?.id ?? ''), status: 'active', password: '' })}>Add admin</Button> : <Button icon={<Plus className="size-4" />} onClick={() => setRoleEdit({ id: null, name: '', permissions: [] })}>New role</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ value: 'admins', label: 'Administrators' }, { value: 'roles', label: 'Roles & permissions' }]} />
      {tab === 'admins' ? (
        <Panel pad={false}>
          <DataTable rows={admins.data ?? []} loading={admins.isLoading} rowKey={(r) => r.id} onRowClick={(r) => setEdit({ id: r.id, name: r.name, email: r.email, phone: r.phone ?? '', role_id: String(r.role_id), status: r.status, password: '' })} columns={[
            { key: 'n', label: 'Admin', render: (a) => <span><b>{a.name}</b><span className="block text-[12px] text-muted">{a.email}</span></span> },
            { key: 'r', label: 'Role', render: (a) => <Badge tone={a.role_slug === 'super_admin' ? 'violet' : 'gray'}>{a.role_name}</Badge> },
            { key: 's', label: 'Security', render: (a) => <span className="flex gap-1">{a.totp_enabled ? <Badge tone="green">2FA</Badge> : null}{a.passkeys ? <Badge tone="green">{a.passkeys} passkey</Badge> : null}{!a.totp_enabled && !a.passkeys ? <Badge tone="amber">Password only</Badge> : null}</span> },
            { key: 'l', label: 'Last login', render: (a) => dateTime(a.last_login_at) },
            { key: 'st', label: 'Status', render: (a) => <Badge tone={a.status === 'active' ? 'green' : 'red'}>{a.status}</Badge> },
            { key: 'x', label: '', render: (a) => (me.data?.admin?.role === 'super_admin' && (a.totp_enabled || a.passkeys) ? <span onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" icon={<ShieldCheck className="size-4" />} onClick={() => reset2fa.mutate(a.id)}>Reset 2FA</Button></span> : null) },
          ]} />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.data?.roles.map((r) => (
            <Panel key={r.id} title={r.name} actions={r.slug !== 'super_admin' && <Button size="sm" variant="ghost" onClick={() => setRoleEdit({ id: r.id, name: r.name, permissions: r.permissions })}>Edit</Button>}>
              <p className="text-[13px] text-muted">{r.slug === 'super_admin' ? 'Full access, including updates, backups and restore.' : `${r.permissions.length} permissions`}</p>
            </Panel>
          ))}
        </div>
      )}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? 'Edit admin' : 'Add admin'} footer={<Button block loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Role"><Select value={edit.role_id} onChange={(e) => setEdit({ ...edit, role_id: e.target.value })}>{roles.data?.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="disabled">Disabled</option></Select></Field>
          <Field label={edit.id ? 'New password (optional)' : 'Password'} hint="10+ chars, upper & lower case, number"><Input type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
        </div>}
      </Sheet>
      <Sheet open={Boolean(roleEdit)} onClose={() => setRoleEdit(null)} wide title={roleEdit?.id ? 'Edit role' : 'New role'} footer={<Button block loading={saveRole.isPending} onClick={() => saveRole.mutate()}>Save role</Button>}>
        {roleEdit && <div className="space-y-4">
          <Field label="Role name"><Input value={roleEdit.name} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} /></Field>
          {groups.map((g) => (
            <div key={g}><p className="mb-1.5 text-[12px] font-bold text-muted uppercase">{g}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">{roles.data!.permissions.filter((p) => p.group === g).map((p) => (
                <label key={p.slug} className="flex items-center gap-2 rounded-xl bg-soft px-3 py-2 text-[13px]"><input type="checkbox" className="accent-brand-500" checked={roleEdit.permissions.includes(p.slug)} onChange={(e) => setRoleEdit({ ...roleEdit, permissions: e.target.checked ? [...roleEdit.permissions, p.slug] : roleEdit.permissions.filter((x) => x !== p.slug) })} />{p.name}</label>
              ))}</div>
            </div>
          ))}
        </div>}
      </Sheet>
    </div>
  );
}
