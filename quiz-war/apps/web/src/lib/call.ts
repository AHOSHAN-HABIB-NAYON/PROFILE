import type { CallEndReason, PublicUser } from '@quizwar/shared';
import { handlePremiumError, needPremium } from './premium';
import { create } from 'zustand';
import { tr } from './i18n';
import { isNative } from './platform';
import { API_URL } from './api';
import { useAuth } from './auth';
import { emit, onSocket } from './socket';
import { toast } from './toast';
import { joinVoice, leaveVoice, setLoudSpeaker, setMic, useVoice } from './voice';

/**
 * One-to-one audio calls from the chat. The server rings the other phone; once picked up, both
 * phones join a voice room named after the call (the same phone-to-phone voice as in matches).
 */

export type CallPhase = 'calling' | 'ringing' | 'connecting' | 'live' | 'ended';

export interface ActiveCall {
  id: string | null;
  peer: PublicUser;
  dir: 'out' | 'in';
  phase: CallPhase;
  /** When the talking started (live). */
  startedAt: number;
  /** Shown for a moment after the call ends. */
  endText?: string;
  /** Everyone in the call, me included (group calls; empty until the server says). */
  members?: { user: PublicUser; state: 'ringing' | 'active' }[];
  /** Incoming group call: who is already talking. */
  with?: string[];
}

interface CallState {
  call: ActiveCall | null;
  /** Call screen folded into a small bar (to use the chat during a call). */
  small: boolean;
  loud: boolean;
  set: (p: Partial<Omit<CallState, 'set'>>) => void;
}

export const useCall = create<CallState>((set) => ({ call: null, small: false, loud: false, set: (p) => set(p) }));

const patch = (p: Partial<ActiveCall>) => {
  const c = useCall.getState().call;
  if (c) useCall.getState().set({ call: { ...c, ...p } });
};

/* ------------------------------- Tones ------------------------------- */

let tone: { stop: () => void } | null = null;

function stopTone() {
  tone?.stop();
  tone = null;
  try {
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

/** Ringback for the caller ("ring… ring…") or a soft ringtone for the person being called. */
function playTone(kind: 'ringback' | 'ringtone') {
  stopTone();
  if (kind === 'ringtone') {
    // The QUIZ WAR ringtone (same tune as the phone notification), looped, with vibration.
    const a = new Audio('/audio/ringtone.mp3');
    a.loop = true;
    a.volume = 0.9;
    void a.play().catch(() => undefined);
    const vib = () => {
      try {
        navigator.vibrate?.([700, 500, 700]);
      } catch {
        /* ignore */
      }
    };
    vib();
    const timer = window.setInterval(vib, 2400);
    tone = {
      stop: () => {
        window.clearInterval(timer);
        a.pause();
        a.src = '';
      },
    };
    return;
  }
  const C = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!C) return;
  const ctx: AudioContext = new C();
  void ctx.resume().catch(() => undefined);
  const out = ctx.createGain();
  out.gain.value = kind === 'ringback' ? 0.09 : 0.16;
  out.connect(ctx.destination);
  const beep = (at: number, freqs: number[], len: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(1, at + 0.03);
    g.gain.setValueAtTime(1, at + len - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    g.connect(out);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(at);
      o.stop(at + len + 0.02);
    }
  };
  const cycle = () => {
    const t = ctx.currentTime + 0.05;
    if (kind === 'ringback') {
      beep(t, [425, 850], 1.0);
    }
  };
  cycle();
  const timer = window.setInterval(cycle, 3000);
  tone = {
    stop: () => {
      window.clearInterval(timer);
      void ctx.close().catch(() => undefined);
    },
  };
}

function endBeep() {
  const C = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!C) return;
  try {
    const ctx: AudioContext = new C();
    const g = ctx.createGain();
    g.gain.value = 0.08;
    g.connect(ctx.destination);
    [480, 380].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.18);
    });
    window.setTimeout(() => void ctx.close().catch(() => undefined), 900);
  } catch {
    /* ignore */
  }
}

/* --------------------------- Native helpers --------------------------- */

type CallPlugin = {
  start(o: { title: string; text: string }): Promise<void>;
  stop(): Promise<void>;
  proximity(o: { on: boolean }): Promise<void>;
  pending?(): Promise<{ action?: string | null; callId?: string | null; url?: string | null }>;
  cancelIncoming?(): Promise<void>;
  showOnLock?(o: { on: boolean }): Promise<void>;
  setApi?(o: { base: string }): Promise<void>;
};
async function native(): Promise<CallPlugin | null> {
  if (!isNative) return null;
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isPluginAvailable('QwCall')) return null;
    return registerPlugin<CallPlugin>('QwCall');
  } catch {
    return null;
  }
}

/** Stop the phone's ringing notification once the call is answered or over. */
async function clearRingNotification() {
  try {
    await (await native())?.cancelIncoming?.();
  } catch {
    /* older app */
  }
}

const overLock = (on: boolean) => void native().then((n) => n?.showOnLock?.({ on })).catch(() => undefined);

