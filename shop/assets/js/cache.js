/* cache.js — small LRU page cache with TTL + in-flight request de-duplication. */
(function () {
  'use strict';
  const App = window.App;
  const store = new Map();
  const inflight = new Map();
  const MAX = 40;
  App.cache = {
    get(k) {
      const e = store.get(k);
      if (!e) return null;
      if (Date.now() > e.exp) { store.delete(k); return null; }
      store.delete(k); store.set(k, e); // refresh LRU order
      return e.v;
    },
    set(k, v, ttl) {
      store.set(k, { v, exp: Date.now() + (ttl || 120000) });
      while (store.size > MAX) store.delete(store.keys().next().value);
    },
    delete(k) { store.delete(k); },
    clear() { store.clear(); },
    /** Returns one shared promise per key while it is in flight. */
    once(k, fn) {
      if (inflight.has(k)) return inflight.get(k);
      const p = Promise.resolve().then(fn).finally(() => inflight.delete(k));
      inflight.set(k, p);
      return p;
    },
  };
})();
