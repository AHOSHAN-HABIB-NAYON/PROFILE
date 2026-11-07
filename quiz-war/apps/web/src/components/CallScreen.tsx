import { useQuery } from '@tanstack/react-query';
import type { PublicUser } from '@quizwar/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { navigateTo } from '../lib/nav';
import { useAuth } from '../lib/auth';
import { addToCall, answerCall, declineCall, hangUp, switchCamera, toggleCallMute, toggleCamera, toggleLoud, useCall } from '../lib/call';
import { num, useLang, useT } from '../lib/i18n';
import { isNative } from '../lib/platform';
import { haptic } from '../lib/platform';
import { toggleMuteForMe, useVoice } from '../lib/voice';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Full-screen audio call (incoming, calling, talking), or a small bar while using the app. */
export function CallScreen() {
  const t = useT();
  const lang = useLang();
  const { call, small, loud, set } = useCall();
  const micOn = useVoice((s) => s.micOn);
  const speaking = useVoice((s) => s.speaking);
  const talking = !!(call && speaking[call.peer.id]);
  const meId = useAuth((s) => s.user?.id ?? 0);
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<PublicUser | null>(null);
  const mutedForMe = useVoice((s) => s.mutedForMe);
  const me = useAuth((s) => s.user);
  const camOn = useVoice((s) => s.camOn);
  const camStream = useVoice((s) => s.camStream);
  const facing = useVoice((s) => s.facing);
  const videos = useVoice((s) => s.videos);
  const [, tick] = useState(0);
  const [swapped, setSwapped] = useState(false);

  useEffect(() => {
    if (call?.phase !== 'live') return;
    const i = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(i);
  }, [call?.phase]);

  if (!call) return null;
  const { peer, phase, dir } = call;
  const others = (call.members ?? []).filter((m) => m.user.id !== meId);
  const group = others.length >= 2;
  const full = (call.members?.length ?? 2) >= 4;
  const canAdd = phase === 'live' && !full;
  const time = num(clock(Date.now() - call.startedAt), lang);
  const status =
    phase === 'live'
      ? time
      : phase === 'ended'
        ? call.endText
        : phase === 'connecting'
          ? t('Connecting…', 'সংযোগ হচ্ছে…')
          : dir === 'in'
            ? call.with?.length
              ? t(`Group call with ${call.with.join(', ')}`, `${call.with.join(', ')}-এর সাথে গ্রুপ কল`)
              : call.video
                ? t('Incoming video call', 'ভিডিও কল আসছে')
                : t('Incoming audio call', 'অডিও কল আসছে')
            : call.rang
              ? t('Ringing…', 'রিং হচ্ছে…')
              : call.video
                ? t('Video calling…', 'ভিডিও কল হচ্ছে…')
                : t('Calling…', 'কল হচ্ছে…');
  const remote = videos[peer.id] ?? null;
  const hasVideo = !!call.video || camOn || Object.keys(videos).length > 0;
  /** 1-to-1 video: their picture fills the screen; while it rings, my own camera does. */
  const baseStage = !group && hasVideo && phase !== 'ended' ? (remote ?? (camOn && camStream && dir === 'out' && phase !== 'live' ? camStream : null)) : null;
  // Tap the small picture to swap big and small (only when both pictures are live).
  const canSwap = !!remote && camOn && !!camStream;
  const stage = canSwap && swapped ? camStream : baseStage;
  const stageIsMe = !!stage && stage === camStream;
  const pip = !group && phase !== 'ended' ? (stageIsMe ? (canSwap ? remote : null) : camOn && camStream ? camStream : null) : null;
  const vgrid = group && hasVideo && phase !== 'ended';

  if (small && phase !== 'ended')
    return (
      <div className="call-mini" role="status">
        <button type="button" className="cm-open" onClick={() => set({ small: false })}>
          <span className={`cm-dot${talking ? ' on' : ''}`} />
          <b>{peer.username}</b>
          <span>{phase === 'live' ? time : status}</span>
          <small>{t('Tap to return', 'ফিরতে চাপুন')}</small>
        </button>
        <button type="button" className="cm-end" onClick={hangUp} aria-label={t('End call', 'কল কাটুন')}>
          <Icon name="phone-off" size={18} />
        </button>
      </div>
    );

  const ringing = phase === 'calling' || phase === 'ringing';
  return (
    <div className={`call-screen ph-${phase}${stage ? ' has-video' : ''}${vgrid ? ' vgrid' : ''}`} role="dialog" aria-modal="true" aria-label={call.video ? t('Video call', 'ভিডিও কল') : t('Audio call', 'অডিও কল')}>
      {stage && <VideoView stream={stage} mirror={stageIsMe && facing === 'user'} className="cv-stage" />}
      {pip && <SelfPip stream={pip} mirror={pip === camStream && facing === 'user'} onTap={canSwap ? () => (haptic('tap'), setSwapped((v) => !v)) : undefined} />}
      <div className="cs-top">
        {phase !== 'ended' && !(dir === 'in' && phase === 'ringing') ? (
          <button type="button" className="cs-round" onClick={() => set({ small: true })} aria-label={t('Minimise', 'ছোট করুন')}>
            <Icon name="chevron-down" size={22} />
          </button>
        ) : (
          <span className="cs-round ghost" />
        )}
        {vgrid ? (
          <span className="cs-vtitle"><b>{t('Group video call', 'গ্রুপ ভিডিও কল')}</b><small><Icon name="lock" size={12} /> {status}</small></span>
        ) : (
          <span className="cs-lock"><Icon name="lock" size={13} /> {t('Phone to phone · not recorded', 'সরাসরি ফোনে ফোনে · রেকর্ড হয় না')}</span>
        )}
        {canAdd ? (
          <button type="button" className="cs-round" onClick={() => setAdding(true)} aria-label={t('Add people', 'যোগ করুন')}>
            <Icon name="user-add" size={21} />
          </button>
        ) : (
          <span className="cs-round ghost" />
        )}
      </div>

      {group && phase !== 'ended' ? (
        <div className="cs-group">
          {!vgrid && <p className={`cs-status${phase === 'live' ? ' live' : ''}`}>{t('Group call', 'গ্রুপ কল')} · {status}</p>}
          <div className={`cs-tiles n${others.length + 1}`}>
            {me && (
              <CallTile color={0} name={t('You', 'আপনি')} user={me as any} talking={!!speaking[0]} muted={!micOn} stream={camOn ? camStream : null} mirror={facing === 'user'} />
            )}
            {others.map((m, i) => (
              <CallTile
                key={m.user.id}
                color={i + 1}
                name={m.user.username}
                user={m.user}
                talking={!!speaking[m.user.id]}
                ringing={m.state === 'ringing'}
                muted={!!mutedForMe[m.user.id]}
                stream={videos[m.user.id] ?? null}
                onHold={() => (haptic('heavy'), setMenuFor(m.user))}
              />
            ))}
          </div>
          {!vgrid && <p className="cs-hint">{t('Hold a picture to mute that player for you', 'কারো ছবিতে চেপে ধরলে শুধু আপনার জন্য মিউট করা যাবে')}</p>}
        </div>
      ) : stage ? (
        <div className="cv-head">
          <h2>{peer.username}</h2>
          <p className={`cs-status${phase === 'live' ? ' live' : ''}`}>{status}</p>
          {phase === 'live' && !micOn && <p className="cs-muted"><Icon name="mic-off" size={14} /> {t('Your mic is off', 'আপনার মাইক বন্ধ')}</p>}
        </div>
      ) : (
      <div className="cs-who">
        <div className={`cs-av${ringing ? ' ring' : ''}${talking && phase === 'live' ? ' talk' : ''}`}>
          <i /><i /><i />
          <Avatar name={peer.username} src={peer.avatarUrl ?? peer.avatarThumbUrl} size={132} />
        </div>
        <h2>{peer.username}</h2>
        <p className={`cs-status${phase === 'live' ? ' live' : ''}`}>{status}</p>
        {phase === 'live' && !micOn && <p className="cs-muted"><Icon name="mic-off" size={14} /> {t('Your mic is off', 'আপনার মাইক বন্ধ')}</p>}
      </div>
      )}

      {phase === 'ended' ? (
        <div className="cs-actions" />
      ) : dir === 'in' && phase === 'ringing' ? (
        <div className="cs-actions">
          <SwipeButton kind="decline" label={t('Decline', 'কেটে দিন')} hintText={t('Swipe up to decline', 'কাটতে উপরে টানুন')} onDone={declineCall} />
          <SwipeButton kind="answer" video={!!call.video} label={t('Swipe up to accept', 'উপরে টেনে ধরুন')} hintText="" onDone={() => void answerCall()} />
          <span className="cs-act">
            <button type="button" className="cs-btn soft" onClick={() => (declineCall(), navigateTo(`/chat/${peer.uid}`))} aria-label={t('Message', 'মেসেজ')}><Icon name="message" size={24} /></button>
            <small>{t('Message', 'মেসেজ')}</small>
          </span>
        </div>
      ) : (
        <div className={`cs-actions${group || stage ? ' panel' : ''}`}>
          <span className="cs-act">
            <button type="button" className={`cs-btn soft${camOn ? ' on' : ''}`} onClick={() => (haptic('tap'), void toggleCamera())} disabled={phase !== 'live' && !(call.video && dir === 'out')} aria-pressed={camOn} aria-label={t('Camera', 'ক্যামেরা')}><Icon name={camOn ? 'video' : 'video-off'} size={24} /></button>
            <small>{t('Camera', 'ক্যামেরা')}</small>
          </span>
          {camOn && (
            <span className="cs-act">
              <button type="button" className="cs-btn soft" onClick={() => (haptic('tap'), switchCamera())} aria-label={t('Switch camera', 'ক্যামেরা বদলান')}><Icon name="switch-camera" size={24} /></button>
              <small>{t('Flip', 'উল্টান')}</small>
            </span>
          )}
          {isNative && (
            <span className="cs-act">
              <button type="button" className={`cs-btn soft${loud ? ' on' : ''}`} onClick={toggleLoud} aria-pressed={loud} aria-label={t('Speaker', 'স্পিকার')}><Icon name="volume" size={26} /></button>
              <small>{t('Speaker', 'স্পিকার')}</small>
            </span>
          )}
          <span className="cs-act">
            <button type="button" className={`cs-btn soft${phase === 'live' && !micOn ? ' on' : ''}`} onClick={toggleCallMute} disabled={phase !== 'live'} aria-pressed={!micOn} aria-label={t('Mute', 'মিউট')}><Icon name={phase === 'live' && !micOn ? 'mic-off' : 'mic'} size={26} /></button>
            <small>{phase === 'live' && !micOn ? t('Unmute', 'আনমিউট') : t('Mute', 'মিউট')}</small>
          </span>
          <span className="cs-act">
            <button type="button" className="cs-btn end" onClick={hangUp} aria-label={t('End call', 'কল কাটুন')}><Icon name="phone-off" size={26} /></button>
            <small>{t('End', 'কাটুন')}</small>
          </span>
        </div>
      )}
      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.username ?? ''} icon="volume">
        {menuFor && (
          <button
            className="menu-row"
            onClick={() => {
              toggleMuteForMe(menuFor.id);
              setMenuFor(null);
            }}
          >
            <span className="m-text">
              <b>{mutedForMe[menuFor.id] ? t('Unmute for me', 'আবার শুনুন (আনমিউট)') : t('Mute for me', 'শুধু আমার জন্য মিউট')}</b>
              <small>{mutedForMe[menuFor.id] ? t(`You will hear ${menuFor.username} again`, `${menuFor.username}-এর কথা আবার শুনবেন`) : t('Only you stop hearing them; others still can.', 'শুধু আপনি শুনবেন না; অন্যরা শুনবে।')}</small>
            </span>
            <Icon name={mutedForMe[menuFor.id] ? 'volume' : 'mute'} size={22} />
          </button>
        )}
      </Sheet>
      <AddPeople open={adding && phase === 'live'} onClose={() => setAdding(false)} inCall={(call.members ?? []).map((m) => m.user.id).concat(peer.id, meId)} />
    </div>
  );
}

