import { usernameSchema } from '@quizwar/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Icon, IconTile, type IconName } from '../components/Icon';
import { QrCode } from '../components/Qr';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { useT } from '../lib/i18n';
import { uploadImage } from '../lib/image';
import { haptic } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { emit } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const TUTORIAL: { icon: IconName; tone: 'danger' | 'warning' | 'success'; title: [string, string]; body: [string, string] }[] = [
  {
    icon: 'swords',
    tone: 'danger',
    title: ['Battle in real time', 'রিয়েলটাইমে লড়াই'],
    body: ['You and your opponent get the same question at the same moment. Answer before the timer runs out.', 'আপনি আর প্রতিপক্ষ একই সময়ে একই প্রশ্ন পাবেন। সময় শেষ হওয়ার আগে উত্তর দিন।'],
  },
  {
    icon: 'bolt',
    tone: 'warning',
    title: ['Fast and correct wins', 'দ্রুত ও সঠিক উত্তরে জয়'],
    body: ['Correct answers earn points, fast answers earn a speed bonus, and streaks build a combo multiplier.', 'সঠিক উত্তরে পয়েন্ট, দ্রুত উত্তরে বোনাস, আর পরপর সঠিক হলে কম্বো গুণক।'],
  },
  {
    icon: 'trophy',
    tone: 'success',
    title: ['Climb the leagues', 'লীগে উপরে উঠুন'],
    body: ['Win ranked battles to go from Bronze to Champion. Earn XP, coins and achievements every day.', 'র‍্যাংকড ব্যাটল জিতে ব্রোঞ্জ থেকে চ্যাম্পিয়ন হোন। প্রতিদিন XP, কয়েন আর অ্যাচিভমেন্ট জিতুন।'],
  },
];

type Step = 'name' | 'avatar' | 'uid' | 'tutorial';
const STEPS: Step[] = ['name', 'avatar', 'uid', 'tutorial'];

