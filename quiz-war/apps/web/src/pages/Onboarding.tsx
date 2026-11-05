import { usernameSchema } from '@quizwar/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { uploadImage } from '../lib/image';
import { useImageCropper } from '../components/ImageCropper';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { clearInvite, deviceId, savedInvite } from '../lib/device';
import { useConfig } from '../hooks/queries';

/**
 * New account: one short screen — photo (optional) + battle name — then straight to Home.
 * The UID, tips and email check come later on their own (profile, verify popup).
 */
export default function Onboarding() {
  const t = useT();
  const lang = useLang();
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const [name, setName] = useState(user.username && user.username !== 'Player' ? user.username : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(user.avatarUrl);
  const cropper = useImageCropper();
  const cfg = useConfig().data;
  const [invite, setInvite] = useState(savedInvite());
  const referralOn = !!cfg?.premiumEnabled && cfg?.referralEnabled !== false;

  async function finish(e: FormEvent) {
    e.preventDefault();
    const r = usernameSchema.safeParse(name.trim());
    if (!r.success) return setErr(t('3–20 letters, numbers, _ or . (Bangla works too)', '৩–২০ অক্ষর: অক্ষর, সংখ্যা, _ বা . (বাংলাও চলবে)'));
    setBusy(true);
    setErr(null);
    try {
      let trialDays = 0;
      if (user.needsOnboarding || r.data !== user.username) {
        const code = invite.trim();
        const res = await api('/me/onboarding', { body: { username: r.data, deviceId: await deviceId(), ...(code && referralOn ? { inviteCode: code } : {}) } });
        useAuth.getState().setUser(res.user);
        trialDays = res.trialDays ?? 0;
        clearInvite();
      }
      await api('/me/preferences', { method: 'PATCH', body: { tutorialDone: true } }).catch(() => undefined);
      haptic('success');
      sfx('reward');
      if (trialDays > 0)
        toast.success(t(`Welcome! ${trialDays} days of Premium free`, `স্বাগতম! ${trialDays} দিন প্রিমিয়াম ফ্রি`), t('Calls, video and live talk are on. Enjoy!', 'কল, ভিডিও আর লাইভ কথা চালু। উপভোগ করুন!'), 'crown');
      else toast.success(t(`Welcome, ${r.data}!`, `স্বাগতম, ${r.data}!`), t('Tap Find opponent to play your first battle.', 'প্রথম ব্যাটল খেলতে "প্রতিপক্ষ খুঁজুন" চাপুন।'), 'party');
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

  const trialDays = cfg?.premiumEnabled && cfg?.premiumTrialEnabled !== false ? (cfg?.premiumTrialDays ?? 7) : 0;
  return (
    <div className="onb2">
      {cropper.element}
      <header className="onb2-hd">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} />
        <h1>{t('Welcome to QUIZ WAR!', 'QUIZ WAR-এ স্বাগতম!')}</h1>
        <p>{t('Set up your profile in a few seconds.', 'কয়েক সেকেন্ডে প্রোফাইল সাজিয়ে নিন।')}</p>
      </header>
      <form className="onb2-card" onSubmit={finish}>
        <label className="onb2-photo" aria-label={t('Add a profile photo', 'প্রোফাইল ছবি দিন')}>
          <span className="onb2-ring">
            <Avatar name={name || user.username || 'Q'} src={avatar} size={112} />
            <span className="onb2-cam">{uploading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="camera" size={18} />}</span>
          </span>
          <b>{avatar ? t('Change photo', 'ছবি বদলান') : t('Add a photo', 'ছবি দিন')}</b>
          <small>{t('Optional', 'ঐচ্ছিক')}</small>
          <input type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </label>

        <div className="onb2-field">
          <label htmlFor="un"><span className="onb2-n">{t('1', '১')}</span> {t('Your battle name', 'আপনার ব্যাটল নাম')}</label>
          <div className="onb2-input">
            <Icon name="at" size={20} />
            <input id="un" autoComplete="nickname" spellCheck={false} maxLength={20} value={name} onChange={(e) => (setName(e.target.value), setErr(null))} placeholder={t('e.g. Rahim_99', 'যেমন: Rahim_99')} enterKeyHint="done" />
            {name.trim().length >= 3 && <Icon name="check-circle" size={20} className="onb2-ok" />}
          </div>
          <small>{t('Other players see this name. Your email stays private.', 'অন্য প্লেয়াররা এই নাম দেখবে। আপনার ইমেইল গোপন থাকবে।')}</small>
        </div>

        {referralOn && user.needsOnboarding && (
          <div className="onb2-field inv">
            <label htmlFor="inv"><span className="onb2-n">{t('2', '২')}</span> {t('Invite code', 'ইনভাইট কোড')} <em>{t('optional', 'ঐচ্ছিক')}</em></label>
            <div className="onb2-input">
              <Icon name="gift" size={20} />
              <input id="inv" autoCapitalize="characters" spellCheck={false} maxLength={12} value={invite} onChange={(e) => (setInvite(e.target.value.toUpperCase()), setErr(null))} placeholder={t('Friend’s UID, e.g. QW-8F29K7', 'বন্ধুর UID, যেমন QW-8F29K7')} />
            </div>
            <small>{t('Got a code from a friend? Your friend gets free Premium when you play your first game.', 'বন্ধুর কাছ থেকে কোড পেয়েছেন? আপনি প্রথম খেলা খেললে বন্ধু ফ্রি প্রিমিয়াম পাবে।')}</small>
          </div>
        )}

        {trialDays > 0 && user.needsOnboarding && (
          <div className="onb2-gift">
            <span><Icon name="crown" size={20} /></span>
            <p><b>{t(`${trialDays} days of Premium free`, `${num(trialDays, lang)} দিন প্রিমিয়াম ফ্রি`)}</b>{t('Video calls & live talk — on for new players.', 'নতুনদের জন্য ভিডিও কল আর লাইভ কথা চালু।')}</p>
          </div>
        )}

        {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
        <button className="onb2-cta" disabled={busy || uploading || name.trim().length < 3}>
          {busy ? <span className="spinner" /> : null} {t('Start playing', 'খেলা শুরু করুন')} <Icon name="arrow-right" size={20} />
        </button>
      </form>
    </div>
  );
}
