import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Loading, Modal, fmtDate } from '../components/ui';
import { Icon } from '../components/Icon';
import { api, errMsg } from '../lib/api';

export default function Admins() {
  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api('/admins') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api('/roles') });
  const [edit, setEdit] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (edit.id) await api(`/admins/${edit.id}`, { method: 'PUT', body: { name: f.get('name'), roleId: Number(f.get('roleId')), isActive: f.get('isActive') === 'on', ...(f.get('password') ? { password: f.get('password') } : {}) } });
      else await api('/admins', { body: { email: f.get('email'), name: f.get('name'), password: f.get('password'), roleId: Number(f.get('roleId')) } });
      setEdit(null);
      void admins.refetch();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };

  const toggle = async (role: any, perm: string) => {
    const next = role.permissions.includes(perm) ? role.permissions.filter((p: string) => p !== perm) : [...role.permissions, perm];
    try {
      await api(`/roles/${role.id}/permissions`, { method: 'PUT', body: { permissions: next } });
      setSaved(`${role.name} updated`);
      void roles.refetch();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  return (
    <>
      <div className="head"><h1>Admins & roles</h1><button className="btn primary" onClick={() => (setErr(null), setEdit({ isActive: 1 }))}><Icon name="plus" size={16} />Add admin</button></div>
      <div className="card table-wrap">
        {admins.isLoading ? <Loading /> : (
          <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr></thead>
            <tbody>{admins.data.items.map((a: any) => <tr key={a.id}><td><b>{a.name}</b></td><td>{a.email}</td><td><span className="badge blue">{a.role}</span></td><td>{a.isActive ? <span className="badge green">active</span> : <span className="badge red">disabled</span>}</td><td className="small">{fmtDate(a.lastLoginAt)}</td><td><button className="btn sm" onClick={() => (setErr(null), setEdit(a))}>Edit</button></td></tr>)}</tbody></table>
        )}
      </div>
      <section className="card mt table-wrap">
        <h2>Role permissions</h2>
        <p className="small muted">Super Admin always has every permission. Changes take effect within 30 seconds and are audit-logged.</p>
        {saved && <p className="ok">{saved}</p>}
        {roles.isLoading ? <Loading /> : (
          <div className="table-wrap"><table className="matrix mt keep"><thead><tr><th>Permission</th>{roles.data.roles.map((r: any) => <th key={r.id}>{r.name}</th>)}</tr></thead>
            <tbody>{roles.data.permissions.map((p: any) => (
              <tr key={p.key}><td><code>{p.key}</code><div className="small faint">{p.description}</div></td>
                {roles.data.roles.map((r: any) => <td key={r.id}><input type="checkbox" aria-label={`${r.name}: ${p.key}`} checked={r.key === 'super_admin' || r.permissions.includes(p.key)} disabled={r.key === 'super_admin'} onChange={() => void toggle(r, p.key)} /></td>)}</tr>
            ))}</tbody></table></div>
        )}
      </section>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New admin'}>
        {edit && <form className="form" onSubmit={submit}>
          {err && <p className="err">{err}</p>}
          {!edit.id && <div className="field"><label htmlFor="ad-email">Email</label><input id="ad-email" name="email" type="email" className="input" required /></div>}
          <div className="field"><label htmlFor="ad-name">Name</label><input id="ad-name" name="name" className="input" required defaultValue={edit.name} /></div>
          <div className="field"><label htmlFor="ad-roleId">Role</label><select id="ad-roleId" name="roleId" className="input" defaultValue={edit.roleId}>{roles.data?.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="field"><label htmlFor="ad-password">{edit.id ? 'New password (optional)' : 'Password (min 12 characters)'}</label><input id="ad-password" name="password" type="password" className="input" minLength={12} required={!edit.id} autoComplete="new-password" /></div>
          {edit.id && <label className="row"><input type="checkbox" name="isActive" defaultChecked={!!edit.isActive} /> Active</label>}
          <button className="btn primary">{edit.id ? 'Save admin' : 'Create admin'}</button>
        </form>}
      </Modal>
    </>
  );
}
