self.addEventListener("install", event => {
  console.log("SW instalado");
});

self.addEventListener("activate", event => {
  console.log("SW activado");
});

self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});