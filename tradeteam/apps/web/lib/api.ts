/**
 * Browser API client. Same-origin requests with HttpOnly session cookies; the CSRF double-submit
 * token is read from the non-HttpOnly csrf cookie and sent as X-CSRF-Token on unsafe methods.
 * No secrets ever live in the frontend bundle.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;
async function csrfToken(): Promise<string> {
  const existing = readCookie('__Host-tt_csrf') ?? readCookie('tt_csrf');
  if (existing) return existing;
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((j: { csrfToken: string }) => j.csrfToken)
    .finally(() => (csrfPromise = null));
  return csrfPromise;
}

type Json = Record<string, unknown> | unknown[] | undefined;

export async function api<T = unknown>(
  path: string,
  opts: {
    method?: string;
    body?: Json;
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.onLine === false &&
    opts.method &&
    opts.method !== 'GET'
  ) {
    throw new ApiError(
      0,
      'offline',
      'You are offline. Financial operations are disabled until the connection returns.',
    );
  }
  const method = opts.method ?? 'GET';
  const qs = opts.query
    ? '?' +
      new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD' && !path.startsWith('/install'))
    headers['x-csrf-token'] = await csrfToken();
  const doFetch = () =>
    fetch(`/api${path}${qs === '?' ? '' : qs}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
    });
  let res = await doFetch();
  // CSRF cookie may have rotated (login/session rotation): refresh once and retry.
  if (res.status === 403 && method !== 'GET') {
    const peek = await res
      .clone()
      .json()
      .catch(() => null);
    if (peek?.error?.message?.includes('CSRF')) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      headers['x-csrf-token'] = await csrfToken();
      res = await doFetch();
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(
      res.status,
      e.code ?? 'error',
      e.message ?? `Request failed (${res.status})`,
      e.details,
    );
  }
  return data as T;
}

export const get = <T>(path: string, query?: Record<string, string | number | boolean | undefined | null>) =>
  api<T>(path, { query });
export const post = <T>(path: string, body?: Json) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T>(path: string, body?: Json) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const put = <T>(path: string, body?: Json) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_error' && Array.isArray(e.details) && e.details.length) {
      return (e.details as { message: string }[]).map((d) => d.message).join('. ');
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
