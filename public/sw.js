// One-release kill switch for the old app-shell service worker.
// Keeps the installable manifest, but removes Workbox/runtime app caching so
// returning signed-in users always receive the latest JS/CSS after refresh.
function isOldAppShellCache(name) {
  return (
    name === 'js-chunks' ||
    name === 'js-chunks-v2' ||
    name === 'css-chunks-v2' ||
    /^html-shell-v\d+$/.test(name) ||
    /^js-chunks-v\d+$/.test(name) ||
    /^css-chunks-v\d+$/.test(name) ||
    /^workbox-/.test(name) ||
    /(^|-)precache-v\d+-/.test(name) ||
    /(^|-)runtime-/.test(name)
  );
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.allSettled(names.filter(isOldAppShellCache).map((name) => caches.delete(name)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(clients.map((client) => client.navigate(client.url)));
    } finally {
      await self.registration.unregister();
    }
  })());
});