'use client';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { post } from '@/lib/api';

export async function passkeyCapabilities() {
  const supported = browserSupportsWebAuthn();
  const platform = supported ? await platformAuthenticatorIsAvailable().catch(() => false) : false;
  return { supported, platform };
}

/** Authenticates with a passkey. `optionsPath` returns { options, challengeId }. */
export async function passkeyAssertion(optionsPath: string, body: Record<string, unknown> = {}) {
  const { options, challengeId } = await post<{
    options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
    challengeId: string;
  }>(optionsPath, body);
  const response = await startAuthentication({ optionsJSON: options });
  return { challengeId, response };
}

export async function registerPasskey(name: string, base = '/auth/passkey/register') {
  const { options, challengeId } = await post<{
    options: Parameters<typeof startRegistration>[0]['optionsJSON'];
    challengeId: string;
  }>(`${base}/options`);
  const response = await startRegistration({ optionsJSON: options });
  return post<{ id: string }>(base, { challengeId, response, name });
}

export function defaultPasskeyName() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'Device';
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';
  return `${os} · ${br}`;
}
