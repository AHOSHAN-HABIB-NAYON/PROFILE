import type { MeUser } from '@quizwar/shared';
import { create } from 'zustand';
import { api, configureApi, lastRefreshFailure, logoutRequest, refreshSession, setAccessToken } from './api';
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
      const remembered = lastRefreshFailure === 'network' && (!!(await tokenStore.get()) || localStorage.getItem('qw-signed-in') === '1');
      return set({ status: remembered ? 'offline' : 'anon', user: null });
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
    } catch {
      /* storage blocked */
    }
  },
  logout: async () => {
    await logoutRequest();
    try {
      localStorage.removeItem('qw-signed-in');
    } catch {
      /* storage blocked */
    }
    set({ status: 'anon', user: null, squadId: null, activeMatchId: null, openRoomId: null });
  },
}));

configureApi({
  onAuthLost: () => {
    setAccessToken(null);
    try {
      localStorage.removeItem('qw-signed-in');
    } catch {
      /* storage blocked */
    }
    useAuth.setState({ status: 'anon', user: null });
  },
  onTokens: ({ user }) => {
    if (user) useAuth.setState({ user, status: 'authed' });
  },
});
