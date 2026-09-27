'use client';
import { createValueStore } from './store';

export type Theme = 'light' | 'dark';
const KEY = 'tt-theme';

/** Light is the default for every new visitor; the choice is remembered locally and on the profile. */
export const theme = createValueStore<Theme>('light');

export function initTheme() {
  let t: Theme = 'light';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') t = saved;
  } catch {
    /* storage unavailable */
  }
  applyTheme(t, false);
}

export function applyTheme(t: Theme, persist = true) {
  theme.set(t);
  document.documentElement.dataset.theme = t;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t === 'dark' ? '#0a0f1e' : '#f5f6fa');
  if (persist) {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }
}

/** Inline, render-blocking script to avoid a flash of the wrong theme. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${KEY}');document.documentElement.dataset.theme=(t==='dark'?'dark':'light');}catch(e){document.documentElement.dataset.theme='light';}})();`;
