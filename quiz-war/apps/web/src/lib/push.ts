import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';
import { navigateTo } from './nav';
import { isNative } from './platform';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return isNative || ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

/** Ask for permission (only after a user gesture) and register this device for push. */
export async function enablePush(vapidPublicKey: string | null): Promise<'granted' | 'denied' | 'unsupported'> {
  if (isNative) {
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

export function initNativePush() {
  if (!isNative) return;
  void PushNotifications.createChannel?.({ id: 'quizwar_default', name: 'Battles & updates', importance: 4, vibration: true }).catch(() => undefined);
  void PushNotifications.addListener('registration', (t) => void api('/push/register', { body: { platform: 'android', token: t.value } }).catch(() => undefined));
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const url = (a.notification.data as any)?.url;
    if (typeof url === 'string' && url.startsWith('/')) navigateTo(url);
  });
  void PushNotifications.checkPermissions().then((p) => {
    if (p.receive === 'granted') void PushNotifications.register();
  });
}
