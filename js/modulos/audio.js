// ======================================================
// SONIDOS DEL JUEGO
// ======================================================
// Los efectos que acompañan la partida: barajear, la campana, el "corre",
// los aplausos del ganador y el kachín de la apuesta.
//
// No confundir con `efectos.js`, que es el soundboard: aquellos los dispara la
// gente y viajan por el socket; estos los dispara el propio juego.
//
// Los <audio> viven en index.html porque el navegador los precarga y así el
// primer sonido no llega tarde. Aquí solo se buscan cuando hacen falta: al
// importar, la página puede no estar parseada todavía.

const cache = {};

function elemento(id) {
    if (!(id in cache)) cache[id] = document.getElementById(id);
    return cache[id];
}

/** Suena desde el principio, aunque ya estuviera sonando. */
function reproducir(id, volumen) {
    const audio = elemento(id);
    if (!audio) return;
    audio.currentTime = 0;
    if (volumen !== undefined) audio.volume = volumen;
    // Los navegadores rechazan reproducir hasta que la persona toca la página.
    // No es un error que merezca ruido en consola.
    audio.play().catch(() => {});
}

export const sonidos = {
    barajear:  () => reproducir("audioBarajear"),
    campana:   () => reproducir("audioCampana"),
    corre:     () => reproducir("audioCorre"),
    aplausos:  () => reproducir("audioAplausos"),

    /** Para el "corre", que es el único que suena en bucle mientras se juega. */
    pararCorre() {
        const a = elemento("audioCorre");
        if (a) a.pause();
    },

    /** Silencia todo lo del juego. Al gritar lotería, para que se oiga el grito. */
    pararTodo() {
        ["audioCorre", "audioCampana", "audioBarajear"].forEach(id => {
            const a = elemento(id);
            if (a) a.pause();
        });
    }
};

/**
 * El kachín de la apuesta no está en el HTML: es un sonido suelto.
 *
 * Se crea la primera vez que suena, no al importar el módulo: así el archivo no
 * se descarga en una sesión donde nadie apueste, y de paso el módulo se puede
 * cargar donde no exista `Audio`.
 */
let kachin = null;

export function sonarApuesta() {
    if (!kachin) kachin = new Audio("assets/audios/kachin.mp3");
    kachin.currentTime = 0;
    kachin.volume = 0.6;
    kachin.play().catch(e => console.log("Audio play error:", e));
    if (navigator.vibrate) navigator.vibrate(50);
}
