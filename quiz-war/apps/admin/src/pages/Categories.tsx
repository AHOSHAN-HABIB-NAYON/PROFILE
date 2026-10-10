import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { CATEGORY_ICONS, Icon, IconPicker, categoryIcon } from '../components/Icon';
import { Loading, Modal } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

const hasKey = (k: string) => k in CATEGORY_ICONS;

export default function Categories() {
  const { can } = useAdmin();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: async () => (await api('/categories')).items as any[] });
  const [edit, setEdit] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const open = (c: any) => (setErr(null), setColor(c.color ?? null), setIconUrl(c.iconUrl ?? null), setEdit(c));
  const uploadIcon = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', file);
      setIconUrl((await api('/categories/icon', { form })).url);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setUploading(false);
    }
  };
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
    const body = { slug: f.get('slug'), name: f.get('name'), nameBn: f.get('nameBn') || null, icon: f.get('icon'), iconUrl, description: f.get('description') || null, color, isActive: f.get('isActive') === 'on' };
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
      <div className="head"><h1>Categories</h1>{manage && <button className="btn primary" onClick={() => open({ isActive: true, icon: 'brain' })}><Icon name="plus" size={16} />Add category</button>}</div>
      <div className="card table-wrap">
        {isLoading ? <Loading /> : (
          <table>
            <thead><tr><th>Order</th><th>Icon</th><th>Name</th><th>বাংলা</th><th>Slug</th><th>Questions</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data!.map((c, i) => (
                <tr key={c.id}>
                  <td>{manage && <><div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><button className="btn sm ghost icon-btn" aria-label={`Move ${c.name} up`} title="Move up" disabled={i === 0} onClick={() => void move(i, -1)}><Icon name="arrow-up" size={16} /></button><button className="btn sm ghost icon-btn" aria-label={`Move ${c.name} down`} title="Move down" disabled={i === data!.length - 1} onClick={() => void move(i, 1)}><Icon name="arrow-down" size={16} /></button></div></>}</td>
                  <td><span className="cat-ic" style={c.color ? { color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` } : undefined} title={c.iconUrl ? 'Custom icon' : hasKey(c.icon) ? c.icon : `Legacy icon “${c.icon}” — pick a new one`}>{c.iconUrl ? <img src={c.iconUrl} alt="" width={22} height={22} style={{ objectFit: 'contain' }} /> : <Icon name={categoryIcon(c)} size={20} />}</span></td><td><b>{c.name}</b><div className="small faint">{c.description}</div></td><td>{c.nameBn}</td><td><code>{c.slug}</code></td><td>{c.questionCount}</td>
                  <td>{c.isActive ? <span className="badge green">enabled</span> : <span className="badge">disabled</span>}</td>
                  <td>{manage && <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" onClick={() => open(c)}>Edit</button>
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
            </div>
            <div className="field">
              <label>Custom icon (optional) — SVG, PNG, JPG or WebP</label>
              <div className="color-row">
                {iconUrl ? <img src={iconUrl} alt="Custom icon preview" width={44} height={44} style={{ objectFit: 'contain', borderRadius: 10, background: 'var(--surface-2)' }} /> : <span className="small muted">No custom icon — the built-in icon below is used.</span>}
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : iconUrl ? 'Replace' : 'Upload icon'}
                  <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadIcon(f); e.target.value = ''; }} />
                </label>
                {iconUrl && <button type="button" className="btn sm" onClick={() => setIconUrl(null)}>Use built-in icon</button>}
              </div>
              <p className="small faint">Square artwork works best. SVGs are rendered to a sharp image on upload.</p>
            </div>
            <IconPicker name="icon" label={iconUrl ? 'Built-in icon (used if the custom icon is removed)' : 'Icon (shown in the player app)'} options={CATEGORY_ICONS} defaultValue={categoryIcon(edit)} color={color} />
            <div className="field">
              <label htmlFor="cc">Colour</label>
              <div className="color-row">
                <input id="cc" type="color" value={color ?? '#1d4ed8'} onChange={(e) => setColor(e.target.value)} />
                <span className="small muted grow">{color ? <code>{color}</code> : 'Default theme colour'}</span>
                {color && <button type="button" className="btn sm" onClick={() => setColor(null)}>Use default colour</button>}
              </div>
            </div>
            <div className="field"><label htmlFor="ds">Description</label><input id="ds" name="description" className="input" maxLength={300} defaultValue={edit.description ?? ''} /></div>
            <label className="row"><input type="checkbox" name="isActive" defaultChecked={edit.isActive} /> Enabled</label>
            <button className="btn primary">{edit.id ? 'Save category' : 'Create category'}</button>
          </form>
        )}
      </Modal>
    </>
  );
}
