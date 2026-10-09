import type { MeUser } from '@quizwar/shared';
import { appVersionCode, isNative, platform } from './platform';
import { tokenStore } from './token-store';

/** API origin: relative on the web (same origin / dev proxy), absolute in the Android app. */
export const API_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  network: 'No internet connection. Check your network and try again.',
  server_error: 'Something went wrong on our side. Please try again.',
  rate_limited: 'You are going a bit fast — please wait a moment.',
  unauthorized: 'Please sign in again.',
  forbidden: "You don't have permission to do that.",
  maintenance: 'QUIZ WAR is under maintenance. Please try again shortly.',
};
export const friendlyError = (e: unknown) =>
  e instanceof ApiError ? (e.message || FRIENDLY[e.code] || FRIENDLY.server_error) : FRIENDLY.server_error;

let accessToken: string | null = null;
let onAuthLost: () => void = () => undefined;
let onTokens: (t: { accessToken: string; user?: MeUser }) => void = () => undefined;
export function configureApi(o: { onAuthLost: () => void; onTokens: typeof onTokens }) {
  onAuthLost = o.onAuthLost;
  onTokens = o.onTokens;
}
export const getAccessToken = () => accessToken;
export function setAccessToken(t: string | null) {
  accessToken = t;
}

function baseHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'X-Client-Platform': isNative ? platform : 'web', 'X-Requested-With': 'QuizWar' };
  if (isNative) h['X-App-Version-Code'] = String(appVersionCode());
  return h;
}

async function raw(path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers: Record<string, string> = { ...baseHeaders(), ...(init.headers as Record<string, string>) };
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  try {
    return await fetch(`${API_URL}/api/v1${path}`, { ...init, body, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'network', FRIENDLY.network);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const err = (data as any)?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'server_error', err.message ?? FRIENDLY[err.code] ?? FRIENDLY.server_error, err.details);
  }
  return data as T;
}

/* Single-flight refresh: concurrent 401s share one refresh request. */
let refreshing: Promise<boolean> | null = null;
/** Why the last refresh failed: 'network' keeps the player signed in (retry later). */
export let lastRefreshFailure: 'network' | 'auth' | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const stored = await tokenStore.get();
        if (isNative && !stored) return false;
        const res = await raw('/auth/refresh', { method: 'POST', json: isNative ? { refreshToken: stored } : {} });
        if (res.status === 409) continue; // another tab rotated the cookie first — retry once
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            await tokenStore.clear();
            lastRefreshFailure = 'auth';
          } else lastRefreshFailure = 'network';
          return false;
        }
        lastRefreshFailure = null;
        const data = await res.json();
        accessToken = data.accessToken;
        await tokenStore.set(data.refreshToken);
        onTokens({ accessToken: data.accessToken, user: data.user });
        return true;
      }
      return false;
    } catch {
      lastRefreshFailure = 'network';
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean } = {}): Promise<T> {
  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (accessToken && opts.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
    return raw(path, { method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'), headers, ...(opts.form ? { body: opts.form } : opts.body !== undefined ? { json: opts.body } : {}) });
  };
  let res = await doFetch();
  if (res.status === 401 && opts.auth !== false && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    if (await refreshSession()) res = await doFetch();
    else if (lastRefreshFailure === 'network') throw new ApiError(0, 'network', FRIENDLY.network);
    else onAuthLost();
  }
  return parse<T>(res);
}

/** Store tokens returned by login/register/google/passkey. */
export async function acceptAuthResponse(data: { accessToken: string; refreshToken?: string; user: MeUser }) {
  accessToken = data.accessToken;
  await tokenStore.set(data.refreshToken);
  onTokens({ accessToken: data.accessToken, user: data.user });
}

export async function logoutRequest() {
  const stored = await tokenStore.get();
  await raw('/auth/logout', { method: 'POST', json: isNative ? { refreshToken: stored } : {} }).catch(() => undefined);
  await tokenStore.clear();
  accessToken = null;
}
