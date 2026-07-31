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

## El ecosistema: cinco repos

| Repo | Rol | Producción | Ruta local |
|---|---|---|---|
| `juegosenalnube` | **Hub**: el único con login | www.juegosenlanube.com | `~/juegosenalnube` |
| `loteria-backend` | **Backend**: API + Socket.IO para todos | loteria-backend-3nde.onrender.com | `~/loteria-backend-repo` |
| `CARTAS-LOTERIA-` | Este. Lotería mexicana | loteria.juegosenlanube.com | `~/CARTAS-LOTERIA--1` |
| `Serpientesyescaleras` | Serpientes y Escaleras | serpientes.juegosenlanube.com | `~/Serpientesyescaleras` |
| `Pirinola-Online` | Pirinola | pirinola.juegosenlanube.com | `~/Pirinola-Online` |

```
        HUB (login, monedero, catálogo)
                 │  reparte el token en la URL (?tk=...)
   ┌─────────────┼─────────────┐
LOTERÍA ←aquí SERPIENTES   PIRINOLA
   └─────────────┼─────────────┘
                 ▼
       BACKEND (Render): Socket.IO + /api/*
                 │
            FIRESTORE · STRIPE · FCM
```

**Casi cualquier cambio de comportamiento toca los dos repos.** Antes de modificar
un evento de socket o un endpoint, revisa el otro lado en
`~/loteria-backend-repo/server.js`.

### Carpetas locales obsoletas — NO USAR
- `~/CARTAS-LOTERIA-` — clon viejo del frontend, archivos sueltos sin estructura (dic 2025).
- `~/Desktop/loteria-backend` — clon del backend congelado en agosto 2025 (`server.js` de
  70 líneas vs. las 1,760 de producción). Un push desde ahí destruiría el servidor.

## Estructura

```
index.html            Todas las pantallas en un solo archivo (SPA por clases CSS)
css/style.css         Estilos (~1,900 líneas)
js/app.js             Punto de entrada y grueso de la lógica (~2,000 líneas)
js/modulos/           Piezas ya separadas (ver "Modularización")
  config.js             Direcciones, clave pública de Stripe, catálogos de tienda
  utiles.js             escaparHtml() y actualizarValor()
  ui.js                 Pantallas y los dos modales del sistema
  sesion.js             Token, helper api() y manejo del 401
  monedero.js           Transferencias entre jugadores e historial
scripts/obfuscate.js  Empaqueta y ofusca en el build de Vercel — ver abajo
vercel.json           buildCommand + outputDirectory
service-worker.js     Estrategias de caché (PWA)
manifest.json         Íconos apuntan a rutas rotas
assets/imagenes/      151 archivos, ~100 MB. Fondos PNG de 2–4 MB c/u
assets/audios/        70 archivos (voz de cada carta + efectos)
package.json          Scripts de build; esbuild y el ofuscador como devDependencies
```

### El build: empaquetar y ofuscar, en Vercel, nunca en el repo

**El repo guarda siempre la fuente legible.** No se commitea código ofuscado.

Son dos pasos encadenados:

```
js/app.js + js/modulos/*.js  ──esbuild──▶  un solo IIFE  ──ofuscador──▶  js/app.js
```

Vercel clona, corre `npm run build` (`scripts/obfuscate.js`), que hace las dos cosas
dentro de su contenedor efímero, y publica el resultado. Tu working tree no se toca.

- `npm run build:dry` — simulacro local: empaqueta y ofusca en memoria, valida, y no
  escribe nada.
- `npm run build` — se **niega** a correr fuera de Vercel (revisa `process.env.VERCEL`),
  para que nadie deje la fuente ofuscada por accidente.

**El empaquetado va primero por necesidad**, no por gusto: el ofuscador trabaja sobre
un archivo suelto y no sabe seguir un `import`. Si extraes un módulo y el build no
empaqueta, lo que llega a producción es un archivo con imports que el ofuscador no
entiende.

**El build borra `js/modulos/` del contenedor tras empaquetar.** El bundle ya lleva
todo dentro; si la carpeta se quedara, Vercel publicaría también las fuentes legibles
y cualquiera podría pedir `js/modulos/config.js` para leer sin ofuscar justo lo que
se acaba de ofuscar. Se borra de la copia efímera, jamás del repo.

**Sobre la ofuscación y los nombres:** `renameGlobals` va en `true`. Desde que el
HTML dejó de llamar funciones por su nombre, **ya no queda ninguna función con su
nombre visible** (de 68 declaradas, cero). El script sigue escaneando el HTML **y**
las fuentes JS por si alguien reintroduce un atributo inline, reserva esos nombres, y
después carga el bundle en un DOM simulado para comprobar con `typeof` que resuelvan.
Si vuelves a meter un `onclick`, esa red lo cubre — pero mejor no.

> El escáner ignora los comentarios a propósito: varios documentan el patrón viejo
> (`antes era onclick="login()"`) y los tomaba por código real, reservando nombres
> que ya nadie invoca. No rompía nada, pero falseaba la cuenta final.

### Modularización (en curso)

