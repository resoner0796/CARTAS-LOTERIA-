# 🎰 Lotería Online — Frontend

Juego de **Lotería mexicana multijugador en tiempo real**: salas privadas, cartas
cantadas por voz, apuestas con monedas virtuales, tienda de skins y efectos, y recarga
con tarjeta vía Stripe.

Parte del ecosistema **Juegos en la Nube** (`juegosenlanube.com`).

🔗 **Producción:** [loteria.juegosenlanube.com](https://loteria.juegosenlanube.com) ·
[loteria-online-red.vercel.app](https://loteria-online-red.vercel.app)

---

## 🧩 Arquitectura

Este repo es **solo el frontend**: HTML, CSS, JS y assets estáticos. No tiene servidor
ni build step. Vercel lo publica tal cual.

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

### Los dos repos

| Repo | Rol | Deploy |
|---|---|---|
| [`CARTAS-LOTERIA-`](https://github.com/resoner0796/CARTAS-LOTERIA-) | Frontend (este) | Vercel, automático en push a `main` |
| [`loteria-backend`](https://github.com/resoner0796/loteria-backend) | `server.js` + `package.json` | Render, automático en push a `main` |

El backend también sirve a **Serpientes y Escaleras**, **Pirinola** y la API del Hub.
Es un solo proceso para todo el ecosistema.

---

## 📁 Estructura

```
index.html          Todas las pantallas (login, menú, sala, selección, juego, admin)
css/style.css       Estilos
js/app.js           Toda la lógica de cliente
js/respaldojs.js    Copia legible de app.js (ver nota de ofuscación)
service-worker.js   Cacheo offline — actualmente NO se registra
manifest.json       PWA
assets/imagenes/    Cartas, barajas, fondos, fichas, UI
assets/audios/      Voz de cada una de las 54 cartas + efectos
```

### Ofuscación

El repo guarda **siempre** `js/app.js` legible. La ofuscación la hace Vercel en cada
despliegue (`npm run build` → `scripts/obfuscate.js`), reescribiendo el archivo dentro
de su contenedor de build. Nunca se commitea código ofuscado.

```bash
npm run build:dry   # simulacro local: valida sin escribir nada
```

Ten presente que la ofuscación de JS de cliente **no es una medida de seguridad**:
cualquiera la revierte con un deobfuscator. Sirve para poner fricción, nada más. La
seguridad real vive en el servidor.

---

## 🚀 Correr local

No hay dependencias ni build. Cualquier servidor estático sirve:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

> ⚠️ La URL del backend está hardcodeada al inicio de `js/app.js` y apunta a
> **producción**. Lo que hagas en local afecta monedas y usuarios reales.

---

## 🎮 Modos de juego

| Modo | Costo por carta | Cartas del jugador | Baraja cantada |
|---|---|---|---|
| 🏆 Tradicional | $1 | 54 | 54 |
| ⚫ Carta Llena | $2 | 54 | 54 |
| 🎯 Pozo y Esquinas | $2 | 20 (baraja especial) | 54 |

Cada jugador elige hasta **4 cartas**, y ninguna puede repetirse dentro de la sala.
El bote se reparte entre los ganadores validados por el host.

---

## ✨ Funcionalidades

- **Salas** con link de invitación compartible (`?sala=Nombre`), soporte de Web Share
  API y `postMessage` cuando corre embebido en el Hub.
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

> **Este proyecto mueve dinero real (Stripe live) y hoy no tiene autenticación.**

El backend confía en el email que se le mande en el cuerpo de la petición. No hay
sesiones ni tokens firmados. Consecuencias conocidas:

1. **Vaciado de cuentas** — `/api/buscar-destinatario` devuelve el email de cualquier
   nickname, y `/api/transferir-saldo` no valida que quien pide sea el dueño de la
   cuenta de origen.
2. **Monedas infinitas** — los endpoints `/api/admin/*` se autorizan con un header de
   texto plano comparado contra un email que está hardcodeado en este `app.js` público.
3. **SSO falsificable** — el token del Hub es JSON en base64 sin firma.

**Plan:** migrar a JWT (login emite token firmado, el backend lo lee del header
`Authorization` y deja de confiar en el body). Toca los dos repos.

---

## 🗺️ Roadmap

- [x] Documentar arquitectura (`CLAUDE.md`, `README.md`, `.gitignore`)
- [ ] **Autenticación JWT** y cierre de los tres huecos de arriba
- [ ] Rate limiting y validación de entrada en el backend
- [ ] Bugs: carta 54 faltante, ruta de cartas al reconectar en modo Pozo
- [ ] Registrar el service worker y arreglar `manifest.json` (PWA real)
- [ ] Optimizar assets a WebP (~100 MB actuales)
- [ ] Decidir el futuro de la ofuscación / meter un build step de verdad
- [ ] Evaluar migración de Render a VPS propio

---

## 🛠️ Notas de infraestructura

- **Render (plan free)** duerme tras 15 min de inactividad; se mantiene despierto con
  **UptimeRobot** haciendo ping periódico.
- El **estado de las salas vive en memoria**: un redeploy o reinicio de Render tumba
  las partidas en curso. Migrarlo a Redis permitiría reinicios sin pérdida y más de
  una instancia.
- Variables de entorno en Render: `nicknames` (service account de Firebase en JSON),
  `STRIPE_SECRET_KEY`, `PORT`.
