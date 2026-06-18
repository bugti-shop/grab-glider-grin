/**
 * Background sync worker for Flowist.
 *
 * Registered separately from any app-shell PWA worker. It listens for a
 * Background Sync `flowist-resync` event and pokes the app pages to drain
 * the offline write queue + refetch missed events. We do NOT cache app shell
 * here — this worker is sync-only, so it stays safe in Lovable preview/dev.
 */
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

async function poke() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of clients) {
    try { c.postMessage({ type: 'flowist:sync:resync' }); } catch {}
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'flowist-resync') event.waitUntil(poke());
});
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'flowist-resync') event.waitUntil(poke());
});

// Manual ping via postMessage
self.addEventListener('message', (event) => {
  if (event.data?.type === 'flowist:sync:ping') event.waitUntil(poke());
});
