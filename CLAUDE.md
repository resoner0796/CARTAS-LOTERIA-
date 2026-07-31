# CLAUDE.md — Lotería Online (Frontend)

Contexto para agentes trabajando en este repo. Léelo antes de tocar código.

## Qué es esto

Frontend de un juego de **Lotería mexicana multijugador en tiempo real** con monedas
virtuales, apuestas, tienda y pagos reales vía Stripe. Es una web app estática sin
framework ni bundler, que se despliega en Vercel y habla con un backend Node separado
alojado en Render.

Forma parte de un ecosistema más grande, **Juegos en la Nube**
(`juegosenlanube.com`), que también incluye Serpientes y Escaleras y Pirinola —
todos servidos por el **mismo** backend.

## Arquitectura

```
NAVEGADOR
   │
   ├── VERCEL ─────────── este repo (HTML/CSS/JS/assets estáticos)
   │                      loteria.juegosenlanube.com
   │
   └── RENDER ─────────── repo `loteria-backend` (server.js)
       loteria-backend-3nde.onrender.com
       ├── REST  /api/*        login, tienda, pagos, transferencias, admin
       └── Socket.IO           salas, cartas cantadas, apuestas, validación
              │
       ┌──────┴──────┐
   FIRESTORE      STRIPE + FCM
```

Vercel **solo sirve archivos**, no ejecuta nada. Toda la lógica de servidor,
persistencia y dinero vive en Render.

## Los dos repos

| Repo | Contenido | Deploy | Ruta local |
|---|---|---|---|
| `resoner0796/CARTAS-LOTERIA-` | Este. Frontend | Vercel (auto en push a `main`) | `~/CARTAS-LOTERIA--1` |
| `resoner0796/loteria-backend` | `server.js` + `package.json` | Render (auto en push a `main`) | `~/loteria-backend-repo` |

**Casi cualquier cambio de comportamiento toca los dos repos.** Antes de modificar un
evento de socket o un endpoint, revisa el otro lado en `~/loteria-backend-repo/server.js`.

### Carpetas locales obsoletas — NO USAR
- `~/CARTAS-LOTERIA-` — clon viejo del frontend, archivos sueltos sin estructura (dic 2025).
- `~/Desktop/loteria-backend` — clon del backend congelado en agosto 2025 (`server.js` de
  70 líneas vs. las 1,760 de producción). Un push desde ahí destruiría el servidor.

## Estructura

```
index.html            Todas las pantallas en un solo archivo (SPA por clases CSS)
css/style.css         Estilos (~1,250 líneas)
js/app.js             Toda la lógica de cliente (~2,030 líneas), en claro
scripts/obfuscate.js  Ofuscador que corre Vercel en el build — ver abajo
vercel.json           buildCommand + outputDirectory
service-worker.js     Existe pero NUNCA se registra (PWA no funciona)
manifest.json         Íconos apuntan a rutas rotas
assets/imagenes/      151 archivos, ~100 MB. Fondos PNG de 2–4 MB c/u
assets/audios/        70 archivos (voz de cada carta + efectos)
package.json          Scripts de build y devDependency del ofuscador
```

### Ofuscación: ocurre en el build de Vercel, nunca en el repo

**El repo guarda siempre `js/app.js` legible.** No se commitea código ofuscado.

Vercel clona, corre `npm run build` (`scripts/obfuscate.js`) que reescribe `js/app.js`
dentro de su contenedor efímero, y publica el resultado. Tu working tree no se toca.

- `npm run build:dry` — simulacro local: ofusca en memoria y valida, sin escribir.
- `npm run build` — se **niega** a correr fuera de Vercel (revisa `process.env.VERCEL`),
  para que nadie deje la fuente ofuscada por accidente.

Configuración en `vercel.json` (`buildCommand` + `outputDirectory: "."`).

**Regla crítica:** `renameGlobals` va en `false`. `index.html` invoca funciones desde
atributos inline (`onclick="login()"`); si el ofuscador las renombra, los botones dejan
de servir sin que salte ningún error hasta que un usuario los pica. El script verifica
al final que los 33 identificadores que el HTML necesita sigan existiendo en la salida
—tanto en claro como codificados en el string array— y aborta si falta alguno.

## Convenciones

