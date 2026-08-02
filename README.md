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
js/app.js           Punto de entrada: arranque, login y eventos de partida
js/modulos/         20 módulos (ver CLAUDE.md para el detalle de cada uno)
scripts/            Empaquetado + ofuscación, corre en el build de Vercel
vercel.json         Configuración de build
service-worker.js   Cacheo offline
manifest.json       PWA
assets/imagenes/    Barajas, fondos, fichas, UI (las cartas ya no son imágenes)
assets/audios/      Voz de cada una de las 54 barajas + efectos
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

## 🧪 Pruebas

```bash
npm test            # sobre la fuente
npm run test:build  # sobre el bundle ofuscado — el que se publica
```

Abren Chrome de verdad y prueban la app entera: que arranque, que cada botón
responda, que se conecte al servidor, que el texto de otros usuarios no ejecute
código, que entrar desde el Hub no enseñe un login por el camino, y que las
cartas que manda el servidor se pinten como rejilla con las barajas correctas.

No necesitan backend. Sí necesitan Chrome instalado (se usa el del sistema).

⚠️ Una prueba que nunca falla no prueba nada. Al añadir una, rómpela a propósito
y comprueba que salta.

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

| Modo | Costo por carta | Cartas para elegir | Cómo se gana |
|---|---|---|---|
| 🏆 Tradicional | $1 | 60 | cualquiera de las 20 figuras |
| ⚫ Carta Llena | $2 | 60 | las 16 casillas |
| 🎯 Pozo y Esquinas | $2 | 20 (de 8 casillas) | las 8 casillas |
| 👯 Doble | $2 | 60 | cualquier figura, y una baraja tapa dos |

Ojo con la terminología: la **carta** es la rejilla de 4×4 que elige el jugador y
la **baraja** es cada una de las 54 que se cantan. Son conjuntos distintos.

**Las figuras que dan lotería** son veinte: 4 líneas horizontales, 4 verticales,
2 diagonales, las 4 esquinas y los 9 cuadros de 2×2.

⚠️ **Hay que gritar CON la baraja que cierra.** La figura tiene que incluir la
última cantada: si se te pasó el momento, ya no vale, como en la mesa de verdad.
Sin esta regla se podía esperar a ver si caía algo mejor —el pozo, por ejemplo—
y gritar cuando conviniera con una figura cerrada hacía cinco barajas.

```
 0  1  2  3      ●  ●  ●  ●      ●  ·  ·  ●      ·  ·  ·  ·
 4  5  6  7      ·  ·  ·  ·      ·  ·  ·  ·      ·  ●  ●  ·
 8  9 10 11      ·  ·  ·  ·      ·  ·  ·  ·      ·  ●  ●  ·
12 13 14 15      ·  ·  ·  ·      ●  ·  ·  ●      ·  ·  ·  ·
  índices        horizontal       esquinas          cuadro
```

En **Doble**, una misma baraja ocupa las dos casillas del centro: cuando la
cantan tapas dos de golpe, así que el cuadro del centro y las líneas que pasan
por ahí caen antes. Las partidas son más rápidas.

Cada jugador elige hasta **4 cartas**, y ninguna puede repetirse dentro de la
sala. **El servidor decide quién ganó** — ver más abajo.

---

## 🤖 El servidor decide quién ganó

Este es el cambio más grande del proyecto, y solo se pudo hacer cuando **una
carta dejó de ser una imagen**. Antes cada carta era un JPG y nadie más que el
ojo humano sabía qué llevaba dentro; hoy es una lista de 16 números que genera y
guarda el servidor.

Con eso, al gritar lotería:

1. El cliente manda **qué casillas tapó** en cada carta.
2. El servidor cruza esas casillas con **sus** barajas y **su** historial de lo
   cantado, y busca alguna de las 20 figuras que incluya la última cantada.
3. Si no hay figura, se lo dice **solo a quien gritó** y **la partida sigue**.
   Distingue los dos casos: a quien la tenía y gritó tarde se le dice «se te
   pasó», no «te faltan tres».
4. Si la hay, se abre la pausa de empates y se reparte el bote.

Lo que se gana:

- **Se acabó el anfitrión validándose a sí mismo.** Era la parte más incómoda
  del juego: quien creaba la sala juzgaba sus propias loterías.
- **Un grito de broma ya no congela la sala.** Antes bastaba con picar el botón
  para parar la partida hasta que el anfitrión resolviera.
- **Nadie tiene que mirar.** Ni comparar barajas a ojo, ni fiarse.
- Y ahora se sabe **con qué figura** y **con qué baraja** se ganó, que antes no
  lo sabía nadie: el anfitrión validaba de un vistazo y ahí se acababa.

