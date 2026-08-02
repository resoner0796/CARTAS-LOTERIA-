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
js/modulos/           20 módulos. La tabla de qué hace cada uno está más abajo
scripts/obfuscate.js  Empaqueta y ofusca en el build de Vercel — ver abajo
vercel.json           buildCommand + outputDirectory
service-worker.js     Estrategias de caché (PWA)
manifest.json         Íconos apuntan a rutas rotas
assets/imagenes/      ~10 MB. Ver "Assets" antes de añadir imágenes
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
después de cada movimiento; de 2.030 líneas en un archivo a **20 módulos**.

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
| `tablero.js` | Elegir cartas, la mesa, las fichas, las barajas cantadas |
| `validacion.js` | Gritar lotería y el veredicto del anfitrión |
| `favoritos.js` | El set de tablas preferido |
| `tienda.js` | Recarga con tarjeta y compra de artículos |
| `monedero.js` | Transferencias e historial |
| `admin.js` | Panel de administración |
| `efectos.js` | Soundboard: sonidos que dispara **la gente** |
| `audio.js` | Sonidos que dispara **el juego** |
| `animaciones.js` | Gestos y decoración. Puro DOM |
| `monedas.js` | Las torres del bote y del pozo: una moneda por peso |
| `tablasPropias.js` | Cartas compradas: comprarlas al azar o armarlas a mano, «Mis Cartas», y `pintarTabla()`/`tablaPorId()`, que usan también las del sistema |
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

| Modo | Costo por carta | Cartas | Conjunto | Cómo se gana |
|---|---|---|---|---|
| `tradicional` | 1 | 60 | `normal` (16 casillas) | cualquier figura |
| `llena` | 2 | 60 | `normal` (16 casillas) | las 16 casillas |
| `pozo` | 2 | 20 | `esquinas` (8 casillas) | las 8 casillas |
| `doble` | 2 | 60 | `dobles` (15 barajas en 16) | cualquier figura |

⚠️ **No confundir los dos conjuntos**, es la trampa más fácil de este proyecto:
- **Carta** = lo que elige el jugador, la rejilla de 4×4. Ya **no es una imagen**:
  es una lista de 16 números que manda el servidor. Además cada quien puede
  comprar las suyas.
- **Baraja** = cada una de las que se cantan. `assets/imagenes/barajas/`, hay
  **54** (`01`–`54`), con una voz por cada una en `assets/audios/NN.mp3`.

Esos son los nombres que se usan **en la interfaz**, porque son los que usa la
gente que juega. En el código hay sitios donde «tabla» significa lo mismo que
«carta» —quedó de antes— pero lo que ve el jugador dice siempre carta y baraja.

La baraja que se canta siempre es de 54, sin importar el modo.

## Flujo de una partida

1. `unirse-sala` → el server responde `rol-asignado` (host = quien creó la sala) e
   `info-sala`, que trae las cartas del modo con sus barajas.
2. El jugador elige hasta 4 cartas → `seleccionar-carta` / `deseleccionar-carta`.
   El server difunde `cartas-desactivadas` para que nadie repita carta.
3. `apostar` → cobra `costoCarta × nº de cartas`, alimenta el bote.
4. El host lanza `iniciar-juego` con una velocidad → el server empieza a emitir
   `carta-cantada` cada N ms.
5. Alguien grita `loteria` mandando **qué casillas tapó** → el **servidor**
   decide (`victoria.js`):
   - si no hay figura → `loteria-rechazada` **solo a quien gritó**, y la partida
     sigue cantando;
   - si la hay → pausa de 4 s para recoger empates → `cerrarRonda()` reparte el
     bote con `ganadores-multiples`.
6. Al reconectar (F5), `reconectar` manda `info-sala` y luego restaura cartas,
   apuesta y rol vía `estado-sala-restaurado`. **El orden importa**: sin las
   cartas, el cliente no sabe pintar nada.

## El servidor decide quién ganó

Esto es lo que desbloqueó pasar las cartas a datos, y es el cambio más grande del
proyecto. La lógica está en `victoria.js` del backend.

**Las veinte figuras.** Cuatro horizontales, cuatro verticales, dos diagonales,
las cuatro esquinas y los nueve cuadros de 2×2. Se **generan** en vez de
escribirse a mano: una lista de veinte cuartetos copiada a mano es justo donde se
cuela un número mal, y eso no daría ningún error — daría una figura que no existe
o dejaría fuera una legítima, y el fallo solo aparecería el día que alguien la
complete.