`app.js` se está partiendo en `js/modulos/`, **un módulo a la vez**, verificando
después de cada movimiento. Van cuatro:

```
config.js ──┬──▶ sesion.js ◀──┬── ui.js
utiles.js ──┘         ▲       │
                      └───────┴──▶ monedero.js
                                        ▲
                      app.js  (punto de entrada) ──┘
```

- **`config.js`** — lo que no cambia en tiempo de ejecución: direcciones, la clave
  pública de Stripe, los catálogos de la tienda. No toca el DOM ni importa nada.
- **`utiles.js`** — funciones sueltas que usa medio archivo y no pertenecen a ninguna
  parte concreta. Tampoco importa nada.
- **`ui.js`** — navegación entre pantallas y los dos modales. Toca el DOM pero no
  sabe nada del juego ni del socket.
- **`sesion.js`** — el token y el helper `api()`. Importa de `config` y de `ui`.
- **`monedero.js`** — transferencias e historial. **Recibe el usuario como
  argumento**, no lee `usuarioActual`.
- **`app.js`** — todo lo demás, por ahora.

Dos reglas que ya evitaron problemas:

⚠️ **Nunca metas en `config.js` referencias al DOM** (`getElementById`) ni variables
que el juego reasigne mientras corre. Lo primero depende de que la página ya esté
parseada; lo segundo convierte un módulo de datos en estado compartido.

⚠️ **En `ui.js` las referencias al DOM se resuelven cuando hacen falta, no al
importar.** El orden en que se evalúan los módulos no garantiza que la página esté
parseada; un `getElementById` al tope del módulo puede devolver `null` para siempre.
Por eso los botones del modal se enganchan desde `iniciarModales()`, que llama el
arranque.

**Cuando un módulo necesite algo que vive en el estado de la partida, pásalo como
argumento en vez de importarlo.** Es la regla que hace posible avanzar sin tener que
desatar antes el nudo de las globales (`usuarioActual` tiene 77 usos, `socket` 55).

Dos ejemplos ya en el código:

- El modal pinta la tabla ganadora y necesitaba `rutaCartasJugador`, que cambia
  según el modo. La ruta viaja **dentro** del objeto `prueba`. (Importa: en modo
  Pozo las tablas salen de otra carpeta, así que leer la ruta equivocada saca la
  tabla rota.)
- `monedero.js` recibe el usuario en cada llamada. **El sitio donde se inyecta el
  estado es la tabla `ACCIONES`**, que ya es el único punto de entrada desde la
  interfaz:

  ```js
  'abrir-historial': () => abrirHistorial(usuarioActual),
  'transferir':      (el) => realizarTransferencia(el, usuarioActual, sincronizarDatosForzoso),
  ```

  El módulo puede mutar el objeto que recibe (así el saldo baja en pantalla al
  instante), pero no sabe de dónde salió ni quién más lo mira.

Pendiente de repartir: socket, sala, selección, juego, apuestas, validación, tienda
y admin.

## Convenciones

- **Todo en español**: variables, funciones, comentarios, eventos de socket
  (`unirse-sala`, `carta-cantada`, `jugadores-actualizados`).
- **Módulos ES.** `index.html` carga `app.js` con `<script type="module">`. En
  desarrollo el navegador resuelve los `import` solo, sin build; en producción llega
  todo empaquetado en un archivo. Al ser módulo, nada de lo que declares es global:
  si algo tiene que estar en `window`, ponlo ahí explícitamente.
- **El HTML no llama funciones por su nombre.** Cada elemento declara *qué* hace
  y un único escucha en el documento resuelve el clic:

  ```html
  <button data-accion="pagar" data-monedas="150">…</button>
  ```

  El *cómo* vive en la tabla `ACCIONES`, al final de `app.js`. Para añadir un
  botón: pon su `data-accion` en el HTML y su entrada en esa tabla. **No vuelvas
  a usar `onclick`**: ataba el marcado a que ciertas funciones fueran globales,
  y era lo que impedía pasar a módulos. Como la delegación es sobre el
  documento, también funciona con el HTML que se genera en caliente (tienda,
  lista de jugadores, tabla de administración) sin enganchar nada al repintar.
- **Navegación** = `cambiarPantalla(nombre)`, que alterna la clase `.activa` sobre
  los `div.pantalla`. Referencias en el objeto `pantallas` (arriba de `app.js`).
- **Modales**: usa `mostrarAlerta()` / `mostrarConfirmacion()`, no `alert()` ni
  `confirm()` nativos. (Quedan algunos `confirm()` en `comprarItem` — deuda técnica.)
- **Sesión**: el token JWT vive en `localStorage.loteria_token` y el perfil
  cacheado en `loteria_usuario`. Toda llamada a la API pasa por el helper `api()`,
  que añade `Authorization: Bearer`. El socket manda el token en su handshake.
  Nunca uses `fetch` directo contra la API.
- **SSO desde el Hub**: llega como `?tk=<JWT>`. El parámetro `sso` (base64 sin
  firmar) era el mecanismo viejo; el Hub ya no lo genera.
