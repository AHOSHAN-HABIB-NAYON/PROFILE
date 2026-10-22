// Bridge to the Android app (Capacitor). Everything here is a no-op in a normal browser.
const Cap = () => window.Capacitor;
export const isNative = () => !!Cap()?.isNativePlatform?.();
// Only plugins built into this APK are available (older APKs may lack some).
const plugin = (name) => (isNative() && Cap().isPluginAvailable?.(name) ? Cap().Plugins?.[name] : null);

// ---------- Screenshot / screen-recording blocking (Android FLAG_SECURE) ----------
// Several reasons can ask for it at once (sensitive screen, lock screen, app in background).
let secure = null;
const reasons = new Set();
export async function secureFor(reason, on) {
  if (on) reasons.add(reason); else reasons.delete(reason);
  const p = plugin('PrivacyScreen');
  const want = reasons.size > 0;
  if (!p || secure === want) return;
  secure = want;
  try { await (want ? p.enable() : p.disable()); } catch { /* plugin missing in older APKs */ }
}

// ---------- Fingerprint / face unlock ----------
export async function nativeBiometryAvailable() {
  const p = plugin('BiometricAuthNative');
  if (!p) return false;
  try { const r = await p.checkBiometry(); return !!(r.isAvailable || r.deviceIsSecure); } catch { return false; }
}
export async function nativeBiometricUnlock(reason = 'Unlock OryzenX BD') {
  const p = plugin('BiometricAuthNative');
  if (!p) return false;
  try {
    await p.internalAuthenticate({ reason, androidTitle: 'Unlock OryzenX BD', androidSubtitle: reason, cancelTitle: 'Use PIN', allowDeviceCredential: false, androidConfirmationRequired: false });
    return true;
  } catch { return false; }
}

// ---------- Status bar colour follows the theme ----------
export function syncStatusBar() {
  const p = plugin('StatusBar');
  if (!p) return;
  const dark = document.documentElement.dataset.theme !== 'light';
  p.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
  p.setBackgroundColor({ color: dark ? '#0b0e11' : '#f4f6fa' }).catch(() => {});
}

// ---------- Android back button ----------
export function setupBackButton() {
  const p = plugin('App');
  if (!p) return;
  p.addListener('backButton', () => {
    const close = document.querySelector('.overlay [data-close]');
    if (close) { close.click(); return; }
    const route = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    if (!route || route === 'home' || route === 'login') p.minimizeApp();
    else history.back();
  });
}

// ---------- Push notifications (Firebase) ----------
let pushStarted = false;
export async function setupPush(onToken) {
  const p = plugin('PushNotifications');
  if (!p || pushStarted) return 'unavailable';
  pushStarted = true;
  try {
    let perm = await p.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await p.requestPermissions();
    if (perm.receive !== 'granted') return 'denied';
    await p.addListener('registration', (t) => onToken(t.value));
    await p.addListener('registrationError', () => {});
    await p.addListener('pushNotificationActionPerformed', (a) => {
      const route = a.notification?.data?.route;
      if (route) location.hash = `#/${route}`;
    });
    await p.register();
    return 'granted';
  } catch { return 'error'; }
}
