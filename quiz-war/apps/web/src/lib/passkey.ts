import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { api, ApiError } from './api';
import { tr } from './i18n';
import { isNative } from './platform';

/**
 * In the Android app the WebView runs on https://localhost, which can't use the website's
 * relying-party ID, so passkeys go through the native Credential Manager plugin instead.
 */
const NativePasskey = registerPlugin<{
  create(o: { requestJson: string }): Promise<{ responseJson: string }>;
  get(o: { requestJson: string }): Promise<{ responseJson: string }>;
}>('QwPasskey');
const useNative = () => isNative && Capacitor.isPluginAvailable('QwPasskey');

export const passkeysSupported = () => useNative() || (!isNative && browserSupportsWebAuthn());

/** Turns device/plugin failures into readable messages. A cancel keeps name NotAllowedError (UI ignores it). */
function deviceError(e: unknown): Error {
  if (e instanceof ApiError) return e;
  const code = (e as { code?: string })?.code;
  const name = (e as Error)?.name;
  if (code === 'cancelled' || name === 'NotAllowedError' || name === 'AbortError') {
    const c = new Error('cancelled');
    c.name = 'NotAllowedError';
    return c;
  }
  if (code === 'no_credential')
    return new ApiError(0, 'no_passkey', tr('No passkey found on this phone. Sign in another way, then add one in Settings → Passkeys.', 'এই ফোনে কোনো পাসকি নেই। অন্যভাবে লগইন করে সেটিংস → পাসকি থেকে একটি যোগ করুন।'));
  if (name === 'InvalidStateError')
    return new ApiError(0, 'passkey_exists', tr('This device already has a passkey for your account.', 'এই ডিভাইসে আপনার অ্যাকাউন্টের পাসকি আগেই আছে।'));
  return new ApiError(0, 'passkey_failed', tr('Passkey is not available on this device right now. Please sign in another way.', 'এই ডিভাইসে এখন পাসকি চালানো যাচ্ছে না। অন্যভাবে লগইন করুন।'));
}

/** Credential Manager JSON sometimes omits fields the server expects. */
function normalize(json: string) {
  const r = JSON.parse(json);
  r.type ??= 'public-key';
  r.rawId ??= r.id;
  r.clientExtensionResults ??= {};
  return r;
}

/** Explicit "Continue with Passkey" (discoverable credential — no username needed). */
export async function passkeyLogin(conditional = false, signal?: AbortSignal) {
  const { challengeId, options } = await api<any>('/auth/passkey/login/options', { method: 'POST', auth: false });
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  let response;
  try {
    response = useNative()
      ? normalize((await NativePasskey.get({ requestJson: JSON.stringify(options) })).responseJson)
      : await startAuthentication({ optionsJSON: options, useBrowserAutofill: conditional });
  } catch (e) {
    throw deviceError(e);
  }
  return api<any>('/auth/passkey/login/verify', { body: { challengeId, response }, auth: false });
}

/** Conditional UI: offer saved passkeys in the email field's autofill, when supported. */
export async function conditionalPasskeyAvailable() {
  if (isNative) return false;
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
  let response;
  try {
    response = useNative()
      ? normalize((await NativePasskey.create({ requestJson: JSON.stringify(options) })).responseJson)
      : await startRegistration({ optionsJSON: options });
  } catch (e) {
    throw deviceError(e);
  }
  return api('/auth/passkey/register/verify', { body: { challengeId, response, name } });
}