- **Todo en español**: variables, funciones, comentarios, eventos de socket
  (`unirse-sala`, `carta-cantada`, `jugadores-actualizados`).
- **Sin módulos ni bundler.** `app.js` se carga con `<script>` plano; las funciones
  son globales y se invocan desde `onclick="..."` en el HTML. Si renombras una
  función, busca su `onclick` en `index.html`.
- **Navegación** = `cambiarPantalla(nombre)`, que alterna la clase `.activa` sobre
  los `div.pantalla`. Referencias en el objeto `pantallas` (arriba de `app.js`).
- **Modales**: usa `mostrarAlerta()` / `mostrarConfirmacion()`, no `alert()` ni
  `confirm()` nativos. (Quedan algunos `confirm()` en `comprarItem` — deuda técnica.)
- **Sesión**: el objeto completo del usuario vive en `localStorage` bajo
  `loteria_usuario`. No hay tokens.
- **Cartas**: modo `pozo` usa `assets/imagenes/cartas/cuatro/` con nombres sin ceros
  (`1.jpg`); los demás modos usan `assets/imagenes/cartas/` con ceros (`01.jpg`).
  La variable es `rutaCartasJugador`. Las cartas cantadas del historial siempre salen
  de `assets/imagenes/barajas/` con ceros.
- **CSP** declarada en un `<meta>` de `index.html`. Si agregas un dominio externo
  (script, fetch, websocket), hay que añadirlo ahí o el navegador lo bloquea.

## Modos de juego

Definidos en el backend (`MODOS_JUEGO`), el front los recibe en el evento `info-sala`:

| Modo | Costo/carta | Cartas del jugador |
|---|---|---|
| `tradicional` | 1 | 54 |
| `llena` | 2 | 54 |
| `pozo` | 2 | 20 (baraja especial) |

La baraja que se canta **siempre es de 54**, sin importar el modo.

## Flujo de una partida

1. `unirse-sala` → el server responde `rol-asignado` (host = quien creó la sala) e `info-sala`.
2. El jugador elige hasta 4 cartas → `seleccionar-carta` / `deseleccionar-carta`.
   El server difunde `cartas-desactivadas` para que nadie repita carta.
3. `apostar` → cobra `costoCarta × nº de cartas`, alimenta el bote.
4. El host lanza `iniciar-juego` con una velocidad → el server empieza a emitir
   `carta-cantada` cada N ms.
5. Alguien grita `loteria` → pausa de 4 s para recoger empates → el **host** valida
   visualmente cada tabla reclamante (`veredicto-host`) → `ganadores-multiples`
   reparte el bote.
6. Al reconectar (F5), `reconectar` restaura cartas, apuesta y rol vía
   `estado-sala-restaurado`.

## Deuda técnica conocida

Seguridad (crítica, ver README para el detalle):
- El backend no autentica: confía en el email que le manden en el body. Se puede
  vaciar la cuenta de cualquiera y auto-recargarse monedas.
- El "admin" se valida comparando un header de texto plano contra `ADMIN_EMAIL`.
  Ya no está hardcodeado en el cliente, pero sigue siendo autorización débil.
- El SSO del Hub es base64 sin firmar → falsificable.

Bugs:
- `generarCartas()` genera 53 cartas en modo tradicional; deberían ser 54.
- `estado-sala-restaurado` usa ruta fija en vez de `rutaCartasJugador` → cartas
  equivocadas al reconectarse en modo Pozo.
- El service worker nunca se registra.
- `manifest.json` apunta a íconos que no existen en esa ruta.
- `cartasDisponibles` (arriba de `app.js`) es código muerto.
- `guardarSetFavorito` y `verificarDestinatario` usan el `event` global implícito
  (solo funciona en Chrome).

Rendimiento:
- ~100 MB de assets sin optimizar. Fondos PNG de 2–4 MB.

Infra:
- Render (plan free) duerme a los 15 min. Se mantiene despierto con UptimeRobot.
- El estado de las salas vive en RAM: un reinicio de Render tumba las partidas activas.

## Probar local

No hay build ni tests. Sirve la carpeta con cualquier server estático:

```bash
python3 -m http.server 8000   # luego abre http://localhost:8000
```

Apunta al backend de **producción** (URL hardcodeada arriba de `app.js`), así que
cuidado: los cambios locales tocan monedas y usuarios reales.
