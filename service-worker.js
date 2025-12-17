const CACHE_NAME = 'loteria-pro-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  // Imágenes de UI críticas (para que la app se vea bien offline)
  './assets/imagenes/ui/icon-192.png',
  './assets/imagenes/ui/splash.PNG',
  './assets/imagenes/ui/fondo-seleccion.PNG',
  './assets/imagenes/ui/ficha.PNG',
  './assets/imagenes/ui/peso.png',
  // Audios esenciales
  './assets/audios/campana.mp3',
  './assets/audios/corre.mp3'
];

// 1. INSTALACIÓN: Guardamos los archivos "Shell" (la estructura básica)
self.addEventListener('install', event => {
  console.log('[Service Worker] Instalando y cacheando assets...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Activar inmediatamente sin esperar
  );
});

// 2. ACTIVACIÓN: Limpiamos cachés viejos si subes una nueva versión (v2, v3...)
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activando y limpiando versiones viejas...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Borrando caché vieja:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Tomar control de la página inmediatamente
});

// 3. INTERCEPTOR DE RED (FETCH): La magia del Offline
self.addEventListener('fetch', event => {
  // A. EXCEPCIONES: No cachear llamadas al Backend (API, Socket, Login)
  // Si la URL tiene "socket.io" o "/api/", déjala pasar directo a internet.
  if (event.request.url.includes('socket.io') || 
      event.request.url.includes('/api/') || 
      event.request.method !== 'GET') {
      return; // Salimos y dejamos que el navegador haga su petición normal
  }

  // B. ESTRATEGIA: "Cache First" (Primero busca en casa, luego en internet)
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si el archivo ya está guardado, lo entregamos RÁPIDO ⚡️
        if (response) {
          return response;
        }

        // Si no está, vamos a Internet a buscarlo
        return fetch(event.request).then(
          networkResponse => {
            // Verificamos que la respuesta sea válida
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Si es válida (ej. una carta nueva '25.jpg'), la guardamos para la próxima
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        );
      })
  );
});