/** Answer / Decline tapped on the phone's call notification (the app may have just started). */
let answerWhenRinging: string | null = null;
let declineOnConnect: string | null = null;

async function nativeAction() {
  const n = await native();
  const r = await n?.pending?.().catch(() => null);
  if (!r?.action || !r.callId) return;
  if (r.action === 'message') {
    // Declined from the ringing screen; open the chat with the caller.
    if (useCall.getState().call?.id === r.callId) clearCall();
    if (r.url?.startsWith('/')) {
      const { navigateTo } = await import('./nav');
      navigateTo(r.url);
    }
    return;
  }
  if (r.action === 'answer') {
    answerWhenRinging = r.callId;
    const c = useCall.getState().call;
    if (c?.id === r.callId && c.phase === 'ringing') void answerCall();
  } else if (r.action === 'decline') {
    const c = useCall.getState().call;
    if (c?.id === r.callId) declineCall();
    else {
      declineOnConnect = r.callId;
      void emit('call:decline', { callId: r.callId }).then(() => (declineOnConnect = null)).catch(() => undefined);
    }
    overLock(false);
    try {
      const { App } = await import('@capacitor/app');
      await App.minimizeApp();
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------ Actions ------------------------------ */

let endTimer: number | undefined;

function clearCall() {
  window.clearTimeout(endTimer);
  stopTone();
  useCall.getState().set({ call: null, small: false, loud: false });
  void native().then((n) => n?.stop()).catch(() => undefined);
  void clearRingNotification();
  overLock(false);
}

const endTexts = (reason: CallEndReason, dir: 'out' | 'in'): string =>
  ({
    ended: tr('Call ended', 'কল শেষ'),
    missed: dir === 'out' ? tr('No answer', 'কেউ ধরেনি') : tr('Missed call', 'মিসড কল'),
    declined: dir === 'out' ? tr('Call declined', 'কল কেটে দিয়েছে') : tr('Call ended', 'কল শেষ'),
    cancelled: tr('Call ended', 'কল শেষ'),
    busy: tr('On another call', 'অন্য কলে আছে'),
    lost: tr('Connection lost', 'সংযোগ বিচ্ছিন্ন'),
    elsewhere: tr('Answered on another device', 'অন্য ডিভাইসে ধরা হয়েছে'),
  })[reason];

/** Show the end state for a moment, then close the call screen. */
function finish(text: string, quiet = false) {
  const c = useCall.getState().call;
  stopTone();
  if (c?.id && useVoice.getState().roomId === c.id) leaveVoice();
  void native().then((n) => n?.stop()).catch(() => undefined);
  if (!c) return;
  if (!quiet) endBeep();
  patch({ phase: 'ended', endText: text });
  useCall.getState().set({ small: false });
  window.clearTimeout(endTimer);
  endTimer = window.setTimeout(clearCall, 1600);
}

/** Both phones are in: join the call's voice room with the mic on, on the earpiece. */
async function goLive(id: string) {
  const c = useCall.getState().call;
  if (!c) return;
  patch({ phase: 'connecting' });
  try {
    await joinVoice(id, true, { earpiece: true });
    patch({ phase: 'live', startedAt: Date.now() });
    const n = await native();
    await n?.start({ title: c.peer.username, text: tr('Audio call · tap to return', 'অডিও কল চলছে · ফিরতে চাপুন') });
    await n?.proximity({ on: true });
  } catch {
    toast.error(tr('Microphone blocked', 'মাইক্রোফোনের অনুমতি নেই'), tr('Allow the microphone for QUIZ WAR to talk on calls.', 'কলে কথা বলতে QUIZ WAR-এর মাইক্রোফোন চালু করুন।'));
    void emit('call:end', { callId: id }).catch(() => undefined);
    finish(tr('Call ended', 'কল শেষ'));
  }
}

export async function startCall(peer: PublicUser) {
  const cur = useCall.getState().call;
  if (cur && cur.phase !== 'ended') {
    useCall.getState().set({ small: false });
    return;
  }
  window.clearTimeout(endTimer);
  // Ask for the mic first, so the call doesn't ring for nothing.
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch {
    toast.error(tr('Microphone blocked', 'মাইক্রোফোনের অনুমতি নেই'), tr('Allow the microphone for QUIZ WAR to make calls.', 'কল করতে QUIZ WAR-এর মাইক্রোফোন চালু করুন।'));
    return;
  }
  useCall.getState().set({ call: { id: null, peer, dir: 'out', phase: 'calling', startedAt: 0 }, small: false, loud: false });
  playTone('ringback');
  try {
    const r = await emit('call:start', { to: peer.id });
    if (!useCall.getState().call) return void emit('call:end', { callId: r.callId }).catch(() => undefined);
    patch({ id: r.callId });
  } catch (e: any) {
    const code = e?.code;
    if (code === 'premium_required') {
      finish(tr('Calls need Premium', 'কল করতে প্রিমিয়াম লাগবে'));
      handlePremiumError(e, 'calls');
      return;
    }
    finish(
      code === 'busy'
        ? tr('On another call', 'অন্য কলে আছে')
        : code === 'call_not_allowed'
          ? tr('You can call friends only', 'শুধু বন্ধুদের কল করা যায়')
          : code === 'calls_disabled'
            ? tr('Calls are off right now', 'কল এখন বন্ধ আছে')
            : code === 'in_call'
              ? tr('You are already in a call', 'আপনি আরেকটি কলে আছেন')
              : (e?.message ?? tr('Could not call', 'কল করা গেল না')),
    );
  }
}

export async function answerCall() {
  const c = useCall.getState().call;
  if (!c?.id || c.dir !== 'in' || c.phase !== 'ringing') return;
  stopTone();
  void clearRingNotification();
  patch({ phase: 'connecting' });
  try {
    await emit('call:answer', { callId: c.id });
  } catch {
    return finish(tr('Call ended', 'কল শেষ'));
  }
  await goLive(c.id);
}

export function declineCall() {
  const c = useCall.getState().call;
  if (c?.id) void emit('call:decline', { callId: c.id }).catch(() => undefined);
  finish(tr('Call declined', 'কল কেটে দিয়েছেন'));
}

export function hangUp() {
  const c = useCall.getState().call;
  if (!c) return;
  if (c.id) void emit('call:end', { callId: c.id }).catch(() => undefined);
  finish(tr('Call ended', 'কল শেষ'));
}

/** Bring a friend into the live call (group call, up to 4 people). */
export async function addToCall(user: PublicUser) {
  const c = useCall.getState().call;
  if (!c?.id || c.phase !== 'live') return false;
  if (needPremium('calls')) return false;
  try {
    await emit('call:add', { callId: c.id, to: user.id });
    return true;
  } catch (e: any) {
    if (handlePremiumError(e, 'calls')) return false;
    toast.error(
      e?.code === 'busy' ? tr('On another call', 'অন্য কলে আছে') : e?.code === 'call_full' ? tr('Up to 4 people in a call', 'একটি কলে সর্বোচ্চ ৪ জন') : tr('Could not add', 'যোগ করা গেল না'),
      e?.code === 'busy' || e?.code === 'call_full' ? undefined : e?.message,
    );
    return false;
  }
}

export function toggleCallMute() {
  const v = useVoice.getState();
  void setMic(!v.micOn).catch(() => undefined);
}

export function toggleLoud() {
  const loud = !useCall.getState().loud;
  useCall.getState().set({ loud });
  setLoudSpeaker(loud);
  void native().then((n) => n?.proximity({ on: !loud })).catch(() => undefined);
}

let wired = false;
/** Listen for calls (once, after sign-in). */
export function wireCalls() {
  if (wired) return;
  wired = true;
  // Answer / Decline from the phone's call notification.
  void nativeAction();
  // The phone needs the server address to decline from the lock screen without opening the app.
  if (/^https:\/\//.test(API_URL)) void native().then((n) => n?.setApi?.({ base: API_URL })).catch(() => undefined);
  window.addEventListener('qwcallaction', () => void nativeAction());
  // Back in the app while it rings: the in-app ringtone takes over from the notification.
  document.addEventListener('visibilitychange', () => {
    const c = useCall.getState().call;
    if (document.hidden || !c || c.dir !== 'in' || c.phase !== 'ringing') return;
    void clearRingNotification();
    if (!tone) playTone('ringtone');
  });
  onSocket((s) => {
    s.on('connect', () => {
      if (declineOnConnect) void emit('call:decline', { callId: declineOnConnect }).then(() => (declineOnConnect = null)).catch(() => undefined);
    });
    s.on('call:members', ({ callId, members }) => {
      const c = useCall.getState().call;
      if (c?.id !== callId) return;
      // Back to two people: the screen shows whoever is left.
      const me = useAuth.getState().user?.id;
      const others = members.filter((m) => m.user.id !== me);
      patch({ members, ...(others.length === 1 ? { peer: others[0]!.user } : {}) });
    });
    s.on('call:incoming', ({ callId, from, with: others }) => {
      const cur = useCall.getState().call;
      if (cur && cur.id === callId) return;
      if (cur && cur.phase !== 'ended') {
        // Already talking to someone: the server marks the other call busy; nothing to show.
        return;
      }
      window.clearTimeout(endTimer);
      useCall.getState().set({ call: { id: callId, peer: from, dir: 'in', phase: 'ringing', startedAt: 0, ...(others?.length ? { with: others } : {}) }, small: false, loud: false });
      if (answerWhenRinging === callId) {
        answerWhenRinging = null;
        void answerCall();
        return;
      }
      overLock(true);
      // App in the background: the phone's own call notification rings (no double ringing).
      if (!(isNative && document.hidden)) playTone('ringtone');
    });
    s.on('call:accepted', ({ callId, elsewhere }) => {
      const c = useCall.getState().call;
      if (!c || c.id !== callId) return;
      if (elsewhere) return finish(endTexts('elsewhere', c.dir), true);
      stopTone();
      void goLive(callId);
    });
    s.on('call:ended', ({ callId, reason }) => {
      const c = useCall.getState().call;
      if (!c || c.id !== callId || c.phase === 'ended') return;
      finish(endTexts(reason, c.dir));
    });
  });
}