**Qué manda el cliente.** `boardState.marcadas` = `{ cartaId: [índices] }`, los
números de casilla que se taparon. Va aparte de `chips`, que lleva la posición en
porcentaje: el porcentaje sirve para volver a dibujar la ficha donde estaba, pero
NO dice en qué casilla cayó — la rejilla tiene margen y separación, así que
deducirlo sería aproximar justo el dato que decide el bote.

⚠️ **Qué es de fiar y qué no.** Lo que decide el dinero es que las barajas estén
CANTADAS, y eso lo sabe el servidor: el historial es suyo y las barajas de la
carta también. Las fichas las manda el navegador y podrían falsearse, pero mentir
ahí solo saltaría el requisito de haber estado atento — nunca daría por buena una
carta cuyas barajas no hayan salido. Si alguna vez se quita ese requisito, no se
pierde seguridad; si se invierte —fiarse de las fichas y no del historial— se
pierde todo.

**Un grito en falso ya no para la partida.** Antes bastaba con picar LOTERÍA de
broma para congelar a toda la sala hasta que el anfitrión resolviera. Hoy se le
contesta a quien gritó y el juego sigue cantando.

**Lo que se retiró.** Los eventos `iniciar-validacion-secuencial`,
`continuar-validacion` y `veredicto-host`, y el modal donde el anfitrión juzgaba.
El pago salió de dentro de `veredicto-host` a una función `cerrarRonda()`: antes
corría cada vez que el anfitrión juzgaba a alguien y pagaba al juzgar al último,
y ahora se llama una sola vez, al cerrar la ventana de empates.

`victoria.js` tiene **55 pruebas propias**, y aquí sí son unitarias al revés que
en el cliente: es lógica pura, determinista, y un fallo no se ve en pantalla —
se ve en el saldo de alguien.

## Bots

Un bot es un jugador más de `salaInfo.jugadores`, con las mismas propiedades, para
que todo lo que ya recorre esa lista lo trate igual sin saber que es un bot.

Vive entero en el backend (`bots.js`). El cliente solo lo pinta distinto en la
lista y le enseña al anfitrión los botones para añadirlo o sacarlo.

- **Tres niveles**: `distraido` (55% de atención), `normal` (85%), `experto`
  (97%), cada uno con su retardo al tapar y al gritar. El distraído no es un bot
  roto: una sala donde todos juegan perfecto es una sala donde no ganas nunca.
- **Grita por el mismo camino que una persona** (`procesarLoteria`). No tiene su
  propia comprobación a propósito — si la tuviera, podría ganar con otras reglas.
- **Avisa en CADA ficha**, no cuando cree tener figura: el bot no sabe si la
  tiene. Lo decide el servidor, y si no, no pasa nada.
- **Su dinero es de la banca.** Sin email, no se escribe nada en Firestore. Su
  apuesta engorda el bote y se apunta con `registrarEmisionBanca`; si gana, el
  premio vuelve a la banca en negativo.

⚠️ **Esto emite monedas.** Si gana una persona se lleva también lo que pusieron
los bots, y esas son nuevas. Es una decisión de producto tomada a propósito, pero
se vigila en `finanzas/general.monedasEmitidasBanca`.

⚠️ **Los relojes hay que pararlos.** Un bot guarda sus `setTimeout` en
`bot.relojes` porque si no, al quitarlo o al cerrar la sala seguirían disparando
sobre un objeto que ya no existe. Se paran al quitar el bot, al cerrar la ronda y
al cerrar la sala.

⚠️ **Una sala donde solo quedan bots se cierra**, y el anfitrión nuevo siempre es
una persona: un bot no puede iniciar la partida, y la sala se quedaría congelada
esperando a que hiciera algo.

## Las cartas son datos, no imágenes

Este fue el cambio de fondo. Antes una carta era un JPG (`cartas/01.jpg`) y el
tablero pintaba esa imagen; hoy una carta es una **lista de 16 números** y el
cliente pinta una rejilla de barajas. Se llevó por delante 45 MB de assets —el
85% de las imágenes— y abre la puerta a que el servidor valide una lotería sin
que el anfitrión mire, porque ahora sabe exactamente qué lleva cada carta.

**De dónde salen.** `scripts/generar-cartas-sistema.js` en el backend escribe
`cartas-sistema.json`, que está commiteado. Se ejecuta **a mano**: si se
generaran al arrancar, cada reinicio de Render repartiría cartas distintas a
media partida.

El script persigue dos cosas que tiran en direcciones contrarias:

