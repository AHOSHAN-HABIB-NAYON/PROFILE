import { Network } from '@capacitor/network';
import { useEffect, useState } from 'react';
import { isNative } from '../lib/platform';

/** Device network state (browser events on the web, Capacitor Network plugin on Android). */
export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    if (isNative) {
      void Network.getStatus().then((s) => setOnline(s.connected));
      const h = Network.addListener('networkStatusChange', (s) => setOnline(s.connected));
      return () => void h.then((x) => x.remove());
    }
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  return online;
}
