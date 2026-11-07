import type { MeUser } from '@quizwar/shared';
import { create } from 'zustand';
import { api, configureApi, getAccessToken, lastRefreshFailure, logoutRequest, refreshSession, setAccessToken } from './api';
const accessTokenSet = () => !!getAccessToken();
import { tokenStore } from './token-store';

interface AuthState {
  /** 'offline': signed in on this device but the server can't be reached yet. */
  status: 'loading' | 'anon' | 'authed' | 'offline';
  user: MeUser | null;
  squadId: number | null;
  activeMatchId: string | null;
  /** A war room the player joined and hasn't left (it stays open until they tap Leave). */
  openRoomId: string | null;
  setUser: (u: MeUser) => void;
  patchUser: (p: Partial<MeUser>) => void;
  bootstrap: () => Promise<void>;
  loadMe: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  squadId: null,
  activeMatchId: null,
  openRoomId: null,
  setUser: (u) => set({ user: u, status: 'authed' }),
  patchUser: (p) => {
    const u = get().user;
    if (u) set({ user: { ...u, ...p } });
  },
  bootstrap: async () => {
    // Restore the session from the refresh cookie (web) or secure storage (Android).
    // A network failure never signs the player out: we keep the session and retry.
    const ok = await refreshSession();
    if (!ok) {
      let signedIn = false;
      try {
        signedIn = localStorage.getItem('qw-signed-in') === '1';
      } catch {
        /* storage blocked */
      }
      const remembered = lastRefreshFailure === 'network' && (signedIn || !!(await tokenStore.get()));
      if (!remembered) return set({ status: 'anon', user: null });
      // Weak / no internet: open the app with the saved profile and reconnect in the background.
      const cached = cachedUser();
      set(cached ? { status: 'authed', user: cached } : { status: 'offline', user: null });
      scheduleRetry();
      return;
    }
    await get()
      .loadMe()
      .catch(() => set({ status: 'offline' }));
  },
  loadMe: async () => {
    const me = await api<{ user: MeUser; squadId: number | null; activeMatchId: string | null; openRoomId?: string | null }>('/me');
    set({ user: me.user, squadId: me.squadId, activeMatchId: me.activeMatchId, openRoomId: me.openRoomId ?? null, status: 'authed' });
    try {
      localStorage.setItem('qw-signed-in', '1');
      localStorage.setItem(USER_KEY, JSON.stringify(me.user));
    } catch {
      /* storage blocked */
    }
  },
  logout: async () => {
    await logoutRequest();
    try {
      localStorage.removeItem('qw-signed-in');
      localStorage.removeItem(USER_KEY);
    } catch {
      /* storage blocked */
    }
    set({ status: 'anon', user: null, squadId: null, activeMatchId: null, openRoomId: null });
  },
}));

const USER_KEY = 'qw-me';
function cachedUser(): MeUser | null {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    return u && typeof u === 'object' && u.id ? (u as MeUser) : null;
  } catch {
    return null;
  }
}

/** Offline start: keep trying to reconnect (faster when the phone says it is online). */
let retryTimer: number | undefined;
function scheduleRetry(delay = 4000) {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(async () => {
    if (await refreshSession()) {
      await useAuth.getState().loadMe().catch(() => undefined);
      return;
    }
    if (lastRefreshFailure === 'network') scheduleRetry(Math.min(delay * 1.5, 30_000));
    else useAuth.setState({ status: 'anon', user: null });
  }, delay);
}
if (typeof window !== 'undefined') window.addEventListener('online', () => useAuth.getState().user && !accessTokenSet() && scheduleRetry(300));

configureApi({
  onAuthLost: () => {
    setAccessToken(null);
    try {
      localStorage.removeItem('qw-signed-in');
      localStorage.removeItem(USER_KEY);
    } catch {
      /* storage blocked */
    }
    useAuth.setState({ status: 'anon', user: null });
  },
  onTokens: ({ user }) => {
    if (user) useAuth.setState({ user, status: 'authed' });
  },
});
