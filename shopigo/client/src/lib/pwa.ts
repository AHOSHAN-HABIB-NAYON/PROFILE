import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export const usePwa = create<{ prompt: BeforeInstallPromptEvent | null; installed: boolean; ios: boolean }>(() => ({
  prompt: null,
  installed: typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true),
  ios: typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent),
}));

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* non-fatal */ });
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, prompt: null }));
}

export async function installApp(): Promise<boolean> {
  const p = usePwa.getState().prompt;
  if (!p) return false;
  await p.prompt();
  const choice = await p.userChoice;
  usePwa.setState({ prompt: null, installed: choice.outcome === 'accepted' });
  return choice.outcome === 'accepted';
}