```
EQUILIBRIO   cada baraja aparece las mismas veces en el conjunto, para que
             ninguna carta vaya con ventaja partida tras partida
SEPARACIÓN   dos cartas comparten lo menos posible, para que no se llenen a la
             vez y haya que partir el bote
```

Lo que salió, medido:

| Conjunto | Equilibrio | Comparten como mucho | De media | Barajando sin más |
|---|---|---|---|---|
| `normal` (60×16) | 17 o 18 veces, diferencia 1 | 7 | 4.55 | 4.74, y el máximo llega a 11 |
| `esquinas` (20×8) | 2 o 3 veces, diferencia 1 | 1 | 0.83 | 1.19 |
| `dobles` (60×15) | 16 o 17 veces, diferencia 1 | 6 | 3.99 | 4.17 |

En `dobles` una carta lleva **15 barajas en 16 casillas**: la primera ocupa las
dos del centro. Por eso los huecos del generador son una lista de LISTAS —cada
elemento son las casillas que ocupa una misma baraja— y el equilibrio se calcula
sobre las barajas, no sobre las casillas.

⚠️ **La media no se puede bajar.** Con reparto parejo sale fijada por la
aritmética: 960 casillas entre 54 barajas hacen que cada una aparezca en ~17,8
cartas, y eso determina cuántas parejas la comparten. Lo que el afinado mejora
es el MÁXIMO. Si alguien vuelve con «se puede optimizar más», ese es el techo.

**Cómo llegan al cliente.** En `info-sala`, con sus barajas dentro. El cliente
no decide ni cuántas hay ni qué llevan. Que las conozca no es un problema: son
públicas e iguales para todos, y quien gana se decide con las del servidor.

**`tablaPorId()` es el único sitio que resuelve un id a sus barajas**, y da igual
si es del sistema o comprada. Por eso la mesa, la validación y la prueba de
victoria no tienen que saber de dónde salió la carta: antes había dos ramas en
cada uno de esos sitios, una para el JPG y otra para la rejilla.

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
- **Una carta propia también hay que avisarla al servidor.** Al añadirlas se
  pensó que no hacía falta, porque no se apartan para nadie: son de una sola
  persona. Pero el servidor cuenta `jugador.cartas` para saber cuánto cobrar en
  la apuesta, y ese array se llena justo con ese aviso. Sin él veía cero cartas
  y salía **en silencio**, sin cobrar, sin sumar al bote y sin dejar rastro en la
  consola. Lo que cambia con las propias no es si se avisan, sino si se
  DIFUNDEN: las 53 se apartan para que nadie repita, y las propias no.
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
- **Al reconectar no llegaba `info-sala`.** El handler de `reconectar` mandaba
  `estado-sala-restaurado` con los ids de las cartas, y con eso bastaba mientras
  una carta fuera un JPG: el nombre servía para pedirla. En cuanto las cartas
  pasaron a ser datos, recargar la página dejaba la mesa **vacía** —el cliente
  tenía los ids pero no las barajas—. Eso destapó un fallo que ya estaba ahí:
  `partida.modo` también volvía a su valor por defecto, así que recargar en una
  sala de Pozo pintaba las cartas del set que no era. Ahora `reconectar` emite
  `info-sala` ANTES del tablero, y el orden importa.
- **Al equilibrar cartas, no se pueden mover las barajas COMPARTIDAS.** El
  generador afina la separación intercambiando barajas entre dos cartas. La
  primera versión movía las que estaban en las dos, así que le metía a una carta
  algo que ya tenía: salieron once cartas duplicadas y solapes de media 0,11,
  que es imposible con 16 de 54. La medida bajaba **a costa de romper las
  cartas**. Solo se mueven las exclusivas de cada una, y el script se niega a
  escribir el archivo si al final hay barajas repetidas dentro de una carta,
  cartas duplicadas o desequilibrio mayor que 1.
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

⚠️ **`marcarFicha()` es ahora parte del camino del dinero.** Antes solo pintaba;
hoy el `dataset.casilla` que le pone a cada ficha es lo que viaja al servidor
para validar la victoria. Si se toca esa función, la prueba que hay que mirar es
la de `cartas.prueba.js` que comprueba el `boardState` emitido.

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

Pasaron de ~101 MB a ~10 MB, en dos tandas. La segunda fue quitar las cartas: al
volverse datos, sus 45 MB de JPG dejaron de servir para nada. Lo que se hizo con
el resto, por si añades imágenes nuevas:

- **Se midió a qué tamaño se ven de verdad, en el navegador.** Sin eso se
  redimensiona a ojo. Los datos: una tabla se ve a 393px como mucho, una baraja
  del historial a 82px, y una ficha a 60px.
