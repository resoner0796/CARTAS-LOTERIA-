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
js/app.js             Punto de entrada (~700 líneas) — ver "Arquitectura del cliente"
js/modulos/           18 módulos. La tabla de qué hace cada uno está más abajo
scripts/obfuscate.js  Empaqueta y ofusca en el build de Vercel — ver abajo
vercel.json           buildCommand + outputDirectory
service-worker.js     Estrategias de caché (PWA)
manifest.json         Íconos apuntan a rutas rotas
assets/imagenes/      ~53 MB. Ver "Assets" antes de añadir imágenes
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
nombre visible**. El script sigue escaneando el HTML **y**
las fuentes JS por si alguien reintroduce un atributo inline, reserva esos nombres, y
después carga el bundle en un DOM simulado para comprobar con `typeof` que resuelvan.
Si vuelves a meter un `onclick`, esa red lo cubre — pero mejor no.

> El escáner ignora los comentarios a propósito: varios documentan el patrón viejo
> (`antes era onclick="login()"`) y los tomaba por código real, reservando nombres
> que ya nadie invoca. No rompía nada, pero falseaba la cuenta final.

### Arquitectura del cliente

`app.js` se partió en `js/modulos/`. Se hizo **un módulo a la vez**, verificando
después de cada movimiento; de 2.030 líneas en un archivo a **18 módulos**.

```
       config.js   utiles.js          hojas: no importan nada
            │           │
            └─────┬─────┘
                  ▼
              ui.js ──▶ sesion.js     pantallas, modales, token, api()
                  │         │
                  ├─────────┤
                  ▼         ▼
              socket.js   estado.js   la conexión · lo que se comparte
                  │           │
     ┌────────────┴───────────┴────────────┐
     ▼                                     ▼
  tablero.js    sala.js    jugadores.js    tienda.js
  validacion.js favoritos.js efectos.js    monedero.js
  animaciones.js  audio.js   sso.js        admin.js
     │
     ▼
  app.js   (punto de entrada)
```

**Qué hay en cada uno**

| Módulo | De qué se ocupa |
|---|---|
| `config.js` | Direcciones, clave pública de Stripe, catálogos. No toca el DOM |
| `utiles.js` | `escaparHtml()` y `actualizarValor()` |
| `ui.js` | Pantallas y los dos modales del sistema |
| `sesion.js` | Token, helper `api()` y manejo del 401 |
| `socket.js` | La conexión Socket.IO, con su guarda |
| `estado.js` | Lo que comparten varios módulos: `sesion` y `partida` |
| `sso.js` | Entrar desde el Hub con `?tk=` |
| `sala.js` | Crear, entrar, invitar y salir |
| `jugadores.js` | La lista de la sala y el silencio del anfitrión |
| `tablero.js` | Elegir tablas, la mesa, las fichas, las cartas cantadas |
| `validacion.js` | Gritar lotería y el veredicto del anfitrión |
| `favoritos.js` | El set de tablas preferido |
| `tienda.js` | Recarga con tarjeta y compra de artículos |
| `monedero.js` | Transferencias e historial |
| `admin.js` | Panel de administración |
| `efectos.js` | Soundboard: sonidos que dispara **la gente** |
| `audio.js` | Sonidos que dispara **el juego** |
| `animaciones.js` | Gestos y decoración. Puro DOM |
| `monedas.js` | Las torres del bote y del pozo: una moneda por peso |
| `tablasPropias.js` | Tablas compradas: el generador de la tienda y «Mis Cartas» |
| `app.js` | Arranque, login/registro, y los eventos de socket de la partida |

### Las cinco reglas del cliente

Cada una salió de un fallo real. Si las rompes, vuelven.

**1. Cada módulo escucha sus propios eventos de socket.**
`carta-cantada` lo atiende `tablero.js`; `pausa-empate`, `validacion.js`. Antes
estaban los treinta juntos y había que leerlos todos para saber quién tocaba qué.

**2. El estado compartido son OBJETOS, no variables sueltas.**
Si se exportara `let sala = ""`, cada módulo se llevaría una copia al importar y
no vería los cambios de los demás. Con un objeto, todos miran el mismo sitio.
⚠️ En `estado.js` va **solo** lo que comparten varios módulos: es el sitio fácil
donde acaba amontonándose todo si nadie lo cuida.

**3. Lo que no es estado compartido se pasa como argumento.**
El modal necesitaba `rutaCartas`, que cambia según el modo: la ruta viaja
**dentro** del objeto `prueba`. `monedero.js`, `tienda.js` y `admin.js` reciben el
usuario. El sitio donde se inyecta es la tabla `ACCIONES`:

```js
'abrir-historial': () => abrirHistorial(sesion.usuario),
'transferir':      (el) => realizarTransferencia(el, sesion.usuario, sincronizarDatosForzoso),
```

