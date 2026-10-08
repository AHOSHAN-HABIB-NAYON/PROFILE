import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onAuthLost, refresh, setToken } from './api';

export interface Admin {
  id: number;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
}

interface Ctx {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
}

const AuthCtx = createContext<Ctx>(null as any);
export const useAdmin = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    onAuthLost(() => setAdmin(null));
    refresh()
      .then(async (ok) => (ok ? setAdmin(await api('/auth/me')) : null))
      .finally(() => setLoading(false));
  }, []);
  const value: Ctx = {
    admin,
    loading,
    login: async (email, password) => {
      const r = await api('/auth/login', { body: { email, password } });
      setToken(r.accessToken);
      setAdmin(await api('/auth/me'));
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      setToken(null);
      setAdmin(null);
    },
    can: (p) => !!admin?.permissions.includes(p),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
