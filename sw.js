/**
 * Offline copy of the store app (the hosted version in dist/site/).
 *
 * A stockroom has no reliable connection, so the app must open without one.
 * This keeps the app's few files on the laptop and serves them from there
 * first - opening is instant, signal or not - while fetching a fresh copy in
 * the background for next time. A new version is taken in by itself: the page
 * opens it once the laptop has been left alone for a minute (app/main.js),
 * never in the middle of a delivery.
 *
 * Every fetch here asks the server, not the browser's own store: GitHub Pages
 * lets a browser keep a file 10 minutes, and v8 once saved that old page under
 * its new name - the laptop showed the old version until Ctrl+Shift+R, and
 * again after signing in (4 Nov 2026).
 *
 * It only ever handles the app's own files. Records sent to the Google Sheet
 * are not touched: they live in the app's outbox until the server confirms
 * them (app/sync.js).
 *
 * build-standalone.py writes the version below, so every build is a new cache.
 */

const VERSION = '624d9fa8d745';
const CACHE = `stockroom-${VERSION}`;
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // straight from the server (cache: 'reload'), never a copy the browser still holds
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // drop older versions' copies
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('stockroom-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // the page itself may be asked for as "./" or "./index.html"
      const cached = (await cache.match(request, { ignoreSearch: true })) ??
        (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
      // 'no-cache': the browser asks the server whether its copy is still current
      const fresh = fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return (await fresh) ?? new Response('Offline, and this file was never saved.', { status: 503 });
    }),
  );
});