⚠️ Lo que decide el dinero es que las barajas estén **cantadas**, y eso lo sabe
el servidor: el historial es suyo y las barajas de la carta también. Las fichas
las manda el navegador, así que podrían falsearse — pero mentir ahí solo saltaría
el requisito de haber estado atento, nunca daría por buena una carta cuyas
barajas no hayan salido.

La lógica está en `victoria.js` del backend, con 55 pruebas propias. Ahí sí hay
pruebas unitarias, al revés que en el cliente: es lógica pura, determinista, y un
fallo no se ve en pantalla — se ve en el saldo de alguien.

### 📊 Durante la partida

Encima del historial va el contador de barajas cantadas (`23/54`). Solo los
números: se probó con «Baraja 23 · quedan 31» y las palabras ocupaban más que el
dato, justo en la pantalla donde menos sitio hay.

Las barajas que tienes **laten** cuando las cantan, y dejan de latir en cuanto
les pones la ficha encima. El aviso está para ayudarte a encontrarlas, no para
seguir llamando la atención sobre algo ya resuelto.

### 🤖 Bots

Como el servidor ya sabe validar, sabe también cuándo un bot tendría lotería —
es la misma función. El anfitrión pica un botón y se suma un jugador de la casa.

| Nivel | Se da cuenta | Tapar + gritar | A 3 s por baraja |
|---|---|---|---|
| 🤖 Distraído | 55% | 1.4–3.6 s | se le pasa a menudo |
| 🤖 Normal | 85% | 0.85–2.3 s | casi siempre llega |
| 🤖 Experto | 97% | 0.45–1.25 s | siempre llega |

Los dos retardos **se suman**, y con la regla de gritar a tiempo esa suma tiene
que caber entre dos cantes: por eso un distraído pierde muchas.

El distraído **no es un bot roto**: una sala donde todos juegan perfecto es una
sala donde no ganas nunca. Que se les pasen barajas es lo que deja hueco.

Un bot grita lotería por el mismo camino que una persona y el servidor lo juzga
igual. Su dinero es de la banca y nunca toca Firestore.

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
- **SSO** desde el Hub por token firmado en la URL (`?tk=`).

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
- [x] Arreglar `manifest.json` y unificar los nombres de archivo a minúsculas
- [x] Optimizar assets — de 101 MB a 53 MB, midiendo a qué tamaño se ven de verdad
- [x] Pruebas automáticas en Chrome, sobre la fuente y sobre el bundle ofuscado
- [x] Ofuscación automática en el build de Vercel
- [x] Quitar los `onclick` del HTML (paso previo a modularizar)
- [x] Empaquetado con esbuild antes de ofuscar (habilita los módulos)
- [x] Partir `app.js` en módulos ES — 20 módulos; de 2.030 líneas a ~770
- [x] Generador de cartas: packs de 4 por 20 monedas, 2 a medida por 25, y
      pantalla «Mis Cartas». La generación es del **servidor**
- [x] **Las cartas dejan de ser imágenes** — 60 generadas y equilibradas por
      modo, servidas como datos. Se fueron 45 MB de JPG
- [x] **Validación automática de ganadores** — el servidor busca las 20 figuras;
      se acabó el anfitrión juzgando a ojo
- [x] Modo **Doble**: una baraja ocupa las dos casillas del centro
- [ ] Evaluar migración de Render a VPS propio
- [ ] Tienda dinámica: mover el catálogo a Firestore (hoy está duplicado en
      `config.js` y en el backend)
- [x] **Bots** con tres niveles, que el anfitrión añade a su sala
- [x] Regla del tiempo: hay que gritar con la baraja que cierra la figura
- [x] Modo **Doble**, contador de barajas cantadas y cartas de cristal
- [ ] Sacar el estado de las salas a Redis — es lo que bloquea todo lo demás:
      hoy un reinicio de Render tumba las partidas en curso
- [ ] Salas de bots permanentes (necesita lo de arriba)
- [ ] Historial de partida al terminar: cuántas barajas se cantaron, quién se
      quedó a una. El servidor ya calcula ese dato para el aviso de rechazo
- [ ] Modos nuevos que ahora salen casi gratis: figura anunciada por partida,
      contrarreloj, torneo por rondas

---

## 🛠️ Notas de infraestructura

- **Render (plan free)** duerme tras 15 min de inactividad; se mantiene despierto con
  **UptimeRobot** haciendo ping periódico.
- El **estado de las salas vive en memoria**: un redeploy o reinicio de Render tumba
  las partidas en curso. Migrarlo a Redis permitiría reinicios sin pérdida y más de
  una instancia.
- Variables de entorno en Render: `nicknames` (service account de Firebase en JSON),
  `STRIPE_SECRET_KEY`, `ADMIN_EMAIL`, `PORT`.
