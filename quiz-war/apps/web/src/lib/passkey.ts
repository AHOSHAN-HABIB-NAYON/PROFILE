import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api';

export const passkeysSupported = () => browserSupportsWebAuthn();

/** Explicit "Continue with Passkey" (discoverable credential — no username needed). */
export async function passkeyLogin(conditional = false, signal?: AbortSignal) {
  const { challengeId, options } = await api<any>('/auth/passkey/login/options', { method: 'POST', auth: false });
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: conditional });
  return api<any>('/auth/passkey/login/verify', { body: { challengeId, response }, auth: false });
}

/** Conditional UI: offer saved passkeys in the email field's autofill, when supported. */
export async function conditionalPasskeyAvailable() {
  try {
    const caps = await (PublicKeyCredential as any).getClientCapabilities?.();
    if (caps) return caps.conditionalGet === true;
    return (await PublicKeyCredential.isConditionalMediationAvailable?.()) ?? false;
  } catch {
    return false;
  }
}

export async function registerPasskey(name?: string) {
  const { challengeId, options } = await api<any>('/auth/passkey/register/options', { method: 'POST' });
  const response = await startRegistration({ optionsJSON: options });
  return api('/auth/passkey/register/verify', { body: { challengeId, response, name } });
}
