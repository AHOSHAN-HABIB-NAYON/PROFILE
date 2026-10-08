import type { ClientToServerEvents, ServerToClientEvents } from '@quizwar/shared';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { API_URL, ApiError, getAccessToken, refreshSession } from './api';
import { setClockOffset, useGame } from './game';
import { appVersionCode, isNative, platform } from './platform';

type QSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ConnState {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting';
  online: number;
  set: (p: Partial<ConnState>) => void;
}
export const useConn = create<ConnState>((set) => ({ status: 'idle', online: 0, set: (p) => set(p) }));

let socket: QSocket | null = null;
const listeners: ((s: QSocket) => void)[] = [];

/** Register handlers that must be (re)attached to every socket instance. */
export function onSocket(fn: (s: QSocket) => void) {
  listeners.push(fn);
  if (socket) fn(socket);
}

export function getSocket() {
  return socket;
}

async function syncClock(s: QSocket) {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res: any = await s.timeout(4000).emitWithAck('time:sync', { clientTime: t0 }).catch(() => null);
    if (!res?.ok) continue;
    const t1 = Date.now();
    samples.push(res.serverTime + (t1 - t0) / 2 - t1);
  }
  if (samples.length) setClockOffset(samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]);
}

export function connectSocket() {
  if (socket) return socket;
  useConn.getState().set({ status: 'connecting' });
  const s: QSocket = io(API_URL || undefined, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAccessToken(), platform: isNative ? platform : 'web', versionCode: appVersionCode() }),
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10000,
  });
  socket = s;
  s.on('connect', () => {
    useConn.getState().set({ status: 'connected' });
    void syncClock(s);
    // Resume an in-progress match after a network drop.
    const matchId = useGame.getState().matchId;
    if (matchId) {
      void s.timeout(6000).emitWithAck('match:resume', { matchId }).then((r: any) => {
        if (r?.ok && r.snapshot) useGame.getState().applySnapshot(r.snapshot);
      }).catch(() => undefined);
    }
  });
  s.on('disconnect', () => useConn.getState().set({ status: 'reconnecting' }));
  s.on('connect_error', async (err) => {
    useConn.getState().set({ status: 'reconnecting' });
    if (err.message === 'unauthorized') {
      // Access token expired: refresh, then let socket.io retry with the new token.
      const ok = await refreshSession();
      if (!ok) disconnectSocket();
      else if (!s.active) s.connect();
    }
  });
  s.on('presence:count', ({ online }) => useConn.getState().set({ online }));
  for (const fn of listeners) fn(s);
  return s;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  useConn.getState().set({ status: 'idle' });
}

/** Emit with acknowledgement; rejects with ApiError on failure/timeout. */
export async function emit<E extends keyof ClientToServerEvents>(event: E, payload?: any, timeoutMs = 8000): Promise<any> {
  const s = socket;
  if (!s || !s.connected) throw new ApiError(0, 'network', 'Not connected. Reconnecting…');
  let res: any;
  try {
    res = payload === undefined ? await (s.timeout(timeoutMs) as any).emitWithAck(event) : await (s.timeout(timeoutMs) as any).emitWithAck(event, payload);
  } catch {
    throw new ApiError(0, 'timeout', 'The server did not respond. Check your connection.');
  }
  if (!res?.ok) throw new ApiError(400, res?.code ?? 'error', res?.message ?? 'Something went wrong');
  return res;
}
