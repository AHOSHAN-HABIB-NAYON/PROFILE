import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type Lang = 'bn' | 'en';

interface SettingsState {
  theme: Theme;
  lang: Lang;
  /** First-run intro carousel seen on this device. */
  introSeen: boolean;
  /** Notification permission explainer already shown. */
  pushAsked: boolean;
  /** Wins counted towards the "rate the app" prompt; -1 = asked already. */
  rateCounter: number;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  /** Floating round chat heads for new messages (Messenger style). */
  chatHeads: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      lang: 'bn',
      introSeen: false,
      pushAsked: false,
      rateCounter: 0,
      sound: true,
      music: true,
      haptics: true,
      reduceMotion: false,
      chatHeads: true,
      set: (patch) => set(patch),
    }),
    { name: 'qw-settings' },
  ),
);

export function applyTheme(theme: Theme, reduceMotion: boolean) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  document.documentElement.lang = useSettings.getState().lang;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f1e' : '#1d4ed8');
}
