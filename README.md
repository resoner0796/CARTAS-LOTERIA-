# 🎰 Lotería Online — Frontend

Juego de **Lotería mexicana multijugador en tiempo real**: salas privadas, cartas
cantadas por voz, apuestas con monedas virtuales, tienda de skins y efectos, y recarga
con tarjeta vía Stripe.

Parte del ecosistema **Juegos en la Nube** (`juegosenlanube.com`).

🔗 **Producción:** [loteria.juegosenlanube.com](https://loteria.juegosenlanube.com)

---

## 🧩 Arquitectura

Este repo es **solo el frontend**: HTML, CSS, JS y assets estáticos. No tiene servidor.
Vercel lo publica tras ofuscar el JS en el build.

```
                    NAVEGADOR DEL JUGADOR
                             │
              ┌──────────────┴──────────────┐
              │                             │
          VERCEL                        RENDER
     (archivos estáticos)          (servidor Node vivo)
       ── este repo ──            ── repo loteria-backend ──
                                  ├── REST /api/*
                                  └── Socket.IO
                                          │
                              ┌───────────┴───────────┐
                          FIRESTORE          STRIPE  ·  FCM
                     (usuarios, monedas,   (pagos MXN)  (push)
                      inventario, historial)
```

**Sin el backend en Render no hay juego.** Ahí vive quién está en cada sala, quién es
host, quién apostó, el canto de cartas y la validación de ganadores.

### Los cinco repos

| Repo | Rol |
|---|---|
| [`juegosenalnube`](https://github.com/resoner0796/juegosenalnube) | Hub: login, monedero, catálogo |
| [`loteria-backend`](https://github.com/resoner0796/loteria-backend) | Backend común de todos los juegos |
| **`CARTAS-LOTERIA-`** | **Este.** Lotería mexicana |
| [`Serpientesyescaleras`](https://github.com/resoner0796/Serpientesyescaleras) | Serpientes y Escaleras |
| [`Pirinola-Online`](https://github.com/resoner0796/Pirinola-Online) | Pirinola |

El backend también sirve a **Serpientes y Escaleras**, **Pirinola** y la API del Hub.
Es un solo proceso para todo el ecosistema.

---

## 📁 Estructura

```
index.html          Todas las pantallas (login, menú, sala, selección, juego, admin)
css/style.css       Estilos
js/app.js           Punto de entrada y grueso de la lógica (en claro)
js/modulos/         Piezas ya separadas: config, utiles, ui, sesion, monedero,
                    tienda, admin, socket, efectos, animaciones, estado,
                    sala, favoritos, tablero, validacion, audio
scripts/            Empaquetado + ofuscación, corre en el build de Vercel
vercel.json         Configuración de build
service-worker.js   Cacheo offline
manifest.json       PWA
assets/imagenes/    Cartas, barajas, fondos, fichas, UI
assets/audios/      Voz de cada una de las 54 cartas + efectos
```

### Build: empaquetado y ofuscación

El repo guarda **siempre** la fuente legible. Nunca se commitea código ofuscado.
Vercel hace dos cosas en cada despliegue (`npm run build` → `scripts/obfuscate.js`):

```
js/app.js + js/modulos/*.js  ──esbuild──▶  un solo IIFE  ──ofuscador──▶  js/app.js
```

Primero empaqueta, porque el ofuscador trabaja sobre un archivo suelto y no sabe
seguir un `import`. Después borra `js/modulos/` de la copia efímera: el bundle ya
lleva todo dentro, y si la carpeta se quedara se publicarían las fuentes legibles
junto al archivo ofuscado.

```bash
npm run build:dry   # simulacro local: valida sin escribir ni borrar nada
```

Ten presente que la ofuscación de JS de cliente **no es una medida de seguridad**:
cualquiera la revierte con un deobfuscator. Sirve para poner fricción, nada más. La
seguridad real vive en el servidor.

---

## 🚀 Correr local

No hace falta build: `index.html` carga `app.js` como módulo ES y el navegador
resuelve los `import` solo. Cualquier servidor estático sirve la carpeta tal cual:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(Abrir el `index.html` con doble clic **no** funciona: los módulos ES necesitan
`http://`, con `file://` el navegador los bloquea.)

> ⚠️ La URL del backend vive en `js/modulos/config.js` y apunta a **producción**.
> Lo que hagas en local afecta monedas y usuarios reales.

---

## 🎮 Modos de juego

| Modo | Costo por tabla | Tablas para elegir | Baraja cantada |
|---|---|---|---|
| 🏆 Tradicional | $1 | 53 | 54 |
| ⚫ Carta Llena | $2 | 53 | 54 |
| 🎯 Pozo y Esquinas | $2 | 20 (set especial) | 54 |

Ojo con la terminología: la **tabla** es lo que elige el jugador (hay 53) y la
**carta** es lo que se canta (la baraja es de 54). Son conjuntos distintos.

Cada jugador elige hasta **4 tablas**, y ninguna puede repetirse dentro de la sala.
El bote se reparte entre los ganadores validados por el host.

---

## ✨ Funcionalidades

- **Salas** con link de invitación compartible (`?sala=Nombre`), soporte de Web Share
  API y `postMessage` cuando corre embebido en el Hub.
- **Pozo acumulado** 🎰 — bote aparte que crece $1 por partida y por jugador que se
  apunte, y que solo se lleva quien llene las 4 barajas del centro. Persiste entre
  partidas en Firestore, atado a la sala y a quien la creó. Al salir antes de que
  arranque la ronda se devuelve lo aportado en ella; lo acumulado se queda.
- **Orden de tablas** — al elegir aparece el lugar que ocupará (1 a 4), y ese es el
  orden en que se acomodan en la mesa.
- **Prueba de victoria** — el anfitrión marca cuál tabla se llenó y la sala la ve con
  las fichas puestas, para poder contrastarla con el historial. Importa sobre todo
  cuando el anfitrión se valida a sí mismo.
- **Silenciar jugadores** 🔇 — el anfitrión puede cortarle los efectos de sonido a
  quien esté abusando del tablero de sonidos.
- **Reconexión anti-F5**: recupera cartas, apuesta y rol de host.
- **Validación de ganador por el host**, con pausa de 4 s para recoger empates y
  revisión visual de la tabla del reclamante.
- **Rachas** 🔥 acumuladas por victorias consecutivas.
- **Tienda**: skins de ficha y efectos de sonido, sincronizados con la nube.
- **Soundboard** en partida con botón flotante arrastrable.
- **Transferencias** de monedas entre jugadores por nickname.
- **Historial** de movimientos en horario CDMX.
- **Panel admin** para recargas manuales y listado de usuarios.
- **SSO** desde el Hub por token en la URL.

---

## 🔐 Estado de seguridad

Este proyecto mueve dinero real (Stripe live). La auditoría se cerró: **23 de 24
hallazgos resueltos y verificados atacando producción**, no leyendo el diff.

Lo que hay hoy:

- **JWT obligatorio** (`AUTH_ESTRICTA` activo). El login emite un token firmado; el
  backend saca la identidad de ahí y **ya no confía en el email del cuerpo de la
  petición**. El socket lo manda en su handshake.
- **Autorización de admin** resuelta en el servidor, en cada endpoint. El flag que
  llega al cliente solo decide si se pinta el botón.
- **SSO firmado**: el Hub reparte el JWT en `?tk=`. El viejo `?sso=` (JSON en base64
  sin firma, falsificable) ya no se genera. **No lo reintroduzcas.**
- **Pagos idempotentes** con webhook de firma verificada.
- **Rate limiting**, CORS restringido y validación de entrada.
- **XSS**: todo lo que escribe una persona se escapa antes de pintarse.
- **El perfil que sale al cliente pasa por lista blanca**, así que ni el hash de la
  contraseña ni el `fcmToken` salen del servidor.

El detalle explotable vive en `AUDITORIA-SEGURIDAD.md`, que está en `.gitignore` a
propósito.

> La ofuscación del JS **no cuenta como seguridad**: cualquiera la revierte. La
> seguridad vive en el backend.

---

## 🗺️ Roadmap

- [x] Documentar arquitectura (`CLAUDE.md`, `README.md`, `.gitignore`)
- [x] Fase 0 de contención: idempotencia de pagos, caída remota, admin fuera del cliente
- [x] **Autenticación JWT** y cierre de los huecos de la auditoría
- [x] Rate limiting y validación de entrada en el backend
- [x] Bug: ruta de tablas al reconectar en modo Pozo
- [x] XSS del nickname escapado en los 5 puntos de inyección
- [x] Dejar de mandar el hash de la contraseña al navegador
- [x] Registrar el service worker
- [ ] Arreglar `manifest.json` (íconos apuntan a rutas rotas)
- [ ] Optimizar assets a WebP (~100 MB actuales)
- [x] Ofuscación automática en el build de Vercel
- [x] Quitar los `onclick` del HTML (paso previo a modularizar)
- [x] Empaquetado con esbuild antes de ofuscar (habilita los módulos)
- [ ] Partir `app.js` en módulos ES — **en curso**: 16 módulos fuera; app.js pasó de 2.030 a 890 líneas
- [ ] Evaluar migración de Render a VPS propio

---

## 🛠️ Notas de infraestructura

- **Render (plan free)** duerme tras 15 min de inactividad; se mantiene despierto con
  **UptimeRobot** haciendo ping periódico.
- El **estado de las salas vive en memoria**: un redeploy o reinicio de Render tumba
  las partidas en curso. Migrarlo a Redis permitiría reinicios sin pérdida y más de
  una instancia.
- Variables de entorno en Render: `nicknames` (service account de Firebase en JSON),
  `STRIPE_SECRET_KEY`, `ADMIN_EMAIL`, `PORT`.