/** Pick friends to bring into the call (group call, up to 4 people). */
function AddPeople({ open, onClose, inCall }: { open: boolean; onClose: () => void; inCall: number[] }) {
  const t = useT();
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: { user: PublicUser; status: string }[] }>('/friends')).items, enabled: open });
  const list = (friends.data ?? [])
    .filter((f) => !inCall.includes(f.user.id))
    .sort((a, b) => Number(b.status !== 'offline') - Number(a.status !== 'offline'));
  return (
    <Sheet open={open} onClose={onClose} title={t('Add to call', 'কলে যোগ করুন')} icon="user-add">
      <p className="small muted" style={{ margin: '0 4px 10px' }}>{t('Up to 4 people can talk together.', 'একসাথে সর্বোচ্চ ৪ জন কথা বলতে পারবে।')}</p>
      <div className="fwd-list">
        {!list.length && <p className="small muted" style={{ padding: 12 }}>{t('No friends to add.', 'যোগ করার মতো বন্ধু নেই।')}</p>}
        {list.map((f) => (
          <div key={f.user.id} className="fwd-row">
            <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status as any} size={42} />
            <b className="grow ellipsis">{f.user.username}</b>
            <button
              className={`btn sm ${sent[f.user.id] ? 'soft' : 'primary'}`}
              disabled={!!sent[f.user.id]}
              onClick={() => void addToCall(f.user).then((ok) => ok && (setSent((s) => ({ ...s, [f.user.id]: true })), onClose()))}
            >
              {sent[f.user.id] ? t('Ringing', 'রিং হচ্ছে') : <><Icon name="phone" /> {t('Add', 'যোগ')}</>}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

const TILE_COLORS = ['#38bdf8', '#f59e0b', '#facc15', '#f472b6'];

/** One person in a group call: coloured card, round picture, name, live sound wave. Hold = menu. */
function CallTile({ name, user, color, talking, ringing, muted, onHold, stream, mirror }: { name: string; user: PublicUser; color: number; talking: boolean; ringing?: boolean; muted?: boolean; onHold?: () => void; stream?: MediaStream | null; mirror?: boolean }) {
  const t = useT();
  const timer = useRef<number | undefined>(undefined);
  const c = TILE_COLORS[color % TILE_COLORS.length];
  const down = () => {
    if (!onHold) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(onHold, 450);
  };
  const up = () => window.clearTimeout(timer.current);
  return (
    <div
      className={`cs-tile2${talking ? ' talk' : ''}${ringing ? ' ringing' : ''}${stream ? ' has-video' : ''}`}
      style={{ ['--tc' as any]: c }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onContextMenu={(e) => (e.preventDefault(), onHold?.())}
      role={onHold ? 'button' : undefined}
      aria-label={onHold ? t(`${name}: hold for options`, `${name}: অপশনের জন্য চেপে ধরুন`) : name}
    >
      {stream && <VideoView stream={stream} mirror={mirror} className="ct-video" />}
      <b className="ct-name ellipsis">{name}{stream && <span className={`ct-mini${talking && !muted ? ' on' : ''}`} aria-hidden><i /><i /><i /><i /></span>}</b>
      {ringing && <small className="ct-state">{t('Ringing…', 'রিং হচ্ছে…')}</small>}
      {muted && <span className="ct-muted"><Icon name={color === 0 ? 'mic-off' : 'mute'} size={15} /></span>}
      <div className="ct-foot">
        <Avatar name={user.username} src={user.avatarUrl ?? user.avatarThumbUrl} size={52} />
        <span className={`ct-wave${talking && !muted ? ' on' : ''}`} aria-hidden>
          {[0.3, 0.5, 0.8, 0.45, 1, 0.6, 0.9, 0.4, 0.7, 0.35, 0.55].map((h, i) => <i key={i} style={{ ['--h' as any]: h, animationDelay: `${(i % 5) * 0.09}s` }} />)}
        </span>
      </div>
    </div>
  );
}

type Corner = 'tr' | 'tl' | 'br' | 'bl';
const PIP_KEY = 'qw-pip';

/** 1-to-1 video: the small picture. Drag it to any corner (it snaps); tap to swap big and small. */
function SelfPip({ stream, mirror, onTap }: { stream: MediaStream; mirror?: boolean; onTap?: () => void }) {
  const t = useT();
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      return (JSON.parse(localStorage.getItem(PIP_KEY) ?? '{}').corner as Corner) || 'tr';
    } catch {
      return 'tr';
    }
  });
  const [hint, setHint] = useState(() => {
    try {
      return !JSON.parse(localStorage.getItem(PIP_KEY) ?? '{}').seen;
    } catch {
      return false;
    }
  });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const remember = (c: Corner) => {
    try {
      localStorage.setItem(PIP_KEY, JSON.stringify({ corner: c, seen: true }));
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => (setHint(false), remember(corner)), 4500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint]);
  return (
    <div
      className={`cv-pip c-${corner}${drag ? ' dragging' : ''}`}
      style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        const s0 = start.current;
        if (!s0) return;
        const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
        if (!s0.moved && Math.hypot(dx, dy) < 8) return;
        s0.moved = true;
        setDrag({ x: dx, y: dy });
      }}
      onPointerUp={(e) => {
        const s0 = start.current;
        start.current = null;
        setDrag(null);
        if (!s0) return;
        if (!s0.moved) return onTap?.();
        const left = e.clientX < window.innerWidth / 2;
        const top = e.clientY < window.innerHeight / 2;
        const c: Corner = `${top ? 't' : 'b'}${left ? 'l' : 'r'}` as Corner;
        haptic('tap');
        setCorner(c);
        setHint(false);
        remember(c);
      }}
      onPointerCancel={() => ((start.current = null), setDrag(null))}
      role="button"
      aria-label={t('Your camera. Drag to move, tap to swap.', 'আপনার ক্যামেরা। টেনে সরান, চাপলে বড়-ছোট বদলাবে।')}
    >
      <VideoView stream={stream} mirror={mirror} className="cv-pip-v" />
      <i className="cv-pip-grip" />
      {hint && <span className="cv-pip-hint"><Icon name="arrow-right" size={13} /> {t('Drag to any corner', 'টেনে যেকোনো কোণে নিন')}</span>}
    </div>
  );
}

