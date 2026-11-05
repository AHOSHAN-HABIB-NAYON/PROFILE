import type { VoiceIceServer, VoicePeer, VoiceSignal } from '@quizwar/shared';
import { create } from 'zustand';
import { useAuth } from './auth';
import { emit, getSocket, onSocket } from './socket';

/**
 * Live voice in a match / war room. Audio goes phone-to-phone (WebRTC mesh, max a few players);
 * the server only relays the connection messages, so Hostinger stays light. The mic is off until
 * the player taps it, nothing is recorded, and anyone can be muted "for me only".
 */

interface VoiceState {
  /** Room (match id) this device has joined, or null. */
  roomId: string | null;
  joining: boolean;
  micOn: boolean;
  /** Everyone in the voice chat of the room we look at (joined or not). */
  members: Record<string, VoicePeer[]>;
  /** Players I muted for myself (userId → true). */
  mutedForMe: Record<number, boolean>;
  /** Who is talking right now (userId; 0 = me). */
  speaking: Record<number, boolean>;
  set: (p: Partial<Omit<VoiceState, 'set'>>) => void;
}

export const useVoice = create<VoiceState>((set) => ({
  roomId: null,
  joining: false,
  micOn: false,
  members: {},
  mutedForMe: {},
  speaking: {},
  set: (p) => set(p),
}));

const myId = () => useAuth.getState().user?.id ?? 0;

interface PeerConn {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  makingOffer: boolean;
  polite: boolean;
  analyser?: AnalyserNode;
}

let local: MediaStream | null = null;
let ice: VoiceIceServer[] = [];
const peers = new Map<number, PeerConn>();
/** For checking a voice problem from the browser console. */
(globalThis as any).__qwVoice = peers;
let actx: AudioContext | null = null;
let meter: number | undefined;
let localAnalyser: AnalyserNode | null = null;

function audioCtx() {
  if (!actx) {
    const C = window.AudioContext ?? (window as any).webkitAudioContext;
    if (C) actx = new C();
  }
  if (actx?.state === 'suspended') void actx.resume().catch(() => undefined);
  return actx;
}

function analyse(stream: MediaStream): AnalyserNode | undefined {
  const c = audioCtx();
  if (!c) return undefined;
  try {
    const src = c.createMediaStreamSource(stream);
    const a = c.createAnalyser();
    a.fftSize = 512;
    src.connect(a);
    return a;
  } catch {
    return undefined;
  }
}

const level = (a?: AnalyserNode | null) => {
  if (!a) return 0;
  const buf = new Uint8Array(a.fftSize);
  a.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += (v - 128) * (v - 128);
  return Math.sqrt(sum / buf.length);
};

/** Speaking indicator: incoming audio level from WebRTC stats (works without WebAudio), ~3× a second. */
function startMeter() {
  if (meter) return;
  let busy = false;
  meter = window.setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const st = useVoice.getState();
      const next: Record<number, boolean> = {};
      if (st.micOn && level(localAnalyser) > 6) next[0] = true;
      for (const [uid, p] of peers) {
        if (st.mutedForMe[uid]) continue;
        const r = await p.pc.getStats().catch(() => null);
        r?.forEach((x: any) => {
          if (x.type === 'inbound-rtp' && x.kind === 'audio' && (x.audioLevel ?? 0) > 0.02) next[uid] = true;
        });
      }
      const prev = useVoice.getState().speaking;
      const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[Number(k)]);
      if (!same) useVoice.getState().set({ speaking: next });
    } finally {
      busy = false;
    }
  }, 350);
}

function stopMeter() {
  window.clearInterval(meter);
  meter = undefined;
  useVoice.getState().set({ speaking: {} });
}

function signal(to: number, data: VoiceSignal) {
  const roomId = useVoice.getState().roomId;
  if (roomId) void emit('voice:signal', { roomId, to, data }).catch(() => undefined);
}

function closePeer(uid: number) {
  const p = peers.get(uid);
  if (!p) return;
  peers.delete(uid);
  try {
    p.pc.close();
  } catch {
    /* ignore */
  }
  p.audio.srcObject = null;
  p.audio.remove();
}

