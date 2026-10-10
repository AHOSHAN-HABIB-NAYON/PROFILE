import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Loading } from '../components/ui';
import { api, errMsg } from '../lib/api';

type OurApp = { id: number; name: string; subtitle: string; logoUrl: string | null; linkUrl: string; sortOrder: number; isActive: boolean; clicks: number };

export default function OurApps() {
  const list = useQuery({ queryKey: ['our-apps'], queryFn: () => api<{ items: OurApp[]; enabled: boolean }>('/our-apps') });
  const [edit, setEdit] = useState<Partial<OurApp> | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const open = (a: Partial<OurApp>) => (setErr(null), setLogo(a.logoUrl ?? null), setEdit(a));
  const upload = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('file', file);
      setLogo((await api('/promos/logo', { form })).url);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setUploading(false);
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: f.get('name'), subtitle: f.get('subtitle') || '', linkUrl: String(f.get('linkUrl') ?? '').trim(), logoUrl: logo, sortOrder: Number(f.get('sortOrder') || 0), isActive: f.get('isActive') === 'on' };
    try {
      await api(edit?.id ? `/our-apps/${edit.id}` : '/our-apps', { method: edit?.id ? 'PUT' : 'POST', body });
      setEdit(null);
      void list.refetch();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  const remove = async (a: OurApp) => {
    if (!confirm(`Remove “${a.name}”?`)) return;
    await api(`/our-apps/${a.id}`, { method: 'DELETE' }).catch((e) => alert(errMsg(e)));
    void list.refetch();
  };
  const setEnabled = async (enabled: boolean) => {
    await api('/our-apps/enabled', { method: 'PUT', body: { enabled } }).catch((e) => alert(errMsg(e)));
    void list.refetch();
  };

  const enabled = list.data?.enabled ?? true;
  return (
    <>
      <div className="head">
        <h1>Our apps</h1>
        <button className="btn primary" onClick={() => open({ isActive: true, sortOrder: (list.data?.items.length ?? 0) + 1 })}><Icon name="plus" size={18} /> Add app</button>
      </div>
      <div className="card row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <b>Show “More apps from us” on Home</b>
          <p className="small muted">Your other apps are listed under “Play by category”. Play Store links open the Play Store app; other links open the browser.</p>
        </div>
        <label className="row" style={{ gap: 8, fontWeight: 700 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => void setEnabled(e.target.checked)} /> {enabled ? 'On' : 'Off'}
        </label>
      </div>

      {edit && (
        <form className="card form mt" onSubmit={submit}>
          <h2>{edit.id ? 'Edit app' : 'Add app'}</h2>
          {err && <p className="err">{err}</p>}
          <div className="field">
            <label>Logo (use the app’s real Play Store icon, square PNG)</label>
            <div className="color-row">
              {logo ? <img src={logo} alt="Logo preview" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 12, background: '#fff', border: '1px solid var(--border)' }} /> : <span className="small muted">No logo yet.</span>}
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : logo ? 'Replace' : 'Upload logo'}
                <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          <div className="cols">
            <div className="field"><label htmlFor="an">App name</label><input id="an" name="name" className="input" required maxLength={60} defaultValue={edit.name ?? ''} /></div>
            <div className="field"><label htmlFor="as">Short line (optional)</label><input id="as" name="subtitle" className="input" maxLength={120} defaultValue={edit.subtitle ?? ''} placeholder="e.g. Free BCS model tests" /></div>
          </div>
          <div className="field"><label htmlFor="al">Link</label><input id="al" name="linkUrl" className="input" required maxLength={500} defaultValue={edit.linkUrl ?? ''} placeholder="https://play.google.com/store/apps/details?id=…" /></div>
          <div className="cols">
            <div className="field"><label htmlFor="ao">Order</label><input id="ao" name="sortOrder" type="number" min={0} max={999} className="input" defaultValue={edit.sortOrder ?? 0} /></div>
          </div>
          <label className="row"><input type="checkbox" name="isActive" defaultChecked={edit.isActive ?? true} /> Show this app</label>
          <div className="row">
            <button className="btn primary">Save</button>
            <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card mt table-wrap">
        {list.isLoading ? <Loading /> : !list.data?.items.length ? <p className="muted small">No apps yet — add 2–3 of your apps.</p> : (
          <table>
            <thead><tr><th></th><th>App</th><th>Clicks</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td>{a.logoUrl ? <img src={a.logoUrl} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 10, background: '#fff' }} /> : <span className="cat-ic"><Icon name="smartphone" size={18} /></span>}</td>
                  <td><b>{a.name}</b><div className="small faint" style={{ wordBreak: 'break-all' }}>{a.linkUrl}</div></td>
                  <td>{a.clicks}</td>
                  <td>{a.isActive ? 'Shown' : 'Hidden'}</td>
                  <td className="row"><button className="btn sm" onClick={() => open(a)}>Edit</button><button className="btn sm danger" onClick={() => void remove(a)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
