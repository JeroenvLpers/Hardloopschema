// Zorgt dat de app offline werkt.
// Werkwijze: altijd meteen de bewaarde versie tonen (snel, ook zonder bereik)
// en op de achtergrond de nieuwste versie ophalen voor de volgende keer.
const CACHE = 'hardloopschema';
const BESTANDEN = ['./', 'index.html', 'style.css', 'app.js', 'schema.json', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const bewaard = await cache.match(e.request, { ignoreSearch: true });
    const nieuw = fetch(e.request)
      .then((antwoord) => {
        if (antwoord.ok) cache.put(e.request, antwoord.clone());
        return antwoord;
      })
      .catch(() => bewaard);
    if (bewaard) {
      e.waitUntil(nieuw);
      return bewaard;
    }
    return nieuw;
  }));
});
