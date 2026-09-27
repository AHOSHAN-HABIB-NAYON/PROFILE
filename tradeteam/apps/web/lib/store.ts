import { useSyncExternalStore } from 'react';

/**
 * Keyed external store: components subscribe to *one key* (e.g. a symbol), so a price tick for
 * BTCUSDT re-renders only the few components showing BTCUSDT — never the whole page.
 */
export function createKeyedStore<T>() {
  const values = new Map<string, T>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (k: string) => values.get(k),
    set(k: string, v: T) {
      values.set(k, v);
      listeners.get(k)?.forEach((l) => l());
    },
    update(k: string, fn: (prev: T | undefined) => T) {
      this.set(k, fn(values.get(k)));
    },
    subscribe(k: string, l: () => void) {
      let s = listeners.get(k);
      if (!s) listeners.set(k, (s = new Set()));
      s.add(l);
      return () => {
        s!.delete(l);
      };
    },
    use(k: string | null | undefined): T | undefined {
      return useSyncExternalStore(
        (l) => (k ? this.subscribe(k, l) : () => undefined),
        () => (k ? values.get(k) : undefined),
        () => undefined,
      );
    },
  };
}

export function createValueStore<T>(initial: T) {
  let value = initial;
  const ls = new Set<() => void>();
  return {
    get: () => value,
    set(v: T) {
      value = v;
      ls.forEach((l) => l());
    },
    subscribe(l: () => void) {
      ls.add(l);
      return () => {
        ls.delete(l);
      };
    },
    use(): T {
      return useSyncExternalStore(
        (l) => this.subscribe(l),
        () => value,
        () => initial,
      );
    },
  };
}
