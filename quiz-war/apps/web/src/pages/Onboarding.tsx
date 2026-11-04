import { usernameSchema } from '@quizwar/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { uploadImage } from '../lib/image';
import { useImageCropper } from '../components/ImageCropper';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

/**
 * New account: one short screen — photo (optional) + battle name — then straight to Home.
 * The UID, tips and email check come later on their own (profile, verify popup).
 */
export default function Onboarding() {
  const t = useT();
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const [name, setName] = useState(user.username && user.username !== 'Player' ? user.username : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(user.avatarUrl);
  const cropper = useImageCropper();

  async function finish(e: FormEvent) {
    e.preventDefault();
    const r = usernameSchema.safeParse(name.trim());
    if (!r.success) return setErr(t('3–20 letters, numbers, _ or . (Bangla works too)', '৩–২০ অক্ষর: অক্ষর, সংখ্যা, _ বা . (বাংলাও চলবে)'));
    setBusy(true);
    setErr(null);
    try {
      if (user.needsOnboarding || r.data !== user.username) {
        const res = await api('/me/onboarding', { body: { username: r.data } });
        useAuth.getState().setUser(res.user);
      }
      await api('/me/preferences', { method: 'PATCH', body: { tutorialDone: true } }).catch(() => undefined);
      haptic('success');
      sfx('reward');
      toast.success(t(`Welcome, ${r.data}!`, `স্বাগতম, ${r.data}!`), t('Tap Find opponent to play your first battle.', 'প্রথম ব্যাটল খেলতে "প্রতিপক্ষ খুঁজুন" চাপুন।'), 'party');
      nav('/', { replace: true });
    } catch (e2) {
      setErr(friendlyError(e2));
      setBusy(false);
    }
  }

  async function pick(picked: File | undefined) {
    if (!picked) return;
    const file = await cropper.crop(picked);
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const r = await uploadImage('/me/avatar', file, api);
      setAvatar(r.avatarUrl);
      useAuth.getState().patchUser({ avatarUrl: r.avatarUrl, avatarThumbUrl: r.avatarThumbUrl });
      haptic('success');
    } catch (e) {
      setErr(e instanceof Error ? e.message : friendlyError(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="onb">
      {cropper.element}
      <form className="onb-step" onSubmit={finish}>
        <h1>{t('Set up your profile', 'প্রোফাইল সাজিয়ে নিন')}</h1>
        <p className="muted">{t('Just a name — a photo is optional. You can change both later.', 'শুধু একটা নাম দিন — ছবি ঐচ্ছিক। পরে দুটোই বদলাতে পারবেন।')}</p>
        <label className="onb-avatar" aria-label={t('Add a profile photo', 'প্রোফাইল ছবি দিন')}>
          <Avatar name={name || user.username || 'Q'} src={avatar} size={120} />
          <span className="pc-edit" style={{ width: 40, height: 40 }}>{uploading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="camera" size={18} />}</span>
          <input type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        <div className="field" style={{ width: '100%' }}>
          <label htmlFor="un">{t('Battle name', 'ব্যাটল নাম')}</label>
          <div className="input-wrap">
            <Icon name="at" size={20} />
            <input id="un" className="input" autoComplete="nickname" spellCheck={false} maxLength={20} value={name} onChange={(e) => (setName(e.target.value), setErr(null))} placeholder={t('e.g. Rahim_99', 'যেমন: Rahim_99')} enterKeyHint="done" />
          </div>
          <span className="field-hint">{t('Other players see this name. Your email stays private.', 'অন্য প্লেয়াররা এই নাম দেখবে। আপনার ইমেইল গোপন থাকবে।')}</span>
        </div>
        {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
        <button className="btn primary lg block" disabled={busy || uploading || name.trim().length < 3}>
          {busy ? <span className="spinner" /> : null} {t('Start playing', 'খেলা শুরু করুন')} <Icon name="arrow-right" />
        </button>
      </form>
    </div>
  );
}
