// Service Worker — Erlon Giovanini Consultoria Fitness
const CACHE_NAME = 'erlon-fitness-v1';
const STATIC_ASSETS = [
  '/aluna.html',
  '/manifest.json'
];

// Instalar: cachear assets estáticos
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativar: limpar caches antigos
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network first, fallback para cache
self.addEventListener('fetch', function(e) {
  // Não interceptar requests do Firebase
  if (e.request.url.indexOf('firestore') > -1 ||
      e.request.url.indexOf('firebase') > -1 ||
      e.request.url.indexOf('googleapis') > -1) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        // Cachear resposta válida
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // Offline: tentar cache
        return caches.match(e.request);
      })
  );
});