**4. Pasa funciones como argumento para no crear ciclos.**
`favoritos.js` necesita seleccionar tablas y `sala.js` limpiar el tablero, pero
ninguno importa de `tablero.js`: las reciben. Al revés serían dependencias en
círculo.

**5. Las referencias al DOM se resuelven cuando hacen falta, no al importar.**
El orden en que se evalúan los módulos no garantiza que la página esté parseada;
un `getElementById` al tope puede devolver `null` para siempre. Por eso hay
funciones `iniciarModales()`, `iniciarValidacion()`, `iniciarJugadores()` que
llama el arranque.

### Qué se quedó en app.js, y por qué

Las ~700 líneas que quedan **no son "lo que no dio tiempo"**: son lo que le toca
al punto de entrada.

- **El arranque** (`window.onload`) y el orden en que ocurre todo.
- **Login y registro**, que están entrelazados con la decisión de qué pantalla
  mostrar. Sacarlos a un módulo dejaría a los dos llamándose todo el rato.
- **Los eventos de socket de la partida** (`info-sala`, `rol-asignado`,
  `bote-actualizado`, `usuario-actualizado`): reparten datos a varios módulos a
  la vez, así que no pertenecen a ninguno.
- **La tabla `ACCIONES`**, que es donde el marcado se une con el código.
- **El pozo** (`pozoDisponible`, `refrescarPozoUI`): veinte líneas que se leen
  mejor donde están que en un archivo propio.

Se valoró extraer `autenticacion.js` y `apuestas.js` y se decidió que **no**: el
rendimiento decreciente ya no compensa el archivo extra.

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
- **El service worker servía el CSS desde la caché, para siempre.** `esCodigo`
  incluía html, js y json, pero **no css**, así que `style.css` caía en la rama
  de "primero la caché" junto a las imágenes. Quien ya hubiera entrado una vez se
  quedaba con la hoja de estilos de aquel día y **no veía ningún cambio visual**,
  por más despliegues que hubiera. Costó verlo porque el archivo publicado sí era
  el nuevo: el viejo estaba en el navegador de cada persona. Si tocas esa lista,
  el CSS va con el código.
  ⚠️ Al cambiar algo que ya esté cacheado, **sube `CACHE_NAME`**: es lo que hace
  que la caché anterior se borre en la siguiente visita.
- **El guión de Socket.IO se sirve desde el backend.** Si está dormido, `io` no
  existe y la excepción se llevaba por delante todo `app.js`. Hay una guarda.
- **…y esa guarda escondió que el juego arrancaba sin conexión.** Al pasar
  `app.js` a `type="module"`, el módulo empezó a ejecutarse **antes** que el
  `<script>` clásico de Socket.IO, que tarda porque lo sirve Render. `io` no
  existía al crear el socket, así que se usaba el objeto no-op: sin errores en
  consola, con la interfaz entera respondiendo… y sin salas ni partidas.
  **Los dos scripts externos llevan `defer`**, para compartir cola con el módulo
  y ejecutarse en el orden del documento. Si tocas esas etiquetas, no se lo
  quites. El arnés comprueba que haya handshake justo por esto: una app que
  pinta bien puede estar completamente desconectada.
- **Entrar desde el Hub era una carrera.** El perfil llega por red y `window.onload`
  decidía antes de tiempo que no había sesión. Existe `sesion.entrandoDesdeHub`, y
  `verificarSSO()` se llama ANTES de registrar `window.onload`. Si mueves esa
  llamada de sitio, la carrera vuelve.
- **El `?sso=` viejo se retiró.** Era JSON en base64 sin firmar: cualquiera podía
  fabricarse uno. En la práctica ya no servía para operar —sin token, la primera
  llamada a la API daba 401 y la sesión se limpiaba sola— pero sí llegaba a
  procesar el perfil falsificado. El Hub lleva tiempo mandando solo `?tk=`, así que
  se quitó. **No lo reintroduzcas.**
  Se retiró también de Serpientes y Pirinola: **ya no queda en ningún repo**.
- **Los modales de aviso y confirmación comparten contenedor.** Hay que limpiar
  la prueba de victoria o reaparece donde no toca.
- **El backend mandaba el documento entero del usuario al navegador.**
  `usuario-actualizado` emitía `doc.data()` tal cual en los diez sitios donde se
  dispara, así que el hash bcrypt de la contraseña y el `fcmToken` viajaban al
  cliente y quedaban a la vista en la consola. Existe `perfilPublico()`, que es
  **lista blanca**: con lista negra, cualquier campo sensible que se añada al
  documento más adelante se filtraría solo y en silencio. Si tocas ese evento,
  pásalo por ahí.
