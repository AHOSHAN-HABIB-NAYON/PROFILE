import { create } from 'zustand';
import { hasIcon, type IconName } from '../components/Icon';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  icon?: IconName | string;
  title: string;
  body?: string;
  actions?: { label: string; primary?: boolean; onClick: () => void }[];
  ttl?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

const DEFAULT_ICON: Record<Toast['kind'], IconName> = { info: 'info', success: 'check-circle', error: 'alert-circle' };

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    const icon = hasIcon(t.icon) ? t.icon : DEFAULT_ICON[t.kind];
    set({ toasts: [...get().toasts.slice(-2), { ...t, icon, id }] });
    const ttl = t.ttl ?? (t.actions ? 15000 : 3800);
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = {
  info: (title: string, body?: string, icon?: IconName) => useToasts.getState().push({ kind: 'info', title, body, icon }),
  success: (title: string, body?: string, icon?: IconName) => useToasts.getState().push({ kind: 'success', title, body, icon }),
  error: (title: string, body?: string) => useToasts.getState().push({ kind: 'error', title, body }),
  custom: (t: Omit<Toast, 'id'>) => useToasts.getState().push(t),
  dismiss: (id: number) => useToasts.getState().dismiss(id),
};
