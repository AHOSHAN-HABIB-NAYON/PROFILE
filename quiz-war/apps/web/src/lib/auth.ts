import type { MeUser } from '@quizwar/shared';
import { create } from 'zustand';
import { api, configureApi, logoutRequest, refreshSession, setAccessToken } from './api';

interface AuthState {
  status: 'loading' | 'anon' | 'authed';
  user: MeUser | null;
  squadId: number | null;
  activeMatchId: string | null;
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
  setUser: (u) => set({ user: u, status: 'authed' }),
  patchUser: (p) => {
    const u = get().user;
    if (u) set({ user: { ...u, ...p } });
  },
  bootstrap: async () => {
    // Restore the session from the refresh cookie (web) or secure storage (Android).
    const ok = await refreshSession();
    if (!ok) return set({ status: 'anon', user: null });
    await get().loadMe().catch(() => set({ status: 'anon' }));
  },
  loadMe: async () => {
    const me = await api<{ user: MeUser; squadId: number | null; activeMatchId: string | null }>('/me');
    set({ user: me.user, squadId: me.squadId, activeMatchId: me.activeMatchId, status: 'authed' });
  },
  logout: async () => {
    await logoutRequest();
    set({ status: 'anon', user: null, squadId: null, activeMatchId: null });
  },
}));

configureApi({
  onAuthLost: () => {
    setAccessToken(null);
    useAuth.setState({ status: 'anon', user: null });
  },
  onTokens: ({ user }) => {
    if (user) useAuth.setState({ user, status: 'authed' });
  },
});
