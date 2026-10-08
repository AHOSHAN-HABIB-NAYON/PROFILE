import type { PublicConfig } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api<PublicConfig>('/config', { auth: false }), staleTime: 60_000 });

export interface Category {
  id: number;
  slug: string;
  name: string;
  nameBn: string | null;
  icon: string;
  description: string | null;
  questionCount: number;
}
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: async () => (await api<{ items: Category[] }>('/categories', { auth: false })).items, staleTime: 5 * 60_000 });

export const useNotifications = () => {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: any[] }>('/notifications'), enabled: authed, staleTime: 60_000 });
};
