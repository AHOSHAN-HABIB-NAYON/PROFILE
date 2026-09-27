/**
 * Anonymous device id for fraud protection & returning-customer autofill.
 * A random id kept in localStorage + a coarse, non-invasive fingerprint so
 * clearing storage does not trivially reset it. The server HMACs the value.
 */
let cached: string | null = null;

function hash(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function traits(): string {
  const n = navigator as Navigator & { deviceMemory?: number };
  return [n.userAgent, n.language, (n.languages ?? []).join(','), screen.width + 'x' + screen.height, screen.colorDepth, n.hardwareConcurrency, n.deviceMemory ?? '', Intl.DateTimeFormat().resolvedOptions().timeZone, n.maxTouchPoints].join('|');
}

export function deviceId(): string {
  if (cached) return cached;
  let id = '';
  try {
    id = localStorage.getItem('sg_did') ?? '';
    if (!id) {
      id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('sg_did', id);
    }
  } catch { /* private mode */ }
  cached = `${id}:${hash(traits())}`;
  return cached;
}

export function sessionId(): string {
  try {
    let s = sessionStorage.getItem('sg_sid');
    if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('sg_sid', s); }
    return s;
  } catch {
    return 'nosession';
  }
}
