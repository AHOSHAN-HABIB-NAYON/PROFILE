import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Bootstrap, PublicSettings } from './types';

declare global {
  interface Window { __SG_BOOT__?: { settings: PublicSettings } }
}

const Ctx = createContext<Bootstrap | null>(null);

export function useBootstrap() {
  return useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => api.get<Bootstrap>('/api/public/bootstrap'),
    staleTime: 5 * 60_000,
    placeholderData: window.__SG_BOOT__ ? ({ settings: window.__SG_BOOT__.settings, categories: [], pages: [] } as Bootstrap) : undefined,
  });
}

export function BootstrapProvider({ value, children }: { value: Bootstrap; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): PublicSettings {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside BootstrapProvider');
  return v.settings;
}

export function useStoreData(): Bootstrap {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStoreData outside BootstrapProvider');
  return v;
}
