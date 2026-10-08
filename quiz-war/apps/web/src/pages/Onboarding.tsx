import { usernameSchema } from '@quizwar/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { uploadImage } from '../lib/image';
import { haptic } from '../lib/platform';
import { emit } from '../lib/socket';
import { sfx } from '../lib/sound';

const TUTORIAL = [
  { art: '⚔️', title: 'Battle in realtime', body: 'You and your opponent get the same question at the same moment. Answer before the timer runs out.' },
  { art: '⚡', title: 'Fast & correct wins', body: 'Correct answers earn points, fast answers earn a speed bonus, and streaks build a 🔥 combo multiplier.' },
  { art: '🏆', title: 'Climb the leagues', body: 'Win ranked battles to go from 🥉 Bronze to 🏆 Champion. Earn XP, coins and achievements every day.' },
];

export default function Onboarding() {
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const [step, setStep] = useState<'name' | 'avatar' | 'uid' | 'tutorial'>(user.username && user.username !== 'Player' && !user.needsOnboarding ? 'avatar' : 'name');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [avatar, setAvatar] = useState<string | null>(user.avatarUrl);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const r = usernameSchema.safeParse(name);
    if (!r.success) return setErr(r.error.issues[0].message);
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

  return (
    <div className="welcome">
      {step === 'name' && (
        <form className="col gap-lg" onSubmit={saveName} style={{ marginTop: '12vh' }}>
          <div className="center">
            <div style={{ fontSize: 54 }}>🎮</div>
            <h1>Choose your battle name</h1>
            <p className="muted small mt">This is how other players see you. Your email stays private.</p>
          </div>
          {err && <p className="form-error" role="alert">{err}</p>}
          <div className="field">
            <label htmlFor="un">Username</label>
            <input id="un" className="input" autoFocus autoComplete="nickname" maxLength={20} value={name} onChange={(e) => (setName(e.target.value), setErr(null))} placeholder="e.g. Rahim_99" />
            <span className="field-hint">3–20 letters, numbers, _ or . (Bangla works too)</span>
          </div>
          <button className="btn primary lg block" disabled={busy || name.trim().length < 3}>Continue</button>
        </form>
      )}

      {step === 'avatar' && (
        <div className="col gap-lg center" style={{ marginTop: '10vh' }}>
          <h1>Add a profile photo</h1>
          <p className="muted small">Optional — you can change it later.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Avatar name={user.username} src={avatar} size={120} />
          </div>
          {err && <p className="form-error" role="alert">{err}</p>}
          <label className="btn outline block">
            {busy ? 'Uploading…' : avatar ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
          <button className="btn primary lg block" disabled={busy} onClick={() => setStep('uid')}>{avatar ? 'Continue' : 'Skip for now'}</button>
        </div>
      )}

      {step === 'uid' && (
        <div className="col gap-lg center" style={{ marginTop: '12vh' }}>
          <div style={{ fontSize: 54 }}>🪪</div>
          <h1>Your Player ID</h1>
          <span className="uid-badge" style={{ fontSize: 22, margin: '0 auto' }}>{user.uid}</span>
          <p className="muted small">Share your UID or QR code so friends can add and challenge you — no email needed.</p>
          <button className="btn primary lg block" onClick={() => setStep('tutorial')}>Got it</button>
        </div>
      )}

      {step === 'tutorial' && (
        <div className="col" style={{ marginTop: '8vh' }}>
          <div className="tutorial-step card pad-lg" key={slide} style={{ animation: 'fade-up .3s' }}>
            <div className="t-art">{TUTORIAL[slide].art}</div>
            <h2>{TUTORIAL[slide].title}</h2>
            <p className="muted mt">{TUTORIAL[slide].body}</p>
          </div>
          <div className="dots" aria-hidden>{TUTORIAL.map((_, i) => <i key={i} className={i === slide ? 'on' : ''} />)}</div>
          {err && <p className="form-error" role="alert">{err}</p>}
          {slide < TUTORIAL.length - 1 ? (
            <div className="row">
              <button className="btn ghost grow" onClick={() => setSlide(TUTORIAL.length - 1)}>Skip</button>
              <button className="btn primary grow" onClick={() => setSlide(slide + 1)}>Next</button>
            </div>
          ) : (
            <>
              <button className="btn primary lg block" disabled={busy} onClick={() => void firstBattle()}>🤖 Start your first battle</button>
              <button className="btn ghost block" onClick={() => void api('/me/preferences', { method: 'PATCH', body: { tutorialDone: true } }).finally(() => nav('/', { replace: true }))}>Go to home</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
