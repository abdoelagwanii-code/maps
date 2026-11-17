const APP = 'app-v1', TILES = 'tiles-v1';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'manifest.json', 'icon.svg', 'leaflet/leaflet.js', 'leaflet/leaflet.css',
  'leaflet/images/layers.png', 'leaflet/images/layers-2x.png', 'leaflet/images/marker-icon.png', 'leaflet/images/marker-shadow.png'];
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com'];
self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function trim(c) { const ks = await c.keys(); if (ks.length > 6000) for (const k of ks.slice(0, 600)) await c.delete(k); }
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (TILE_HOSTS.includes(u.hostname)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); if (r && (r.ok || r.type === 'opaque')) { c.put(e.request, r.clone()); trim(c); } return r; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
  } else if (u.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(h => h || fetch(e.request)));
  }
});