/** WhatsApp-style answer: slide the green button up to answer (down to decline). Tap shows the hint. */
/**
 * WhatsApp-style call button: slide it up to act (answer or decline), so a pocket touch does nothing.
 * The green one rises by itself now and then to show how; a tap nudges it and shows the hint.
 */
function SwipeButton({ kind, video, label, hintText, onDone }: { kind: 'answer' | 'decline'; video?: boolean; label: string; hintText: string; onDone: () => void }) {
  const [dy, setDy] = useState(0);
  const [drag, setDrag] = useState(false);
  const [hint, setHint] = useState(0);
  const start = useRef(0);
  const UP = kind === 'answer' ? 110 : 100;
  const p = Math.min(1, -dy / UP);
  const answer = kind === 'answer';
  return (
    <span className={`cs-act cs-swipe ${kind}`}>
      {answer && (
        <span className="csw-arrows" style={{ opacity: drag ? 1 - p : 1 }} aria-hidden>
          <Icon name="chevron-down" size={22} /><Icon name="chevron-down" size={22} /><Icon name="chevron-down" size={22} />
        </span>
      )}
      <button
        type="button"
        className={`cs-btn ${answer ? 'accept' : 'end'} csw-btn${drag ? ' drag' : ''}${hint ? ' nudge' : ''}`}
        key={hint}
        style={{ transform: `translateY(${dy}px) scale(${drag ? 1.1 : 1})`, ['--p' as any]: p }}
        aria-label={label}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          start.current = e.clientY;
          setDrag(true);
        }}
        onPointerMove={(e) => drag && setDy(Math.max(-UP * 1.3, Math.min(0, e.clientY - start.current)))}
        onPointerUp={(e) => {
          const d = e.clientY - start.current;
          setDrag(false);
          if (d <= -UP) {
            haptic(answer ? 'success' : 'heavy');
            setDy(-UP * 1.6);
            return onDone();
          }
          setDy(0);
          setHint((n) => n + 1);
        }}
        onPointerCancel={() => (setDrag(false), setDy(0))}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDone()}
      >
        <Icon name={answer ? (video ? 'video' : 'phone') : 'phone-off'} size={answer ? 28 : 26} />
      </button>
      <small key={`h${hint}`} className={hint ? 'csw-hint pop' : 'csw-hint'}>{hint && !answer ? hintText : label}</small>
    </span>
  );
}

/** A live camera picture (sound plays separately, so the video itself is muted). */
function VideoView({ stream, mirror, className }: { stream: MediaStream; mirror?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} className={`${className}${mirror ? ' mirror' : ''}`} autoPlay playsInline muted />;
}