- **El cliente decidía cuánto costaban las cosas.** En seis sitios llegaba una
  cifra de dinero del navegador y se usaba tal cual: `/crear-orden` cobraba el
  `precio` del cuerpo, `comprar-item` hacía `saldo - precio`, y las cuatro
  apuestas de Serpientes y Pirinola hacían `increment(-monto)`. En los dos
  últimos casos un **valor negativo no cobraba: regalaba**, y la guarda de saldo
  no lo frenaba porque ningún saldo es menor que un número negativo. Ahora el
  servidor tiene `PAQUETES_MONEDAS`, `CATALOGO_ITEMS` y `montoApuestaValido()`.
  **Regla: si una cifra decide dinero, sale del servidor.** Los precios del
  frontend son solo para pintar.
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

Bugs pendientes: ninguno conocido en el cliente.

⚠️ **Nombres de archivo: todo en minúsculas.** macOS no distingue mayúsculas en
los nombres, pero git y el Linux de Vercel sí. Había un `icon-192.PNG` y un
`icon-192.png`: en tu Mac son **el mismo archivo**, en producción son **dos**.
Al optimizar los iconos, el cambio llegó a uno solo — y el `manifest.json` pedía
justo el otro, así que la app instalada seguía bajando 1.5 MB de icono. No da
ningún error: simplemente se sirve el archivo equivocado.
Para comprobar que no vuelve a pasar:

```bash
git ls-files assets/ | awk '{print tolower($0)}' | sort | uniq -d
```

### Assets

Pasaron de ~101 MB a ~53 MB. Lo que se hizo, por si añades imágenes nuevas:

- **Se midió a qué tamaño se ven de verdad, en el navegador.** Sin eso se
  redimensiona a ojo. Los datos: una tabla se ve a 393px como mucho, una baraja
  del historial a 82px, y una ficha a 60px.
- **Las tablas NO se redimensionaron.** A 393px con pantalla retina 3x hacen falta
  1179px y miden 1350: ya estaban bien. Lo que sobraba era compresión —estaban
  guardadas casi sin comprimir— y con calidad 85 pasaron de 52 a 44 MB sin tocar
  un píxel. Son las que el anfitrión mira de cerca para validar victorias.
- **Barajas y fichas sí sobraban, y mucho**: 1292px para verse a 82px, 1024px para
  verse a 60px. A 400px y 256px respectivamente, quedaron en un 6% y un 11%.
- **Los fondos pasaron de PNG a JPEG.** Son ilustraciones sin transparencia; en
  PNG ocupaban 16 MB y en JPEG ocupan 3. Los nombres están centralizados en
  `sala.js`, así que cambiarlos fue tocar cuatro líneas.
- **Los fondos NO se redimensionaron.** Miden 1024×1536 y se estiran a pantalla
  completa: en un móvil retina ya se quedan cortos. Reducirlos se vería.

⚠️ **Si borras o renombras un asset, revisa `service-worker.js`.** Su lista se
carga con `cache.addAll()`, que falla **entera** si un solo archivo no está: el
service worker no se instalaría y nadie se enteraría. Pasó al convertir los fondos.

Rendimiento:
- Los audios (1.8 MB) están bien como están.

## En el horizonte: tienda dinámica y cartas propias

Idea de Ulises, sin aterrizar todavía. Se anota con lo que ya se sabe del
proyecto, para que quien la retome no empiece de cero.

**1. La tienda deja de estar en el código.** Hoy el catálogo vive en DOS sitios:
`modulos/config.js` (para pintar) y `CATALOGO_ITEMS` del backend (para cobrar).
Están duplicados y hay que acordarse de tocar los dos. La idea es moverlo a
Firestore, como ya se hace con `juegos_hub` para el catálogo del Hub.

⚠️ **El precio tiene que seguir saliendo del servidor.** Que el catálogo esté en
Firestore no cambia la regla: el backend lo lee de ahí y cobra lo que diga; el
cliente solo pinta. Si en algún momento el precio vuelve a viajar en la
petición, se reabre el agujero que costó cerrar seis veces.

**2. Cartas generadas.** Vender packs de 4 tablas por 20 monedas, que el jugador
ve luego en un botón «Mis Cartas» de la pantalla de selección.

La herramienta está en `generador/index.html`, ya analizada. **No se publica**
(está en `.vercelignore`): busca sus imágenes en `./barajas/`, que ahí no
existe, y además es una herramienta para imprimir, no parte del juego.

### Lo que sirve del generador, y lo que no

De sus 560 líneas, **el algoritmo son unas 40**. El resto es interfaz para sacar
PDF y ZIP con jsPDF, html2canvas y JSZip — nada de eso hace falta aquí, y
además esas librerías vienen por CDN, que la CSP del proyecto bloquea.

Lo que interesa:

