import { usernameSchema } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { uploadImage } from '../lib/image';
import { haptic } from '../lib/platform';
import { toast } from '../lib/toast';

export default function EditProfile() {
  const me = useAuth((s) => s.user)!;
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const profile = useQuery({ queryKey: ['profile', me.uid], queryFn: () => api(`/users/${me.uid}`) });
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const shop = useQuery({ queryKey: ['shop'], queryFn: async () => (await api<{ items: any[] }>('/shop')).items });
  const owned = (type: string) => (shop.data ?? []).filter((i) => i.type === type && i.owned > 0);
  const bioValue = bio ?? profile.data?.bio ?? '';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (username !== me.username && !usernameSchema.safeParse(username).success) return setErr(t('3–20 letters, numbers, _ or .', '৩–২০ অক্ষর: অক্ষর, সংখ্যা, _ বা .'));
    setBusy(true);
    try {
      const r = await api('/me', { method: 'PATCH', body: { ...(username !== me.username ? { username } : {}), ...(bio !== null ? { bio: bio || null } : {}) } });
      useAuth.getState().setUser(r.user);
      haptic('success');
      toast.success(t('Profile saved', 'প্রোফাইল সেভ হয়েছে'), undefined, 'check-circle');
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
      haptic('tap');
      useAuth.getState().setUser(r.user);
    } catch (e) {
      toast.error(t('Could not equip', 'বসানো যায়নি'), friendlyError(e));
    }
  }

  return (
    <div className="page stack">
      <PageHeader title={t('Edit profile', 'প্রোফাইল এডিট')} back />
      <section className="card col center edit-photo">
        <Avatar name={me.username} src={me.avatarUrl} size={110} frame={me.frame} />
        <div className="row">
          <label className="btn sm primary">
            {uploading ? <span className="spinner" /> : <Icon name="camera" />}
            {uploading ? t('Uploading…', 'আপলোড হচ্ছে…') : t('Change photo', 'ছবি বদলান')}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const r = await uploadImage('/me/avatar', f, api);
                  useAuth.getState().patchUser({ avatarUrl: r.avatarUrl, avatarThumbUrl: r.avatarThumbUrl });
                  toast.success(t('Photo updated', 'ছবি আপডেট হয়েছে'), undefined, 'image');
                } catch (e2) {
                  toast.error(t('Upload failed', 'আপলোড হয়নি'), e2 instanceof Error ? e2.message : friendlyError(e2));
                } finally {
                  setUploading(false);
                  e.target.value = '';
                }
              }}
            />
          </label>
          {me.avatarUrl && (
            <button
              className="btn sm ghost"
              onClick={async () => {
                await api('/me/avatar', { method: 'DELETE' });
                useAuth.getState().patchUser({ avatarUrl: null, avatarThumbUrl: null });
              }}
            >
              <Icon name="trash" /> {t('Remove', 'মুছুন')}
            </button>
          )}
        </div>
        <p className="xs faint">{t('JPG, PNG or WebP. We resize it and remove location data.', 'JPG, PNG বা WebP। ছবি ছোট করা হয় এবং লোকেশন তথ্য মুছে ফেলা হয়।')}</p>
      </section>

      <form className="card col" onSubmit={save}>
        {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
        <div className="field">
          <label htmlFor="u">{t('Username', 'ইউজারনেম')}</label>
          <div className="input-wrap">
            <Icon name="at" size={20} />
            <input id="u" name="username" className="input" maxLength={20} autoComplete="nickname" spellCheck={false} autoCapitalize="none" value={username} onChange={(e) => (setUsername(e.target.value), setErr(null))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="b">{t('Bio', 'নিজের সম্পর্কে')}</label>
          <textarea id="b" className="input" maxLength={160} value={bioValue} onChange={(e) => setBio(e.target.value)} placeholder={t('BCS aspirant · Cricket lover', 'বিসিএস প্রার্থী · ক্রিকেট ভক্ত')} />
          <span className="field-hint">{num(bioValue.length, lang)}/{num(160, lang)}</span>
        </div>
        <button className="btn primary block" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="check" />} {t('Save changes', 'সেভ করুন')}
        </button>
      </form>

      <section className="card">
        <div className="card-title"><h3><Icon name="sparkles" size={18} /> {t('Avatar frame', 'অ্যাভাটার ফ্রেম')}</h3></div>
        <div className="chips-scroll">
          <button className="select-chip" aria-selected={!me.frame} onClick={() => void equip('frame', null)}>{t('None', 'কোনোটি না')}</button>
          {owned('frame').map((i) => (
            <button key={i.key} className="select-chip" aria-selected={me.frame === i.data?.css} onClick={() => void equip('frame', i.key)}>
              <span className={`frame-dot frame-${i.data?.css}`} /> {i.name}
            </button>
          ))}
        </div>
        <div className="card-title mt"><h3><Icon name="award" size={18} /> {t('Profile title', 'প্রোফাইল টাইটেল')}</h3></div>
        <div className="chips-scroll">
          <button className="select-chip" aria-selected={!me.title} onClick={() => void equip('title', null)}>{t('None', 'কোনোটি না')}</button>
          {owned('title').map((i) => (
            <button key={i.key} className="select-chip" aria-selected={me.title === i.data?.text} onClick={() => void equip('title', i.key)}>
              {i.name}
            </button>
          ))}
        </div>
        <p className="xs muted mt">
          {t('Get more frames and titles in the', 'আরও ফ্রেম আর টাইটেল পাবেন')} <Link to="/shop">{t('Shop', 'শপে')}</Link>. {t('Cosmetics never affect gameplay.', 'এগুলো শুধু সাজসজ্জা, খেলায় কোনো সুবিধা দেয় না।')}
        </p>
      </section>
    </div>
  );
}