- **Cartas**: modo `pozo` usa `assets/imagenes/cartas/cuatro/` con nombres sin ceros
  (`1.jpg`); los demás modos usan `assets/imagenes/cartas/` con ceros (`01.jpg`).
  La variable es `rutaCartasJugador`. Las cartas cantadas del historial siempre salen
  de `assets/imagenes/barajas/` con ceros.
- **CSP** declarada en un `<meta>` de `index.html`. Si agregas un dominio externo
  (script, fetch, websocket), hay que añadirlo ahí o el navegador lo bloquea.

## Modos de juego

Definidos en el backend (`MODOS_JUEGO`), el front los recibe en el evento `info-sala`:

| Modo | Costo por tabla | Tablas para elegir |
|---|---|---|
| `tradicional` | 1 | 53 |
| `llena` | 2 | 53 |
| `pozo` | 2 | 20 (set especial) |

⚠️ **No confundir los dos conjuntos**, es la trampa más fácil de este proyecto:
- **Tabla** = lo que elige el jugador. `assets/imagenes/cartas/`, hay **53** (`01`–`53`).
- **Carta** = lo que se canta. `assets/imagenes/barajas/`, hay **54** (`01`–`54`),
  con una voz por cada una en `assets/audios/NN.mp3`.

Que `generarCartas()` pinte 53 es **correcto**. La baraja que se canta siempre es
de 54, sin importar el modo.

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

Seguridad: cerrada. El backend exige JWT (`AUTH_ESTRICTA` activo), hay rate
limiting, CORS restringido, pagos idempotentes con webhook firmado y los datos de
usuario se escapan antes de pintarse. Detalle en el README del backend.

**Al escribir en el DOM, escapa siempre lo que venga de otra persona** con
`escaparHtml()`. Nicknames y nombres de sala los escribe gente: sin escapar, un
nickname como `<img src=x onerror=...>` ejecuta código en el navegador de todos
los de la sala, y la sesión vive en `localStorage`.

### Cosas que ya mordieron, para no repetirlas

- **`info-sala` se mandaba a toda la sala.** El cliente reacciona regenerando el
  tablero, así que cada jugador nuevo borraba a los demás sus tablas marcadas.
  Va solo a quien entra.
- **El guión de Socket.IO se sirve desde el backend.** Si está dormido, `io` no
  existe y la excepción se llevaba por delante todo `app.js`. Hay una guarda.
- **Entrar desde el Hub era una carrera.** El perfil llega por red y `window.onload`
  decidía antes de tiempo que no había sesión. Existe `entrandoDesdeHub`.
- **Los modales de aviso y confirmación comparten contenedor.** Hay que limpiar
  la prueba de victoria o reaparece donde no toca.
- **El backend mandaba el documento entero del usuario al navegador.**
  `usuario-actualizado` emitía `doc.data()` tal cual en los diez sitios donde se
  dispara, así que el hash bcrypt de la contraseña y el `fcmToken` viajaban al
  cliente y quedaban a la vista en la consola. Existe `perfilPublico()`, que es
  **lista blanca**: con lista negra, cualquier campo sensible que se añada al
  documento más adelante se filtraría solo y en silencio. Si tocas ese evento,
  pásalo por ahí.
- **El historial pintaba las descripciones sin escapar.** La descripción de una
  transferencia lleva dentro el nickname del OTRO jugador (`Envío a Fulano`) y se
  metía con `innerHTML`. Hoy el registro no admite símbolos raros, pero las cuentas
  anteriores a esa validación pueden tener cualquier cosa y sus movimientos ya
  están guardados en Firestore. Se comprobó ejecutando: con el código viejo, un
  nickname con `<img src=x onerror=...>` **corría de verdad**. Moraleja: valida la
  entrada, pero escapa SIEMPRE en la salida — la validación puede llegar tarde.
- **Cachear respuestas parciales revienta la Cache API.** Los `<audio>` se piden
  por rangos y el servidor responde `206`; `cache.put()` solo admite respuestas
  completas y rechazaba con "Cache.put() encountered a network error". Como los
  `put` iban sin `.catch()`, cada fallo salía como *Uncaught (in promise)* y
  enterraba los errores de verdad. Se filtran antes y el guardado ya no puede
  tumbar nada.

**Para verificar de verdad un cambio en el cliente**, compara tres copias con el
mismo guion: la versión anterior (`git archive HEAD`), la nueva sin empaquetar y la
nueva empaquetada+ofuscada. Sin la primera no sabes si un fallo lo trajiste tú; sin
la tercera no sabes qué hace el código que realmente se publica. Los dos bugs más
caros de este repo —botones renombrados por el ofuscador— los encontró la
ejecución, nunca la lectura del diff.

Bugs pendientes:
- `manifest.json` apunta a íconos que no existen en esa ruta.
- Los cuatro `icon-192`/`icon-512` son **el mismo blob de 1.5 MB** duplicado bajo
  cuatro nombres que solo difieren en mayúsculas. Para un icono de 192px sobra
  entero.
- `cargar-usuarios-admin` y `gritar-loteria` truenan si `usuarioActual` es `null`.
  No se alcanza jugando normal —ambas exigen sesión— pero les falta la guarda.

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
