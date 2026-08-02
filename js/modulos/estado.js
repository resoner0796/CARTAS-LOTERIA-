// ======================================================
// ESTADO COMPARTIDO
// ======================================================
// Lo que varios módulos necesitan mirar y cambiar mientras se juega.
//
// Son OBJETOS exportados, no variables sueltas, y eso es la clave: si se
// exportara `let sala = ""`, cada módulo se llevaría una copia del valor en el
// momento de importar y no vería los cambios de los demás. Con un objeto, todos
// miran el mismo sitio.
//
// Se eligió esto antes que getters/setters por variable o un store con eventos.
// Para el tamaño de este juego, un objeto compartido tiene menos piezas móviles
// que cualquiera de las otras dos, y no hay ninguna necesidad de reaccionar a
// los cambios: quien pinta ya se entera por los eventos del socket.
//
// ⚠️ Aquí va SOLO lo que de verdad comparten varios módulos. Si algo lo usa un
// único archivo, déjalo en ese archivo: este objeto es el sitio fácil donde
// acaba amontonándose todo si nadie lo cuida.

/**
 * Quién eres. Se llena al iniciar sesión y se refresca con cada
 * 'usuario-actualizado' que manda el servidor.
 */
export const sesion = {
    /** Perfil: {email, nickname, monedas, inventario, ...}. null si no hay sesión. */
    usuario: null,

    /**
     * Marca que venimos del Hub con un token en la URL.
     *
     * Se pone ANTES de que window.onload pueda ejecutarse. Sin esto había una
     * carrera: el arranque miraba el localStorage y, como el perfil todavía no
     * había llegado del servidor, daba la sesión por inexistente y sacaba a la
     * persona a la pantalla de login recién entrada desde el Hub.
     */
    entrandoDesdeHub: false
};

/** Todo lo de la partida en curso. */
export const partida = {
    /** Nombre de la sala. Cadena vacía = no estamos en ninguna. */
    sala: "",
    /** El anfitrión es quien la creó: canta las cartas y valida a los ganadores. */
    soyHost: false,
    /** Nuestro id de socket en esta conexión. */
    miId: undefined,
    /** Tablas elegidas, hasta 4, en el orden en que se eligieron. */
    seleccionadas: [],
    /** Jugadores de la sala, por id. */
    jugadores: {},
    /** Cartas ya cantadas, para el historial y para validar. */
    historialIds: [],
    /** 'tradicional' | 'llena' | 'pozo'. Lo manda el servidor en info-sala. */
    modo: 'tradicional',
    /** Lo que cuesta cada tabla en este modo. */
    costoCarta: 1,
    /**
     * Las cartas que ofrece el sistema en este modo, con sus barajas.
     *
     * Llegan en `info-sala`, generadas y equilibradas por el servidor. Cada una
     * es `{ id, cartas: [16 números o null] }`, no una imagen: aquí se pintan
     * como una rejilla de barajas.
     *
     * ⚠️ Cada modo trae las suyas y no son intercambiables — el Pozo usa cartas
     * de ocho casillas. La lista se reemplaza entera al entrar en una sala.
     */
    cartasSistema: [],
    /** Si ya se pagó la apuesta de esta ronda. */
    haApostado: false,
    /** Bote aparte del modo Pozo, que persiste entre partidas. */
    pozo: 0,
    /** Emails a los que el anfitrión cortó los efectos de sonido. */
    silenciados: [],
    /** Id del jugador que está reclamando lotería, mientras se valida. */
    ganadorTemp: ""
};

// Nota sobre limpiar esto: `resetearUI()` de app.js NO devuelve la partida
// entera a cero, solo lo que se ve (tablas elegidas, apuesta, pozo, silenciados).
// El resto —sala, modo, costo, ruta de las tablas— lo sobrescribe el servidor con
// `info-sala` en cuanto entras a la siguiente. Es el comportamiento de siempre; si
// algún día hace falta un reinicio completo, reasigna las propiedades una a una en
// vez de sustituir el objeto: los demás módulos ya tienen guardada ESTA referencia
// y cambiarla los dejaría mirando el estado viejo para siempre.
