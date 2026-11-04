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

/** Speaking indicator: a cheap level check 6× a second. */
function startMeter() {
  if (meter) return;
  meter = window.setInterval(() => {
    const st = useVoice.getState();
    const next: Record<number, boolean> = {};
    if (st.micOn && level(localAnalyser) > 6) next[0] = true;
    for (const [uid, p] of peers) if (!st.mutedForMe[uid] && level(p.analyser) > 6) next[uid] = true;
    const prev = st.speaking;
    const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[Number(k)]);
    if (!same) st.set({ speaking: next });
  }, 160);
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

function peerFor(uid: number): PeerConn {
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
  if (local) for (const tr of local.getAudioTracks()) pc.addTrack(tr, local);
  pc.onicecandidate = (e) => e.candidate && signal(uid, { candidate: e.candidate.toJSON() as any });
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    conn.analyser = analyse(stream);
  };
  pc.onnegotiationneeded = async () => {
    try {
      conn.makingOffer = true;
      await pc.setLocalDescription();
      if (pc.localDescription) signal(uid, { sdp: { type: pc.localDescription.type as 'offer', sdp: pc.localDescription.sdp } });
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
        await pc.setLocalDescription();
        if (pc.localDescription) signal(from, { sdp: { type: 'answer', sdp: pc.localDescription.sdp } });
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
      if (roomId && local) {
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
  for (const p of r.peers as VoicePeer[]) peerFor(p.userId);
}

/** Ask what the room's voice chat looks like (for the "opponent is in voice" hint). */
export function watchVoice(roomId: string) {
  wire();
  if (getSocket()?.connected) void emit('voice:who', { roomId }).then((r) => {
    const st = useVoice.getState();
    st.set({ members: { ...st.members, [roomId]: r.peers } });
  }).catch(() => undefined);
}

/** Join with the mic on (the player tapped the mic). Throws if the mic is blocked. */
export async function joinVoice(roomId: string) {
  wire();
  const st = useVoice.getState();
  if (st.roomId === roomId) return setMic(true);
  if (st.roomId) leaveVoice();
  st.set({ joining: true });
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    localAnalyser = analyse(local) ?? null;
    useVoice.getState().set({ roomId, micOn: true });
    await connectRoom(roomId, true);
    startMeter();
  } catch (e) {
    leaveVoice(false);
    throw e;
  } finally {
    useVoice.getState().set({ joining: false });
  }
}

export function setMic(on: boolean) {
  const st = useVoice.getState();
  if (!st.roomId || !local) return;
  for (const tr of local.getAudioTracks()) tr.enabled = on;
  st.set({ micOn: on });
  void emit('voice:mic', { roomId: st.roomId, on }).catch(() => undefined);
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
  st.set({ roomId: null, micOn: false, joining: false });
  if (roomId && tellServer) void emit('voice:leave', { roomId }).catch(() => undefined);
}

/** The app went to the background: the mic turns off (privacy). */
export function voiceBackground() {
  if (useVoice.getState().micOn) setMic(false);
}

export const voiceSupported = () => typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
