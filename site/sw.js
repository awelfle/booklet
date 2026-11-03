// The old Booklet app at this address installed a service worker that keeps serving its cached copy.
// This replacement removes it: clear the caches, unregister, and reload open pages so they reach the
// redirect to https://github.com/awelfle/booklet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
