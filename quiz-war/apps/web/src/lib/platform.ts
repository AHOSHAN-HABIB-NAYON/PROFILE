import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { useSettings } from './settings';

export const isNative = Capacitor.isNativePlatform();
export const platform: 'android' | 'ios' | 'web' = Capacitor.getPlatform() as any;

let versionCode = 0;
export async function initPlatformInfo() {
  if (!isNative) return;
  try {
    const info = await App.getInfo();
    versionCode = Number(info.build) || 0;
  } catch {
    /* ignore */
  }
}
export const appVersionCode = () => versionCode;

export function haptic(kind: 'tap' | 'success' | 'error' | 'heavy' = 'tap') {
  if (!useSettings.getState().haptics) return;
  if (isNative) {
    if (kind === 'success') void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    else if (kind === 'error') void Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    else void Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light }).catch(() => undefined);
  } else if ('vibrate' in navigator) {
    navigator.vibrate(kind === 'error' ? [30, 40, 30] : kind === 'success' ? 20 : kind === 'heavy' ? 35 : 8);
  }
}

export async function share(data: { title: string; text: string; url: string }) {
  try {
    if (isNative) return void (await Share.share({ ...data, dialogTitle: data.title }));
    if (navigator.share) return void (await navigator.share(data));
    await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
    return 'copied' as const;
  } catch {
    /* user cancelled */
  }
}

/** Public web URL used for share links & QR codes (works for people without the app). */
export const PUBLIC_WEB_URL: string = (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) ?? window.location.origin;
