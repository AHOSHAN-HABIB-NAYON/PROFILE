import { Capacitor, registerPlugin } from '@capacitor/core';

/** One id per phone (for "one free trial per phone"). The server only keeps a hash of it. */
export async function deviceId(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await registerPlugin<{ get(): Promise<{ deviceId?: string }> }>('QwAppInfo').get();
      if (info.deviceId) return `a:${info.deviceId}`;
    } catch {
      /* older app */
    }
  }
  try {
    let id = localStorage.getItem('qw-device');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, '');
      localStorage.setItem('qw-device', id);
    }
    return `w:${id}`;
  } catch {
    return '';
  }
}

/** Invite code from a shared link (…?ref=QW-XXXXXX), kept until the account is set up. */
export function rememberInviteFromUrl() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[A-Za-z0-9-]{6,12}$/.test(ref)) localStorage.setItem('qw-ref', ref.toUpperCase());
  } catch {
    /* ignore */
  }
}
export function savedInvite() {
  try {
    return localStorage.getItem('qw-ref') ?? '';
  } catch {
    return '';
  }
}
export function clearInvite() {
  try {
    localStorage.removeItem('qw-ref');
  } catch {
    /* ignore */
  }
}
