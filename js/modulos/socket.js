// ======================================================
// CONEXIÓN CON EL SERVIDOR
// ======================================================
// El socket es un singleton legítimo: es UNA conexión, no estado de la partida.
// Por eso este módulo se importa en vez de pasarse por argumento, al revés que
// el usuario o la sala.
//
// Todo el tiempo real del juego pasa por aquí: salas, cartas cantadas, apuestas
// y validación de ganadores.

import { SERVIDOR } from './config.js';
import { obtenerToken } from './sesion.js';
import { mostrarAlerta } from './ui.js';

/**
 * Objeto mínimo que no hace nada, para cuando no hay Socket.IO.
 *
 * El guión de Socket.IO lo sirve el BACKEND. Si Render está caído, el script no
 * llega, `io` no existe y la excepción se llevaba por delante todo app.js: la
 * página se quedaba congelada en el splash sin ninguna explicación. Es preferible
 * cargar la app y avisar.
 *
 * ⚠️ Esto solo cubre que el servidor esté caído. Si `io` falta por un problema de
 * ORDEN —el módulo ejecutándose antes que el `<script>` de Socket.IO— la app
 * arranca aquí en silencio y parece funcionar mientras el juego está muerto. Por
 * eso las dos etiquetas `<script>` externas de index.html llevan `defer`: para
 * compartir cola con el módulo y ejecutarse antes. No se lo quites.
 */
function socketAusente() {
    console.error("No se pudo cargar Socket.IO: el servidor no responde.");
    setTimeout(() => {
        mostrarAlerta(
            "No pudimos conectar con el servidor del juego. Revisa tu conexión y vuelve a entrar.",
            "Sin conexión"
        );
    }, 1500);

    return {
        on() {}, once() {}, emit() {},
        disconnect() { return this; }, connect() { return this; },
        connected: false, id: null
    };
}

/**
 * La conexión.
 *
 * El token va en el handshake, y `auth` es una FUNCIÓN a propósito: así se
 * reevalúa en cada reconexión y en cuanto inicias sesión el socket ya viaja
 * identificado, sin tener que recrearlo.
 *
 * ⚠️ Se lee `window.io` y NO `io` a secas. `io` la pone un script externo, pero
 * escrita como identificador suelto el ofuscador la trata como un global más del
 * bundle y a veces la reescribe: medido, ocurría en 4 de cada 10 builds. Como el
 * nombre del archivo publicado no cambia y el fallo depende del azar de cada
 * despliegue, el resultado era una ruleta — unos builds con socket y otros sin
 * él, sin nada en el código que lo explicara. Un acceso a propiedad no se
 * renombra nunca.
 */
const io = typeof window !== "undefined" ? window.io : undefined;

export const socket = (typeof io === "function")
    ? io(SERVIDOR, { auth: (cb) => cb({ token: obtenerToken() }) })
    : socketAusente();

/** ¿Hay conexión de verdad? Útil antes de dar por hecho que algo llegó. */
export function hayConexion() {
    return !!socket.connected;
}