/** Clear, steady speech: Opus at ~56 kbps (full-band voice) with packet-loss protection, mono. */
function tuneOpus(sdp: string) {
  const m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
  if (!m) return sdp;
  const pt = m[1];
  const extra = 'maxaveragebitrate=56000;useinbandfec=1;stereo=0;sprop-stereo=0;usedtx=0';
  const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  if (re.test(sdp)) return sdp.replace(re, (_l, p: string) => `a=fmtp:${pt} ${p.split(';').filter((x) => !/^(maxaveragebitrate|useinbandfec|stereo|sprop-stereo|usedtx)=/.test(x)).concat(extra).join(';')}`);
  return sdp.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${extra}`);
}

async function describe(pc: RTCPeerConnection, type: 'offer' | 'answer') {
  const d = type === 'offer' ? await pc.createOffer() : await pc.createAnswer();
  await pc.setLocalDescription({ type: d.type, sdp: tuneOpus(d.sdp ?? '') });
  return pc.localDescription!;
}

/** Puts my mic track (or nothing, while listening only) on every connection. */
function attachMic(pc: RTCPeerConnection) {
  const track = local?.getAudioTracks()[0] ?? null;
  for (const t of pc.getTransceivers()) {
    if (t.receiver.track?.kind !== 'audio') continue;
    if (t.direction !== 'sendrecv') t.direction = 'sendrecv';
    if (t.sender.track !== track) void t.sender.replaceTrack(track).catch(() => undefined);
    // Voice first when the network is busy.
    try {
      const p = t.sender.getParameters();
      if (p.encodings?.length && p.encodings[0]!.priority !== 'high') {
        p.encodings[0]!.priority = 'high';
        p.encodings[0]!.networkPriority = 'high';
        void t.sender.setParameters(p).catch(() => undefined);
      }
    } catch {
      /* not supported */
    }
  }
}

function peerFor(uid: number, initiator = false): PeerConn {
  const have = peers.get(uid);
  if (have) return have;
  const pc = new RTCPeerConnection({ iceServers: ice as RTCIceServer[] });
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', '');
  audio.muted = !!useVoice.getState().mutedForMe[uid];
  audio.style.display = 'none';
  document.body.appendChild(audio);
  const conn: PeerConn = { pc, audio, makingOffer: false, polite: myId() > uid };
  peers.set(uid, conn);
  // One audio line both ways; my mic is attached later (replaceTrack), so listening works without it.
  if (initiator) pc.addTransceiver('audio', { direction: 'sendrecv' });
  attachMic(pc);
  pc.onicecandidate = (e) => e.candidate && signal(uid, { candidate: e.candidate.toJSON() as any });
  pc.ontrack = (e) => {
    // A small playout buffer (~80 ms) hides network jitter: smooth sound instead of crackles.
    try {
      (e.receiver as any).jitterBufferTarget = 80;
    } catch {
      /* older WebView */
    }
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    audio.srcObject = stream;
    audio.volume = 1;
    void audio.play().catch(() => undefined);
    conn.analyser = analyse(stream);
  };
  pc.onnegotiationneeded = async () => {
    try {
      conn.makingOffer = true;
      const d = await describe(pc, 'offer');
      signal(uid, { sdp: { type: 'offer', sdp: d.sdp } });
    } catch {
      /* ignore */
    } finally {
      conn.makingOffer = false;
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') pc.restartIce?.();
  };
  return conn;
}

/** "Perfect negotiation": both sides may offer; the polite one yields on a clash. */
async function onSignal(from: number, data: VoiceSignal) {
  const p = peerFor(from);
  const pc = p.pc;
  try {
    if ('sdp' in data) {
      const clash = data.sdp.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      if (clash && !p.polite) return;
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        attachMic(pc);
        const d = await describe(pc, 'answer');
        signal(from, { sdp: { type: 'answer', sdp: d.sdp } });
      }
    } else if ('candidate' in data) {
      await pc.addIceCandidate(data.candidate).catch(() => undefined);
    }
  } catch {
    /* ignore a bad message; the next one fixes it */
  }
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  onSocket((s) => {
    s.on('voice:peers', ({ roomId, peers: list }) => {
      const st = useVoice.getState();
      st.set({ members: { ...st.members, [roomId]: list } });
      if (st.roomId !== roomId) return;
      const me = myId();
      // Removed (e.g. joined from another phone): leave here.
      if (!st.joining && !list.some((x) => x.userId === me)) return void leaveVoice(false);
      for (const uid of [...peers.keys()]) if (!list.some((x) => x.userId === uid)) closePeer(uid);
    });
    s.on('voice:signal', ({ roomId, from, data }) => {
      if (useVoice.getState().roomId === roomId) void onSignal(from, data);
    });
    s.on('connect', () => {
      // Back after a network drop: join again.
      const { roomId, micOn } = useVoice.getState();
      if (roomId) {
        for (const uid of [...peers.keys()]) closePeer(uid);
        void connectRoom(roomId, micOn);
      }
    });
  });
}

async function connectRoom(roomId: string, mic: boolean) {
  const r = await emit('voice:join', { roomId, mic });
  ice = r.iceServers ?? [];
  // The newcomer calls everyone already there.
  for (const p of r.peers as VoicePeer[]) peerFor(p.userId, true);
}

/** Ask what the room's voice chat looks like (for the "opponent is in voice" hint). */
export function watchVoice(roomId: string) {
  wire();
  if (getSocket()?.connected) void emit('voice:who', { roomId }).then((r) => {
    const st = useVoice.getState();
    st.set({ members: { ...st.members, [roomId]: r.peers } });
  }).catch(() => undefined);
}

/** Join the room's voice: hear everyone at once; my mic stays off unless `mic` (asks permission). */
export async function joinVoice(roomId: string, mic = false, opts: { earpiece?: boolean } = {}) {
  wire();
  const st = useVoice.getState();
  if (st.roomId === roomId) return mic ? setMic(true) : undefined;
  if (st.roomId) leaveVoice();
  st.set({ joining: true, roomId });
  try {
    if (mic) await openMic();
    useVoice.getState().set({ micOn: mic });
    await connectRoom(roomId, mic);
    startMeter();
    loud = !opts.earpiece;
    void speaker(true);
  } catch (e) {
    leaveVoice(false);
    throw e;
  } finally {
    useVoice.getState().set({ joining: false });
  }
}

async function openMic() {
  if (local) return;
  local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 } });
  localAnalyser = analyse(local) ?? null;
  for (const p of peers.values()) attachMic(p.pc);
}

/** Turn my mic on/off. The first time it asks for the microphone (throws if blocked). */
export async function setMic(on: boolean) {
  const st = useVoice.getState();
  if (!st.roomId) return;
  if (on) await openMic();
  for (const tr of local?.getAudioTracks() ?? []) tr.enabled = on;
  st.set({ micOn: on });
  void emit('voice:mic', { roomId: st.roomId, on }).catch(() => undefined);
}

/** Loud speaker (matches, rooms) or the earpiece (calls, until the player taps "Speaker"). */
let loud = true;

/** Phones: route voice to the loud speaker or the earpiece (headphones always win). */
async function speaker(on: boolean) {
  try {
    const { isNative } = await import('./platform');
    if (!isNative) return;
    const { registerPlugin } = await import('@capacitor/core');
    const Audio = registerPlugin<{ speaker(o: { on: boolean; earpiece?: boolean }): Promise<void> }>('QwAudio');
    await Audio.speaker({ on, earpiece: on && !loud });
  } catch {
    /* older app without the plugin */
  }
}

/** Calls: switch between the earpiece and the loud speaker. */
export function setLoudSpeaker(on: boolean) {
  loud = on;
  if (useVoice.getState().roomId) void speaker(true);
}

/** Mute / unmute one player for me only. */
export function toggleMuteForMe(uid: number) {
  const st = useVoice.getState();
  const muted = !st.mutedForMe[uid];
  st.set({ mutedForMe: { ...st.mutedForMe, [uid]: muted } });
  const p = peers.get(uid);
  if (p) p.audio.muted = muted;
  return muted;
}

export function leaveVoice(tellServer = true) {
  const st = useVoice.getState();
  const roomId = st.roomId;
  for (const uid of [...peers.keys()]) closePeer(uid);
  local?.getTracks().forEach((tr) => tr.stop());
  local = null;
  localAnalyser = null;
  stopMeter();
  loud = true;
  void speaker(false);
  st.set({ roomId: null, micOn: false, joining: false });
  if (roomId && tellServer) void emit('voice:leave', { roomId }).catch(() => undefined);
}

/** The app went to the background: the mic turns off (privacy). */
export function voiceBackground() {
  if (useVoice.getState().micOn) void setMic(false);
}

/** Browsers may block sound until a tap: resume any paused voice on the next touch. */
export function resumeVoiceAudio() {
  for (const p of peers.values()) if (p.audio.paused && p.audio.srcObject) void p.audio.play().catch(() => undefined);
  if (actx?.state === 'suspended') void actx.resume().catch(() => undefined);
}

export const voiceSupported = () => typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
