import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isNative } from './platform';

/**
 * Refresh-token storage. On the web the refresh token lives in an httpOnly cookie that
 * JavaScript can never read. On Android it is kept in the Android Keystore-backed secure
 * storage (never in localStorage).
 */
const KEY = 'qw_refresh';

export const tokenStore = {
  async get(): Promise<string | null> {
    if (!isNative) return null;
    try {
      return ((await SecureStorage.get(KEY)) as string | null) ?? null;
    } catch {
      return null;
    }
  },
  async set(token: string | undefined) {
    if (!isNative || !token) return;
    await SecureStorage.set(KEY, token).catch(() => undefined);
  },
  async clear() {
    if (!isNative) return;
    await SecureStorage.remove(KEY).catch(() => undefined);
  },
};
