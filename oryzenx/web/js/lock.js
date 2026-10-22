// App Lock: optional 6-digit PIN plus fingerprint / face unlock.
// - Android app: the phone's biometric prompt (Capacitor plugin).
// - Browser: the device's built-in authenticator (WebAuthn: fingerprint, face or screen lock).
// Locks on start, after the app was in the background, and after being idle. Settings are kept on
// this device only; the PIN is stored as a salted PBKDF2 hash, never in plain text.
import { html, mount, icon, $ } from './ui.js';
import { isNative, nativeBiometryAvailable, nativeBiometricUnlock, secureFor } from './native.js';

const KEY = (uid) => `ox-lock-${uid}`;
let uid = null;
let locked = false;
let hiddenAt = 0;
let idleTimer = null;
let onLogout = () => {};

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function getLock() {
  try { return JSON.parse(localStorage.getItem(KEY(uid)) || 'null'); } catch { return null; }
}
function saveLock(v) {
  try { if (v) localStorage.setItem(KEY(uid), JSON.stringify(v)); else localStorage.removeItem(KEY(uid)); } catch { /* ignore */ }
}

async function hashPin(pin, salt, iter = 150000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64(bits);
}

export async function setPin(pin, { timeout = 60 } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prev = getLock() || {};
  saveLock({ ...prev, salt: b64(salt), hash: await hashPin(pin, salt), iter: 150000, timeout, fails: 0 });
}
export function updateLock(patch) { const l = getLock(); if (l) saveLock({ ...l, ...patch }); }
export function removeLock() { saveLock(null); }

async function checkPin(pin) {
  const l = getLock();
  return l && (await hashPin(pin, unb64(l.salt), l.iter)) === l.hash;
}

// ---------- Biometrics ----------
export async function biometryAvailable() {
  if (isNative()) return nativeBiometryAvailable();
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}

// Browser only: register this device's authenticator once.
export async function enrollBiometric(user) {
  if (isNative()) return nativeBiometricUnlock('Confirm to turn on fingerprint unlock');
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'OryzenX BD', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: user.email, displayName: user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  });
  updateLock({ webauthn: b64(cred.rawId) });
  return true;
}

async function biometricUnlock() {
  const l = getLock();
  if (!l?.bio) return false;
  if (isNative()) return nativeBiometricUnlock();
  if (!l.webauthn) return false;
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required', timeout: 60000,
        allowCredentials: [{ type: 'public-key', id: unb64(l.webauthn) }],
      },
    });
    return true;
  } catch { return false; }
}

// ---------- Lock screen ----------
export function lockNow() {
  const l = getLock();
  if (!l || locked) return;
  locked = true;
  secureFor('lock', true);
  const ov = document.createElement('div');
  ov.className = 'lock-screen';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', 'App locked');
  mount(ov, html`<div class="lock-inner">
    <img src="/icons/logo.svg" width="64" height="64" alt="">
    <h2>Enter your PIN</h2><p class="faint" id="lk-msg">OryzenX BD is locked</p>
    <div class="pin-dots" id="dots">${[0, 1, 2, 3, 4, 5].map(() => html`<i></i>`)}</div>
    <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => html`<button data-k="${k}">${k}</button>`)}
      <button data-k="bio" class="${l.bio ? '' : 'invisible'}" aria-label="Use fingerprint">${icon('shield')}</button><button data-k="0">0</button><button data-k="del" aria-label="Delete">${icon('back')}</button></div>
    <button class="lk-forgot" id="lk-out">Forgot PIN? Log out</button></div>`);
  document.body.append(ov);
  let pin = '';
  const dots = [...ov.querySelectorAll('#dots i')];
  const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const unlock = () => {
    locked = false; updateLock({ fails: 0 });
    ov.classList.add('out'); setTimeout(() => ov.remove(), 250);
    secureFor('lock', false);
    window.dispatchEvent(new Event('ox:unlocked'));
    resetIdle();
  };
  const tryBio = async () => { if (await biometricUnlock()) unlock(); };
  const press = async (k) => {
    if (k === 'bio') { tryBio(); return; }
    if (k === 'del') { pin = pin.slice(0, -1); draw(); return; }
    if (pin.length >= 6) return;
    pin += k; draw();
    if (pin.length === 6) {
      if (await checkPin(pin)) { unlock(); return; }
      const fails = (getLock()?.fails || 0) + 1;
      updateLock({ fails });
      $('#dots', ov).classList.add('shake'); setTimeout(() => $('#dots', ov)?.classList.remove('shake'), 450);
      pin = ''; setTimeout(draw, 300);
      $('#lk-msg', ov).textContent = fails >= 5 ? 'Too many wrong PINs' : `Wrong PIN · ${5 - fails} tries left`;
      if (fails >= 5) { removeLock(); ov.remove(); locked = false; secureFor('lock', false); onLogout(); }
    }
  };
  ov.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  ov.addEventListener('keydown', (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); });
  $('#lk-out', ov).onclick = () => { removeLock(); ov.remove(); locked = false; secureFor('lock', false); onLogout(); };
  ov.tabIndex = -1; ov.focus();
  if (l.bio) setTimeout(tryBio, 350);
}

function resetIdle() {
  clearTimeout(idleTimer);
  const l = getLock();
  if (!l || locked) return;
  idleTimer = setTimeout(lockNow, Math.max(30, l.timeout || 60) * 1000 + 4 * 60 * 1000); // idle: timeout + 4 min
}

export function initLock(user, { logout }) {
  uid = user.id;
  onLogout = logout;
  if (!getLock()) return;
  lockNow();
}

export const isLocked = () => locked;

document.addEventListener('visibilitychange', () => {
  const l = uid && getLock();
  if (!l) return;
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!locked && hiddenAt && (Date.now() - hiddenAt) / 1000 >= (l.timeout ?? 60)) lockNow();
});
['pointerdown', 'keydown', 'scroll'].forEach((ev) => document.addEventListener(ev, () => { if (uid) resetIdle(); }, { passive: true, capture: true }));
