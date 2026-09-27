/* Browser push: standard Web Push (VAPID) and, when configured by the admin, Firebase Cloud Messaging. */
import { api, state, toast, t } from './core.js';
const b64ToUint8 = (b) => { const p = '='.repeat((4 - (b.length % 4)) % 4); const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map((c) => c.charCodeAt(0))); };
export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

async function fcmToken(reg) {
  const fb = state.config?.firebase; if (!fb?.config) return null;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getMessaging, getToken } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
  const app = initializeApp(fb.config, 'lifetrack');
  return getToken(getMessaging(app), { vapidKey: fb.vapidKey || undefined, serviceWorkerRegistration: reg });
}

export async function enable() {
  if (!supported()) throw new Error(t('push.unsupported'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(t('push.denied'));
  const reg = await navigator.serviceWorker.ready;
  let done = false;
  if (state.config?.push) {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(state.config.push) });
    await api.post('/api/push/subscribe', { kind: 'webpush', subscription: sub.toJSON() });
    done = true;
  }
  if (state.config?.firebase) {
    try { const tok = await fcmToken(reg); if (tok) { await api.post('/api/push/subscribe', { kind: 'fcm', token: tok }); done = true; } } catch (e) { console.warn('FCM', e); }
  }
  if (!done) throw new Error(t('push.not_configured'));
  return true;
}
export async function disable() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}
/** Keep the server's copy of this browser's subscription fresh (endpoints rotate). */
export async function syncSubscription() {
  if (!supported() || Notification.permission !== 'granted' || !state.profile?.notify_push) return;
  try { await enable(); } catch { /* silent */ }
}
export async function test() { const d = await api.post('/api/push/test'); toast(d.delivered ? t('push.test_sent') : t('push.none_delivered'), { type: d.delivered ? 'success' : 'warn' }); }
