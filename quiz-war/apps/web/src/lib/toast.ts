import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  icon?: string;
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

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    const ttl = t.ttl ?? (t.actions ? 15000 : 3500);
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = {
  info: (title: string, body?: string, icon = 'ℹ️') => useToasts.getState().push({ kind: 'info', title, body, icon }),
  success: (title: string, body?: string, icon = '✅') => useToasts.getState().push({ kind: 'success', title, body, icon }),
  error: (title: string, body?: string) => useToasts.getState().push({ kind: 'error', title, body, icon: '⚠️' }),
  custom: (t: Omit<Toast, 'id'>) => useToasts.getState().push(t),
  dismiss: (id: number) => useToasts.getState().dismiss(id),
};