| Modo | Qué hace | Encaja con |
|---|---|---|
| `normal` | 16 barajas distintas en una rejilla 4×4 | Tradicional y Llena |
| `dobles` | una carta repetida en el centro (posiciones 5 y 6) | — (modo nuevo) |
| `esquinas` | solo 8 casillas, en los índices 0,3,5,6,9,10,12,15 | Pozo |

Usa las barajas 1–54 con ceros (`01.png`), igual que
`assets/imagenes/barajas/` de este proyecto: los datos son compatibles tal cual.

### Tres cosas que hay que arreglar al portarlo

**1. El barajado está sesgado.** Usa `sort(() => Math.random() - 0.5)`, que es un
error clásico: no da permutaciones uniformes. Medido con 10 cartas y 60.000
vueltas, la primera carta sale en primera posición un **90% más** de lo que
debería y la novena un **39% menos**. Para tablas que se imprimen da igual; para
tablas que se venden y deciden quién gana, no. Hay que usar Fisher-Yates con
`crypto.randomInt`, que el backend ya usa en otros sitios.

**2. La firma de deduplicación depende del orden.** Compara `numeros.join('-')`,
así que dos tablas con las MISMAS 16 cartas colocadas distinto se consideran
diferentes. Puede estar bien —la posición importa al marcar— pero conviene
decidirlo a propósito y no heredarlo sin querer.

**3. Una tabla deja de ser una imagen.** Es el cambio de fondo. Hoy una tabla es
un JPG entero (`cartas/01.jpg`) y el tablero pinta esa imagen. Una tabla generada
es una LISTA DE 16 NÚMEROS, y el tablero tendría que pintar una rejilla de 16
barajas. Son dos modelos distintos conviviendo, y eso toca `tablero.js`,
`validacion.js` y el `boardState` que viaja al anfitrión.

⚠️ **La generación tiene que ocurrir en el SERVIDOR.** Hoy la validación es
visual: el anfitrión mira y decide. Si las tablas las genera el cliente Y el
sistema pasa a validar solo, quien controle su navegador puede fabricarse una
tabla con las cartas que acaban de salir. Es el mismo patrón que costó cerrar
seis veces. El servidor genera, guarda por usuario en Firestore, y el cliente
solo pide y pinta.

**3. Y entonces se abre lo bueno.** Con las tablas como datos, el servidor sabe
qué lleva cada una y puede:

- **Validar una lotería sin que nadie mire.** Se acabó el anfitrión
  validándose a sí mismo, que es la parte más incómoda del juego.
- **Poner un bot.** Si el servidor elige tablas y las marca solo, se puede jugar
  sin sala llena — y Serpientes ya tiene modo contra CPU, así que el ecosistema
  ya sabe hacerlo.

Conviene hacerlo por partes: primero generar y guardar, después «Mis Cartas»,
y la validación automática al final. Cada paso se puede soltar por separado.

Infra:
- Render (plan free) duerme a los 15 min. Se mantiene despierto con UptimeRobot.
- El estado de las salas vive en RAM: un reinicio de Render tumba las partidas activas.

## Pruebas

```bash
npm test          # sobre la fuente — rápido, para desarrollar
npm run test:build # sobre el bundle empaquetado y ofuscado
```

**La segunda es la que importa.** Es el código que se publica, y dos de los peores
fallos del proyecto solo aparecían ahí: doce botones que el ofuscador renombró, y
el juego arrancando sin socket. En la fuente todo iba bien.

Abren un **Chrome de verdad** (el que ya tienes; no se descarga ninguno) y
comprueban lo que se ve y lo que se manda por la red. No hay pruebas unitarias a
propósito: los fallos que ha tenido este proyecto no se detectan leyendo funciones
sueltas.

| Archivo | Qué cubre |
|---|---|
| `humo.prueba.js` | Que arranque, que **se pique cada acción** y que haya handshake |
| `dinero.prueba.js` | Qué manda el cliente al comprar y transferir; validaciones que deben rebotar sin salir a la red |
| `escapado.prueba.js` | Que un nickname con HTML no ejecute código |
| `sesion.prueba.js` | Entrar desde el Hub, con la red lenta a propósito |

No hace falta backend: interponen `fetch` y el socket. Sí hace falta red para bajar
el guión de Socket.IO, que lo sirve Render.

**Si tocas el cliente, corre `npm run test:build` antes de empujar.**

⚠️ **Una prueba que nunca falla no prueba nada.** Cuando añadas una, rómpela a
propósito y comprueba que salta. Las de aquí se verificaron así: quitando el
escapado y dejando el socket sin conexión.

## Probar local

No hay build ni tests. Sirve la carpeta con cualquier server estático:

```bash
python3 -m http.server 8000   # luego abre http://localhost:8000
```

Apunta al backend de **producción** (URL hardcodeada arriba de `app.js`), así que
cuidado: los cambios locales tocan monedas y usuarios reales.
