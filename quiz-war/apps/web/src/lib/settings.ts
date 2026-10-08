import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      sound: true,
      music: false,
      haptics: true,
      reduceMotion: false,
      set: (patch) => set(patch),
    }),
    { name: 'qw-settings' },
  ),
);

export function applyTheme(theme: Theme, reduceMotion: boolean) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f1e' : '#1d4ed8');
}
