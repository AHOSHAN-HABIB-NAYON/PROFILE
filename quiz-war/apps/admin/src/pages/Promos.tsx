import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Loading } from '../components/ui';
import { api, errMsg } from '../lib/api';

type Promo = {
  id: number; title: string; body: string; ctaLabel: string; linkUrl: string; logoUrl: string | null; color: string | null;
  placements: string[]; weight: number; isActive: boolean; startsAt: string | null; endsAt: string | null; impressions: number; clicks: number;
};
const BLANK: Partial<Promo> = { placements: ['home', 'result'], weight: 1, isActive: true };
const local = (d: string | null | undefined) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

export default function Promos() {
  const list = useQuery({ queryKey: ['promos'], queryFn: () => api<{ items: Promo[] }>('/promos') });
  const [edit, setEdit] = useState<Partial<Promo> | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [color, setColor] = useState('#2563eb');
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const open = (p: Partial<Promo>) => (setErr(null), setLogo(p.logoUrl ?? null), setColor(p.color ?? '#2563eb'), setEdit(p));
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
    const placements = ['home', 'result'].filter((k) => f.get(`pl-${k}`) === 'on');
    const iso = (k: string) => (f.get(k) ? new Date(String(f.get(k))).toISOString() : null);
    const body = {
      title: f.get('title'), body: f.get('body') || '', ctaLabel: f.get('ctaLabel') || '', linkUrl: String(f.get('linkUrl') ?? '').trim(),
      logoUrl: logo, color, placements, weight: Number(f.get('weight') || 1), isActive: f.get('isActive') === 'on', startsAt: iso('startsAt'), endsAt: iso('endsAt'),
    };
    if (!placements.length) return setErr('Pick at least one place to show it.');
    try {
      await api(edit?.id ? `/promos/${edit.id}` : '/promos', { method: edit?.id ? 'PUT' : 'POST', body });
      setEdit(null);
      void list.refetch();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  const remove = async (p: Promo) => {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await api(`/promos/${p.id}`, { method: 'DELETE' }).catch((e) => alert(errMsg(e)));
    void list.refetch();
  };
  const toggle = async (p: Promo) => {
    const { id, impressions, clicks, ...rest } = p;
    await api(`/promos/${id}`, { method: 'PUT', body: { ...rest, isActive: !p.isActive } }).catch((e) => alert(errMsg(e)));
    void list.refetch();
  };

  return (
    <>
      <div className="head">
        <h1>Promotions</h1>
        <button className="btn primary" onClick={() => open(BLANK)}><Icon name="plus" size={18} /> New promotion</button>
      </div>
      <p className="small muted">A card with your logo, text and link pops up in the player app: on Home now and then (at most every 3 hours per player) and after every second finished match. Play Store links open the Play Store app; other links open the browser.</p>

      {edit && (
        <form className="card form mt" onSubmit={submit}>
          <h2>{edit.id ? 'Edit promotion' : 'New promotion'}</h2>
          {err && <p className="err">{err}</p>}
          <div className="field">
            <label>Logo (square works best) — SVG, PNG, JPG or WebP</label>
            <div className="color-row">
              {logo ? <img src={logo} alt="Logo preview" width={56} height={56} style={{ objectFit: 'cover', borderRadius: '50%', background: '#fff', border: '1px solid var(--border)' }} /> : <span className="small muted">No logo — a simple icon is shown.</span>}
              <label className="btn sm" style={{ cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : logo ? 'Replace' : 'Upload logo'}
                <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
              </label>
              {logo && <button type="button" className="btn sm" onClick={() => setLogo(null)}>Remove</button>}
            </div>
          </div>
          <div className="field"><label htmlFor="pt">Title</label><input id="pt" name="title" className="input" required minLength={2} maxLength={80} defaultValue={edit.title ?? ''} placeholder="e.g. Try our new app" /></div>
          <div className="field"><label htmlFor="pb">Text</label><textarea id="pb" name="body" className="input" maxLength={300} defaultValue={edit.body ?? ''} /></div>
          <div className="cols">
            <div className="field"><label htmlFor="pl">Link</label><input id="pl" name="linkUrl" className="input" required maxLength={500} defaultValue={edit.linkUrl ?? ''} placeholder="https://play.google.com/store/apps/details?id=… or https://…" /></div>
            <div className="field"><label htmlFor="pc">Button text (optional)</label><input id="pc" name="ctaLabel" className="input" maxLength={30} defaultValue={edit.ctaLabel ?? ''} placeholder="Install / Open / Visit" /></div>
          </div>
          <div className="field">
            <label htmlFor="pcol">Colour</label>
            <div className="color-row"><input id="pcol" type="color" value={color} onChange={(e) => setColor(e.target.value)} /><code className="small">{color}</code></div>
          </div>
          <div className="field">
            <label>Show it</label>
            <label className="row"><input type="checkbox" name="pl-home" defaultChecked={edit.placements?.includes('home')} /> On Home</label>
            <label className="row"><input type="checkbox" name="pl-result" defaultChecked={edit.placements?.includes('result')} /> After a match (result screen)</label>
          </div>
          <div className="cols">
            <div className="field"><label htmlFor="pw">Priority (1–10)</label><input id="pw" name="weight" type="number" min={1} max={10} className="input" defaultValue={edit.weight ?? 1} /></div>
            <div className="field"><label htmlFor="ps">Start (optional)</label><input id="ps" name="startsAt" type="datetime-local" className="input" defaultValue={local(edit.startsAt)} /></div>
            <div className="field"><label htmlFor="pe">End (optional)</label><input id="pe" name="endsAt" type="datetime-local" className="input" defaultValue={local(edit.endsAt)} /></div>
          </div>
          <label className="row"><input type="checkbox" name="isActive" defaultChecked={edit.isActive ?? true} /> Active</label>
          <div className="row">
            <button className="btn primary">Save</button>
            <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card mt table-wrap">
        {list.isLoading ? <Loading /> : !list.data?.items.length ? <p className="muted small">No promotions yet.</p> : (
          <table>
            <thead><tr><th></th><th>Promotion</th><th>Where</th><th>Views</th><th>Clicks</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td>{p.logoUrl ? <img src={p.logoUrl} alt="" width={36} height={36} style={{ objectFit: 'cover', borderRadius: '50%', background: '#fff' }} /> : <span className="cat-ic" style={{ borderRadius: '50%', color: p.color ?? undefined }}><Icon name="megaphone" size={18} /></span>}</td>
                  <td><b>{p.title}</b><div className="small faint" style={{ wordBreak: 'break-all' }}>{p.linkUrl}</div></td>
                  <td className="small">{p.placements.map((x) => (x === 'home' ? 'Home' : 'After match')).join(', ')}</td>
                  <td>{p.impressions}</td>
                  <td>{p.clicks}{p.impressions ? <span className="small faint"> ({Math.round((p.clicks / p.impressions) * 100)}%)</span> : null}</td>
                  <td><button className="btn sm" onClick={() => void toggle(p)}>{p.isActive ? 'Active' : 'Paused'}</button></td>
                  <td className="row"><button className="btn sm" onClick={() => open(p)}>Edit</button><button className="btn sm danger" onClick={() => void remove(p)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
