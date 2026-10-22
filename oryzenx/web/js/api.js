// Fetch wrapper. GET responses are cached in memory for a few seconds so switching pages is instant.
const cache = new Map();
const CACHE_MS = 15000;

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// A random id per install, used by the server to notice logins from a new device.
export function deviceId() {
  try {
    let id = localStorage.getItem('ox-device');
    if (!id) { id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`); localStorage.setItem('ox-device', id); }
    return id;
  } catch { return ''; }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Device-Id': deviceId(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('ox:logged-out'));
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  async get(path, { fresh = false } = {}) {
    const hit = cache.get(path);
    if (!fresh && hit && Date.now() - hit.t < CACHE_MS) return hit.data;
    const data = await request('GET', path);
    cache.set(path, { t: Date.now(), data });
    return data;
  },
  // Any write clears the cache so the next read shows the change.
  async post(path, body = {}) { cache.clear(); return request('POST', path, body); },
  async put(path, body = {}) { cache.clear(); return request('PUT', path, body); },
  async del(path) { cache.clear(); return request('DELETE', path, {}); },
  clear() { cache.clear(); },
};
