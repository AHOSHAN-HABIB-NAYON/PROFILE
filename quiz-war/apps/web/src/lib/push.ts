import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';
import { navigateTo } from './nav';
import { isNative } from './platform';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Native build info: push only works when the APK was built with Firebase (google-services.json). */
const AppInfo = registerPlugin<{ get(): Promise<{ pushEnabled: boolean }> }>('QwAppInfo');
let nativePush: Promise<boolean> | null = null;
export function nativePushAvailable() {
  nativePush ??= Capacitor.isPluginAvailable('QwAppInfo')
    ? AppInfo.get().then((r) => !!r.pushEnabled).catch(() => false)
    : Promise.resolve(false);
  return nativePush;
}

export function pushSupported() {
  return isNative || ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

/** Current permission without prompting. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (isNative) {
    if (!(await nativePushAvailable())) return 'unsupported';
    const p = await PushNotifications.checkPermissions();
    return p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'prompt';
  }
  if (!pushSupported()) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : (Notification.permission as 'granted' | 'denied');
}

/** Ask for permission (only after a user gesture) and register this device for push. */
export async function enablePush(vapidPublicKey: string | null): Promise<'granted' | 'denied' | 'unsupported'> {
  if (isNative) {
    if (!(await nativePushAvailable())) return 'unsupported';
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return 'denied';
    await PushNotifications.register();
    return 'granted';
  }
  if (!pushSupported() || !vapidPublicKey) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
  await api('/push/register', { body: { platform: 'web', token: JSON.stringify(sub) } });
  return 'granted';
}

export async function initNativePush() {
  if (!isNative || !(await nativePushAvailable())) return;
  void PushNotifications.createChannel?.({ id: 'quizwar_default', name: 'Battles & updates', importance: 4, vibration: true }).catch(() => undefined);
  void PushNotifications.createChannel?.({ id: 'quizwar_messages', name: 'Messages', description: 'Chat messages from players', importance: 5, vibration: true, lights: true, lightColor: '#1D4ED8', visibility: 1 }).catch(() => undefined);
  void PushNotifications.addListener('registration', (t) => void api('/push/register', { body: { platform: 'android', token: t.value } }).catch(() => undefined));
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = (a.notification.data as any)?.url;
    if (typeof url === 'string' && url.startsWith('/')) navigateTo(url);
  });
  void PushNotifications.checkPermissions().then((p) => {
    if (p.receive === 'granted') void PushNotifications.register();
  });
}
