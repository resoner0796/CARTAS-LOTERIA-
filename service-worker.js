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
  './assets/imagenes/ui/fondo-seleccion.jpg',
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

/**
 * Guarda una respuesta en la caché, en segundo plano y sin poder tumbar nada.
 *
 * Los dos `cache.put` que había antes iban sueltos, sin `.catch()`: cuando la
 * Cache API rechazaba una respuesta, la promesa quedaba sin capturar y la
 * consola se llenaba de "Uncaught (in promise) NetworkError". No rompía la app
 * —la respuesta ya iba de camino al navegador— pero enterraba los errores de
 * verdad entre ruido.
 *
 * Se cachea solo lo completo (200) y del propio origen ('basic'): una respuesta
 * opaca de otro dominio no se puede leer ni validar.
 */
function guardarEnCache(peticion, respuesta) {
  if (!respuesta || respuesta.status !== 200 || respuesta.type !== 'basic') return;

  const copia = respuesta.clone();
  caches.open(CACHE_NAME)
    .then(cache => cache.put(peticion, copia))
    .catch(fallo => console.warn('[Service Worker] No se pudo cachear', peticion.url, fallo));
}

// 3. INTERCEPTOR DE RED (FETCH): La magia del Offline
self.addEventListener('fetch', event => {
  // A. EXCEPCIONES: No cachear llamadas al Backend (API, Socket, Login)
  // Si la URL tiene "socket.io" o "/api/", déjala pasar directo a internet.
  if (event.request.url.includes('socket.io') ||
      event.request.url.includes('/api/') ||
      event.request.method !== 'GET') {
      return; // Salimos y dejamos que el navegador haga su petición normal
  }

  // Peticiones que la Cache API RECHAZA de plano. Si no se filtran aquí,
  // cache.put() revienta con "Cache.put() encountered a network error":
  //
  //  - Range: el <audio> pide trozos y el servidor responde 206 Partial
  //    Content. La caché solo admite respuestas completas. Esto era lo que
  //    ensuciaba la consola: los mp3 del juego se piden así.
  //  - Esquemas que no son http/https (chrome-extension:, data:...), que
  //    aparecen cuando alguien trae extensiones instaladas.
  if (event.request.headers.has('range')) return;
  const esquema = new URL(event.request.url).protocol;
  if (esquema !== 'http:' && esquema !== 'https:') return;

  // B. DOS ESTRATEGIAS SEGÚN EL TIPO DE ARCHIVO
  //
  // El código (HTML y JS) va "primero la red": si hay internet se sirve siempre
  // lo último y la caché queda solo como respaldo para modo avión. Con la
  // estrategia anterior, que era "primero la caché" para todo, el navegador se
  // quedaba con el app.js de la primera visita y NUNCA veía un despliegue nuevo
  // hasta que se cambiara el nombre de la caché a mano. En una app que maneja
  // dinero, eso significa usuarios corriendo código viejo indefinidamente.
  //
  // Las imágenes y audios sí van "primero la caché": no cambian casi nunca y
  // pesan lo que más, así que ahí está la ganancia real de velocidad.
  const url = new URL(event.request.url);
  const esCodigo = event.request.mode === 'navigate' ||
                   /\.(html|js|json)$/.test(url.pathname) ||
                   url.pathname === '/' ||
                   url.pathname.endsWith('/');

  if (esCodigo) {
    event.respondWith(
      fetch(event.request)
        .then(respuesta => {
          guardarEnCache(event.request, respuesta);
          return respuesta;
        })
        .catch(() => caches.match(event.request))   // sin internet: lo guardado
    );
    return;
  }

  // Imágenes, audios y demás: primero la caché.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;

        return fetch(event.request).then(
          networkResponse => {
            guardarEnCache(event.request, networkResponse);

            return networkResponse;
          }
        );
      })
  );
});