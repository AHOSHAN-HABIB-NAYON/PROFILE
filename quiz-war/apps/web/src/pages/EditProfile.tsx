import { usernameSchema } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { uploadImage } from '../lib/image';
import { toast } from '../lib/toast';

export default function EditProfile() {
  const me = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const profile = useQuery({ queryKey: ['profile', me.uid], queryFn: () => api(`/users/${me.uid}`) });
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shop = useQuery({ queryKey: ['shop'], queryFn: async () => (await api<{ items: any[] }>('/shop')).items });
  const owned = (type: string) => (shop.data ?? []).filter((i) => i.type === type && i.owned > 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (username !== me.username && !usernameSchema.safeParse(username).success) return setErr('3–20 letters, numbers, _ or .');
    setBusy(true);
    try {
      const r = await api('/me', { method: 'PATCH', body: { ...(username !== me.username ? { username } : {}), ...(bio !== null ? { bio: bio || null } : {}) } });
      useAuth.getState().setUser(r.user);
      toast.success('Profile saved');
      nav('/profile');
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  async function equip(slot: 'frame' | 'title', itemKey: string | null) {
    try {
      const r = await api('/shop/equip', { body: { slot, itemKey } });
      useAuth.getState().setUser(r.user);
    } catch (e) {
      toast.error('Could not equip', friendlyError(e));
    }
  }

  return (
    <div className="page stack">
      <PageHeader title="Edit profile" back />
      <div className="col center">
        <Avatar name={me.username} src={me.avatarUrl} size={104} frame={me.frame} />
        <div className="row">
          <label className="btn sm outline">
            {busy ? 'Uploading…' : 'Change photo'}
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                const r = await uploadImage('/me/avatar', f, api);
                useAuth.getState().patchUser({ avatarUrl: r.avatarUrl, avatarThumbUrl: r.avatarThumbUrl });
                toast.success('Photo updated');
              } catch (e2) {
                toast.error('Upload failed', e2 instanceof Error ? e2.message : friendlyError(e2));
              } finally {
                setBusy(false);
              }
            }} />
          </label>
          {me.avatarUrl && <button className="btn sm ghost" onClick={async () => { await api('/me/avatar', { method: 'DELETE' }); useAuth.getState().patchUser({ avatarUrl: null, avatarThumbUrl: null }); }}>Remove</button>}
        </div>
      </div>
      <form className="card col" onSubmit={save}>
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="field"><label htmlFor="u">Username</label><input id="u" className="input" maxLength={20} value={username} onChange={(e) => (setUsername(e.target.value), setErr(null))} /></div>
        <div className="field"><label htmlFor="b">Bio</label><textarea id="b" className="input" maxLength={160} value={bio ?? profile.data?.bio ?? ''} onChange={(e) => setBio(e.target.value)} placeholder="BCS aspirant · Cricket lover 🏏" /><span className="field-hint">{(bio ?? profile.data?.bio ?? '').length}/160</span></div>
        <button className="btn primary block" disabled={busy}>Save</button>
      </form>
      <section className="card">
        <h3 className="mb">Frame</h3>
        <div className="row wrap">
          <button className={`chip ${!me.frame ? 'primary' : ''}`} onClick={() => void equip('frame', null)}>None</button>
          {owned('frame').map((i) => <button key={i.key} className={`chip ${me.frame === i.data?.css ? 'primary' : ''}`} onClick={() => void equip('frame', i.key)}>{i.name}</button>)}
        </div>
        <h3 className="mb mt">Title</h3>
        <div className="row wrap">
          <button className={`chip ${!me.title ? 'primary' : ''}`} onClick={() => void equip('title', null)}>None</button>
          {owned('title').map((i) => <button key={i.key} className={`chip ${me.title === i.data?.text ? 'primary' : ''}`} onClick={() => void equip('title', i.key)}>{i.name}</button>)}
        </div>
        <p className="xs muted mt">Get more frames and titles in the <a href="/shop">Shop</a>. Cosmetics never affect gameplay.</p>
      </section>
    </div>
  );
}
