/* ── Service worker TrimSync ──
   Un seul rôle : afficher les notifications envoyées par le serveur
   (nouveau rendez-vous, annulation, liste d'attente) et ouvrir l'app au clic.
   Pas de gestionnaire fetch : rien n'est mis en cache, le site se charge
   toujours depuis le réseau. Toute modification : incrémenter SW_VERSION. */
const SW_VERSION = 'ts-1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'TrimSync', {
    body: d.body || '',
    icon: '/img/app/icon-192.png',
    badge: '/img/app/icon-192.png',
    data: { url: d.url || '/app' },
    tag: d.tag,
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/app', self.location.origin).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = fenetres.find(c => new URL(c.url).pathname.startsWith('/app'));
    if (app) { await app.focus(); return app.navigate ? app.navigate(url).catch(() => {}) : undefined; }
    return self.clients.openWindow(url);
  })());
});
