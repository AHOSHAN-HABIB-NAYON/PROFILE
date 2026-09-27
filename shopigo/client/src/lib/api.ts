/** Small fetch wrapper: JSON, CSRF double-submit header, typed errors. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]!) : null;
}

let csrfPromise: Promise<string> | null = null;
async function csrf(): Promise<string> {
  const existing = readCookie('sg_csrf');
  if (existing) return existing;
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'same-origin' }).then((r) => r.json()).then((d: { token: string }) => d.token).finally(() => { csrfPromise = null; });
  return csrfPromise;
}

export interface RequestOptions { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> }

export async function request<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
  if (method !== 'GET' && (url.startsWith('/api/admin') || url.startsWith('/api/auth'))) headers['x-csrf-token'] = await csrf();
  const res = await fetch(url, { method, headers, body, credentials: 'same-origin', signal: opts.signal });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) {
    if (res.status === 401 && url.startsWith('/api/admin') && !location.pathname.startsWith('/admin/login')) {
      location.assign(`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
    throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`, data?.code, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>(url, { signal }),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: body ?? {} }),
  put: <T>(url: string, body?: unknown) => request<T>(url, { method: 'PUT', body: body ?? {} }),
  patch: <T>(url: string, body?: unknown) => request<T>(url, { method: 'PATCH', body: body ?? {} }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
  upload: <T>(url: string, form: FormData) => request<T>(url, { method: 'POST', body: form }),
};

export function qs(params: Record<string, unknown>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