- **Las tablas se recomprimieron y al final se borraron.** Se les quitó peso
  primero (de 52 a 44 MB, sin tocar un píxel: estaban guardadas casi sin
  comprimir) y luego desaparecieron enteras al pasar las cartas a datos. Queda
  como aviso de que optimizar algo no es lo mismo que preguntarse si hace falta.
- **Una carta se pinta ahora con 16 barajas**, y la pantalla de selección tiene
  60: son 960 `<img>` de golpe. Solo son 54 archivos distintos —el navegador los
  reutiliza— pero decodificarlos todos a la vez atasca el móvil, así que ahí van
  con `loading="lazy"`. En la mesa NO, que son cuatro y tienen que estar.
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

## En el horizonte

**1. La tienda deja de estar en el código.** Hoy el catálogo vive en DOS sitios:
`modulos/config.js` (para pintar) y `CATALOGO_ITEMS` del backend (para cobrar).
Están duplicados y hay que acordarse de tocar los dos. La idea es moverlo a
Firestore, como ya se hace con `juegos_hub` para el catálogo del Hub.

⚠️ **El precio tiene que seguir saliendo del servidor.** Que el catálogo esté en
Firestore no cambia la regla: el backend lo lee de ahí y cobra lo que diga; el
cliente solo pinta. Si en algún momento el precio vuelve a viajar en la
petición, se reabre el agujero que costó cerrar seis veces.

**2. Un bot.** Si el servidor elige cartas y las marca solo, se puede jugar sin
sala llena — y Serpientes ya tiene modo contra CPU, así que el ecosistema ya
sabe hacerlo. Ahora que el servidor sabe validar, sabe también cuándo el bot
tendría lotería: es la misma función.

**3. Modos que ahora salen casi gratis.** Con las figuras como datos, añadir una
variante es tocar `CONDICION_POR_MODO` y poco más:
- **figura anunciada** — cada partida se juega a una sola figura, dicha antes de
  empezar. Cambia el juego entero y es un campo en la sala.
- **contrarreloj** — quien complete una figura en menos barajas cantadas.
- **torneo por rondas** — el servidor ya lleva la cuenta de rachas.

**4. Avisar de que te falta una.** El servidor ya calcula a qué figura estás más
cerca, para el mensaje de rechazo. Ese mismo dato serviría para un aviso en
pantalla — pero cuidado: quita tensión al juego y conviene que sea opcional.

### El generador original

Está en `generador/index.html` y **no se publica** (`.vercelignore`): busca sus
imágenes en `./barajas/`, que ahí no existe, y es una herramienta para imprimir.
Se conserva como referencia. Su algoritmo —unas 40 de sus 560 líneas— es lo que
se portó a `generador.js` del backend; el resto era interfaz para sacar PDF y ZIP
con librerías de CDN que la CSP bloquea.

Al portarlo se corrigió que **el barajado estaba sesgado**: usaba
`sort(() => Math.random() - 0.5)`, que no da permutaciones uniformes. Medido con
10 cartas y 60.000 vueltas, la primera salía en primera posición un **90% más**
de lo que le tocaba. Para cartas que se imprimen da igual; para cartas que se
venden y deciden quién gana, no. Hoy es Fisher-Yates con `crypto.randomInt`, y
hay una prueba que mide la distribución.

También se cambió la firma de deduplicación **a propósito**: el original
comparaba el orden, así que dos cartas con las mismas 16 barajas colocadas
distinto contaban como diferentes. Se llenan a la vez y ganarían siempre juntas,
así que venderlas como distintas sería engañoso; ahora la firma va ordenada.

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
| `cartas.prueba.js` | Que las cartas del servidor se pinten como rejilla, que el aviso de baraja cantada se encienda y se apague al taparla, que las casillas tapadas viajen al gritar, que los bots se vean solo para el anfitrión, y que no quede ni una petición a los JPG borrados |

No hace falta backend: interponen `fetch` y el socket. Sí hace falta red para bajar
el guión de Socket.IO, que lo sirve Render.

Para simular lo que **llega** del servidor, `cartas.prueba.js` pone un setter en
`window.io` con `evaluateOnNewDocument` y envuelve `Socket.prototype.on` en el
instante en que el guión de Socket.IO se asigna ahí. Es la única manera de
quedarse con la instancia: socket.io-client v4 no expone sus conexiones por
ningún sitio —`io.managers` es de la v2— y cuando la página termina de cargar ya
no hay forma de llegar a ella.

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
