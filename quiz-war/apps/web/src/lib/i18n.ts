import { useCallback } from 'react';
import { api } from './api';
import { useSettings, type Lang } from './settings';

/**
 * Tiny bilingual helper: every UI string is written once in both languages right where it
 * is used — `t('Play', 'খেলুন')`. Bangla is the default.
 */
export function useT() {
  const lang = useSettings((s) => s.lang);
  return useCallback((en: string, bn: string) => (lang === 'en' ? en : bn), [lang]);
}

/** Non-hook variant for toasts and other code outside components. */
export const tr = (en: string, bn: string) => (useSettings.getState().lang === 'en' ? en : bn);

export function useLang() {
  return useSettings((s) => s.lang);
}

/** Switch language locally and tell the server (notifications + emails follow it). */
export function setLang(lang: Lang, signedIn: boolean) {
  useSettings.getState().set({ lang });
  document.documentElement.lang = lang;
  if (signedIn) void api('/me/preferences', { method: 'PATCH', body: { lang } }).catch(() => undefined);
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Numbers in the active language (Bangla digits in Bangla). */
/** Short numbers for tight spots: 999 · 1.2K · 15K · 1.5M (Bangla digits in Bangla). */
export function compact(n: number, lang: Lang = useSettings.getState().lang) {
  const a = Math.abs(n);
  const fmt = (v: number, unit: string) => `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${unit}`;
  const s = a < 1000 ? String(n) : a < 1e6 ? fmt(n / 1e3, 'K') : a < 1e9 ? fmt(n / 1e6, 'M') : fmt(n / 1e9, 'B');
  return num(s, lang);
}

export function num(n: number | string, lang: Lang = useSettings.getState().lang) {
  const s = typeof n === 'number' ? n.toLocaleString('en-US') : n;
  return lang === 'bn' ? s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : s;
}