export default function Onboarding() {
  const t = useT();
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(user.username && user.username !== 'Player' && !user.needsOnboarding ? 'avatar' : 'name');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [avatar, setAvatar] = useState<string | null>(user.avatarUrl);
  const go = (s: Step) => (haptic('tap'), setErr(null), setStep(s));

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const r = usernameSchema.safeParse(name.trim());
    if (!r.success) return setErr(t('3–20 letters, numbers, _ or . (Bangla works too)', '৩–২০ অক্ষর: অক্ষর, সংখ্যা, _ বা . (বাংলাও চলবে)'));
    setBusy(true);
    setErr(null);
    try {
      const res = await api('/me/onboarding', { body: { username: r.data } });
      useAuth.getState().setUser(res.user);
      haptic('success');
      setStep('avatar');
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await uploadImage('/me/avatar', file, api);
      setAvatar(r.avatarUrl);
      useAuth.getState().patchUser({ avatarUrl: r.avatarUrl, avatarThumbUrl: r.avatarThumbUrl });
      haptic('success');
    } catch (e) {
      setErr(e instanceof Error ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function firstBattle() {
    setBusy(true);
    try {
      await api('/me/preferences', { method: 'PATCH', body: { tutorialDone: true } });
      const r = await emit('ai:start', { level: 'easy', tutorial: true });
      useGame.getState().reset(r.matchId);
      sfx('start');
      nav(`/match/${r.matchId}`, { replace: true });
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  const idx = STEPS.indexOf(step);
  return (
    <div className="onb">
      <div className="onb-progress" aria-label={t(`Step ${idx + 1} of 4`, `ধাপ ${idx + 1} / ৪`)}>
        {STEPS.map((s, i) => <i key={s} className={i <= idx ? 'on' : ''} />)}
      </div>

      {step === 'name' && (
        <form className="onb-step" onSubmit={saveName} key="name">
          <IconTile name="gamepad" tone="primary" size={84} anim="float" />
          <h1>{t('Choose your battle name', 'আপনার ব্যাটল নাম দিন')}</h1>
          <p className="muted">{t('This is how other players see you. Your email stays private.', 'অন্য প্লেয়াররা এই নামেই আপনাকে দেখবে। আপনার ইমেইল গোপন থাকবে।')}</p>
          {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
          <div className="field" style={{ width: '100%' }}>
            <label htmlFor="un">{t('Username', 'ইউজারনেম')}</label>
            <div className="input-wrap">
              <Icon name="at" size={20} />
              <input id="un" className="input" autoFocus autoComplete="nickname" spellCheck={false} maxLength={20} value={name} onChange={(e) => (setName(e.target.value), setErr(null))} placeholder={t('e.g. Rahim_99', 'যেমন: Rahim_99')} enterKeyHint="done" />
            </div>
            <span className="field-hint">{t('3–20 letters, numbers, _ or . (Bangla works too)', '৩–২০ অক্ষর: অক্ষর, সংখ্যা, _ বা . (বাংলাও চলবে)')}</span>
          </div>
          <button className="btn primary lg block" disabled={busy || name.trim().length < 3}>
            {busy ? <span className="spinner" /> : null} {t('Continue', 'এগিয়ে যান')} <Icon name="arrow-right" />
          </button>
        </form>
      )}

      {step === 'avatar' && (
        <div className="onb-step" key="avatar">
          <h1>{t('Add a profile photo', 'প্রোফাইল ছবি দিন')}</h1>
          <p className="muted">{t('Optional — you can change it later.', 'ঐচ্ছিক — পরে বদলাতে পারবেন।')}</p>
          <label className="onb-avatar">
            <Avatar name={user.username} src={avatar} size={132} />
            <span className="pc-edit" style={{ width: 40, height: 40 }}>{busy ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="camera" size={18} />}</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
          {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
          <button className="btn primary lg block" disabled={busy} onClick={() => go('uid')}>
            {avatar ? t('Continue', 'এগিয়ে যান') : t('Skip for now', 'এখন না')} <Icon name="arrow-right" />
          </button>
        </div>
      )}

      {step === 'uid' && (
        <div className="onb-step" key="uid">
          <IconTile name="verified" tone="success" size={72} anim="pop" />
          <h1>{t('Your player ID', 'আপনার প্লেয়ার আইডি')}</h1>
          <button className="uid-badge big" onClick={() => void navigator.clipboard?.writeText(user.uid).then(() => toast.success(t('UID copied', 'UID কপি হয়েছে'), user.uid, 'copy'))}>
            {user.uid} <Icon name="copy" size={16} />
          </button>
          <div className="onb-qr"><QrCode value={profileLink(user.uid)} size={150} /></div>
          <p className="muted">{t('Share your UID or QR code so friends can add and challenge you — no email needed.', 'বন্ধুরা আপনাকে অ্যাড ও চ্যালেঞ্জ করতে আপনার UID বা QR কোড শেয়ার করুন — ইমেইল লাগবে না।')}</p>
          <button className="btn primary lg block" onClick={() => go('tutorial')}>{t('Got it', 'বুঝেছি')} <Icon name="arrow-right" /></button>
        </div>
      )}

      {step === 'tutorial' && (
        <div className="onb-step" key="tutorial">
          <div className="tutorial-step" key={slide}>
            <IconTile name={TUTORIAL[slide].icon} tone={TUTORIAL[slide].tone} size={92} anim="float" />
            <h1>{t(...TUTORIAL[slide].title)}</h1>
            <p className="muted">{t(...TUTORIAL[slide].body)}</p>
          </div>
          <div className="intro-dots" aria-hidden>{TUTORIAL.map((_, i) => <button key={i} tabIndex={-1} onClick={() => setSlide(i)}><i className={i === slide ? 'on' : ''} /></button>)}</div>
          {err && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {err}</p>}
          {slide < TUTORIAL.length - 1 ? (
            <div className="row" style={{ width: '100%' }}>
              <button className="btn ghost grow" onClick={() => setSlide(TUTORIAL.length - 1)}>{t('Skip', 'বাদ দিন')}</button>
              <button className="btn primary grow" onClick={() => (haptic('tap'), setSlide(slide + 1))}>{t('Next', 'পরবর্তী')} <Icon name="arrow-right" /></button>
            </div>
          ) : (
            <>
              <button className="btn primary lg block" disabled={busy} onClick={() => void firstBattle()}>
                {busy ? <span className="spinner" /> : <Icon name="bot" />} {t('Start your first battle', 'প্রথম ব্যাটল শুরু করুন')}
              </button>
              <button className="btn ghost block" onClick={() => void api('/me/preferences', { method: 'PATCH', body: { tutorialDone: true } }).finally(() => nav('/', { replace: true }))}>
                {t('Go to home', 'হোমে যান')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
