const CACHE = 'mi-garage-v5';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('No se pudo precargar la aplicación');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
    await cache.addAll([...assets, '/icon.svg', '/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png']);
    await cache.put('/index.html', response.clone());
    await cache.put('/', response);
  })());
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mi-garage-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.headers.has('Authorization')) return;
  // Nunca almacenar respuestas de API ni páginas de administración.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;
  if (event.request.mode !== 'navigate' && !url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/icons/') && !['/icon.svg', '/manifest.webmanifest'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  // Los recursos públicos no varían por Origin; algunos hostings incluyen Vary: Origin.
  }).catch(async () => (await caches.match(event.request, { ignoreVary: true })) || (event.request.mode === 'navigate' ? await caches.match('/index.html', { ignoreVary: true }) : null) || Response.error()));
});
