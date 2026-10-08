import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Loading, Modal } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

export default function Categories() {
  const { can } = useAdmin();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: async () => (await api('/categories')).items as any[] });
  const [edit, setEdit] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['categories'] });
  const move = async (i: number, dir: -1 | 1) => {
    const ids = data!.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api('/categories/reorder', { body: { ids } });
    refresh();
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { slug: f.get('slug'), name: f.get('name'), nameBn: f.get('nameBn') || null, icon: f.get('icon'), description: f.get('description') || null, color: null, isActive: f.get('isActive') === 'on' };
    try {
      if (edit.id) await api(`/categories/${edit.id}`, { method: 'PUT', body });
      else await api('/categories', { body });
      setEdit(null);
      refresh();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  const manage = can('categories.manage');
  return (
    <>
      <div className="head"><h1>Categories</h1>{manage && <button className="btn primary" onClick={() => (setErr(null), setEdit({ isActive: true, icon: '🧠' }))}>+ Add category</button>}</div>
      <div className="card table-wrap">
        {isLoading ? <Loading /> : (
          <table>
            <thead><tr><th>Order</th><th>Icon</th><th>Name</th><th>বাংলা</th><th>Slug</th><th>Questions</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data!.map((c, i) => (
                <tr key={c.id}>
                  <td>{manage && <><button className="btn sm ghost" aria-label="Move up" onClick={() => void move(i, -1)}>↑</button><button className="btn sm ghost" aria-label="Move down" onClick={() => void move(i, 1)}>↓</button></>}</td>
                  <td style={{ fontSize: 20 }}>{c.icon}</td><td><b>{c.name}</b><div className="small faint">{c.description}</div></td><td>{c.nameBn}</td><td><code>{c.slug}</code></td><td>{c.questionCount}</td>
                  <td>{c.isActive ? <span className="badge green">enabled</span> : <span className="badge">disabled</span>}</td>
                  <td>{manage && <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" onClick={() => (setErr(null), setEdit(c))}>Edit</button>
                    <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Delete category "${c.name}"? Its questions stop being served.`) && void api(`/categories/${c.id}`, { method: 'DELETE' }).then(refresh)}>Delete</button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New category'}>
        {edit && (
          <form className="form" onSubmit={submit}>
            {err && <p className="err">{err}</p>}
            <div className="cols">
              <div className="field"><label htmlFor="n">Name</label><input id="n" name="name" className="input" required defaultValue={edit.name} /></div>
              <div className="field"><label htmlFor="nb">Name (বাংলা)</label><input id="nb" name="nameBn" className="input" defaultValue={edit.nameBn ?? ''} /></div>
              <div className="field"><label htmlFor="s">Slug</label><input id="s" name="slug" className="input" required pattern="[a-z0-9-]{2,60}" defaultValue={edit.slug} /></div>
              <div className="field"><label htmlFor="i">Icon (emoji)</label><input id="i" name="icon" className="input" required maxLength={16} defaultValue={edit.icon} /></div>
            </div>
            <div className="field"><label htmlFor="ds">Description</label><input id="ds" name="description" className="input" maxLength={300} defaultValue={edit.description ?? ''} /></div>
            <label className="row"><input type="checkbox" name="isActive" defaultChecked={edit.isActive} /> Enabled</label>
            <button className="btn primary">Save</button>
          </form>
        )}
      </Modal>
    </>
  );
}
