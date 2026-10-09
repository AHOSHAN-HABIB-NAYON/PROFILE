import { SocialLogin } from '@capgo/capacitor-social-login';
import { isNative } from './platform';

/**
 * Google sign-in. Web uses Google Identity Services (ID token via the One Tap / button
 * callback). Android uses Credential Manager through @capgo/capacitor-social-login.
 * Both produce a Google ID token that the server verifies.
 */
let gisLoaded: Promise<void> | null = null;
function loadGis() {
  gisLoaded ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  return gisLoaded;
}

let nativeInit = false;
export async function googleIdToken(clientId: string): Promise<string> {
  if (isNative) {
    if (!nativeInit) {
      await SocialLogin.initialize({ google: { webClientId: clientId } });
      nativeInit = true;
    }
    const res: any = await SocialLogin.login({ provider: 'google', options: {} });
    const token = res?.result?.idToken;
    if (!token) throw new Error('Google sign-in was cancelled');
    return token;
  }
  await loadGis();
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    g.accounts.id.initialize({
      client_id: clientId,
      callback: (r: { credential?: string }) => (r.credential ? resolve(r.credential) : reject(new Error('Google sign-in failed'))),
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
    });
    g.accounts.id.prompt((n: any) => {
      if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) {
        // Fallback: render the official button in a temporary popup container.
        const host = document.getElementById('gsi-fallback');
        if (host) {
          host.innerHTML = '';
          g.accounts.id.renderButton(host, { theme: 'outline', size: 'large', width: 300, text: 'continue_with' });
        } else reject(new Error('Google sign-in is not available in this browser'));
      }
    });
  });
}
