import type { LudoSnapshot } from '@quizwar/shared';
import { create } from 'zustand';
import { tr } from './i18n';
import { navigateTo } from './nav';
import { emit, onSocket } from './socket';
import { toast } from './toast';

/** Online Ludo: the latest snapshot of my game, and whether I am waiting for a match. */
interface LudoOnlineState {
  snap: LudoSnapshot | null;
  /** Auto match I'm waiting in, with when I started. */
  queue: { mode: '1v1' | '2v2'; since: number } | null;
  set: (p: Partial<Omit<LudoOnlineState, 'set'>>) => void;
}

export const useLudo = create<LudoOnlineState>((set) => ({ snap: null, queue: null, set: (p) => set(p) }));

/** Snapshots arrive in order; the game screen animates each one. */
type Listener = (s: LudoSnapshot) => void;
const listeners = new Set<Listener>();
export function onLudoSnap(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

let wired = false;
export function wireLudo() {
  if (wired) return;
  wired = true;
  onSocket((s) => {
    s.on('ludo:snap', (snap) => {
      const cur = useLudo.getState().snap;
      if (cur && cur.id === snap.id && snap.seq <= cur.seq) return;
      useLudo.getState().set({ snap });
      for (const l of listeners) l(snap);
      // A running game I'm not looking at (came back to the app): offer to return.
      if (snap.status === 'playing' && !window.location.pathname.startsWith(`/ludo/online/${snap.id}`) && (!cur || cur.id !== snap.id || cur.status !== 'playing')) {
        toast.custom({
          kind: 'info',
          icon: 'gamepad',
          title: tr('Your Ludo game is on', 'আপনার লুডু খেলা চলছে'),
          ttl: 8000,
          actions: [{ label: tr('Back to game', 'খেলায় ফিরুন'), primary: true, onClick: () => navigateTo(`/ludo/online/${snap.id}`) }],
        });
      }
    });
    s.on('ludo:matched', ({ gameId }) => {
      useLudo.getState().set({ queue: null });
      navigateTo(`/ludo/online/${gameId}`);
    });
    s.on('ludo:invited', ({ code, from }) => {
      toast.custom({
        kind: 'info',
        icon: 'gamepad',
        title: tr(`${from.username} invited you to Ludo`, `${from.username} আপনাকে লুডু খেলতে ডেকেছে`),
        ttl: 20000,
        actions: [{ label: tr('Join', 'যোগ দিন'), primary: true, onClick: () => navigateTo(`/ludo/room/${code}`) }],
      });
    });
  });
}

export async function ludoQueue(mode: '1v1' | '2v2') {
  useLudo.getState().set({ queue: { mode, since: Date.now() } });
  try {
    const r = await emit('ludo:queue', { mode });
    if (r.gameId) {
      useLudo.getState().set({ queue: null });
      navigateTo(`/ludo/online/${r.gameId}`);
    }
  } catch (e: any) {
    useLudo.getState().set({ queue: null });
    toast.error(tr('Could not start', 'শুরু করা গেল না'), e?.message);
  }
}

export function ludoUnqueue() {
  useLudo.getState().set({ queue: null });
  void emit('ludo:unqueue', {}).catch(() => undefined);
}

export const ludoAct = (event: 'ludo:roll' | 'ludo:start' | 'ludo:leave' | 'ludo:rematch', gameId: string) =>
  emit(event, { gameId }).catch((e: any) => {
    if (event !== 'ludo:leave') toast.error(tr('Not now', 'এখন হবে না'), e?.message);
  });
