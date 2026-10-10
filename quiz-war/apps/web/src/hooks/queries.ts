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
  /** Custom uploaded icon (admin); the built-in SVG icon is used when empty. */
  iconUrl?: string | null;
  color: string | null;
  description: string | null;
  questionCount: number;
}
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: async () => (await api<{ items: Category[] }>('/categories', { auth: false })).items, staleTime: 5 * 60_000 });

export const useNotifications = () => {
  const authed = useAuth((s) => s.status === 'authed');
  return useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: any[] }>('/notifications'), enabled: authed, staleTime: 60_000 });
};

export interface Mission {
  id: number;
  title: string;
  description: string | null;
  icon: string;
  period: 'daily' | 'weekly' | 'once';
  target: number;
  progress: number;
  rewardCoins: number;
  rewardXp: number;
  completed: boolean;
  claimed: boolean;
}

export const useMissions = () => useQuery({ queryKey: ['missions'], queryFn: () => api<{ items: Mission[]; claimable: number }>('/missions'), staleTime: 30_000 });
