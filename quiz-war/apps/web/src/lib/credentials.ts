import { SavePassword } from '@capgo/capacitor-autofill-save-password';
import { isNative } from './platform';

/**
 * Password-manager integration. Android: Credential Manager (Google Password Manager
 * "Save password?" sheet and the saved-accounts picker). Web: the Credential Management API
 * where available; otherwise the browser's own autofill handles it via autocomplete attributes.
 */
export async function offerToSavePassword(email: string, password: string) {
  try {
    if (isNative) return void (await SavePassword.promptDialog({ username: email, password }));
    const PC = (window as any).PasswordCredential;
    if (PC && navigator.credentials?.store) await navigator.credentials.store(new PC({ id: email, password, name: email }));
  } catch {
    /* user dismissed or not supported */
  }
}

/** Ask the password manager for a saved account (shows the system picker). */
export async function pickSavedPassword(): Promise<{ email: string; password: string } | null> {
  try {
    if (isNative) {
      const r = await SavePassword.readPassword();
      return r?.username && r.password ? { email: r.username, password: r.password } : null;
    }
    if (!(window as any).PasswordCredential || !navigator.credentials?.get) return null;
    const c: any = await navigator.credentials.get({ password: true, mediation: 'optional' } as any);
    return c?.id && c.password ? { email: c.id, password: c.password } : null;
  } catch {
    return null;
  }
}
