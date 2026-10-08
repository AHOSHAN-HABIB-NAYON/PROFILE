/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// App shell (offline UI). Precached at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/v2admin/, /^\/api\//, /^\/socket\.io/, /^\/media\//, /^\/u\/[^/]+\/?$/i] }));

// Only PUBLIC, non-personal API responses are cached (config + category list).
registerRoute(({ url }) => url.pathname === '/api/v1/config' || url.pathname === '/api/v1/categories', new StaleWhileRevalidate({ cacheName: 'qw-public-api' }));
registerRoute(({ url }) => url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com', new CacheFirst({ cacheName: 'qw-fonts' }));
registerRoute(({ url, request }) => request.destination === 'image' && url.pathname.startsWith('/media/'), new CacheFirst({ cacheName: 'qw-media' }));

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'QUIZ WAR', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).focus();
          (c as WindowClient).postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
