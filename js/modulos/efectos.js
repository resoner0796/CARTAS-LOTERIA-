// ======================================================
// SOUNDBOARD EN PARTIDA
// ======================================================
// Los emojis que suenan para toda la sala. Solo salen los efectos que tienes
// comprados (los de precio 0 los tiene todo el mundo).
//
// Quién puede oírlos lo decide el SERVIDOR: el anfitrión puede silenciar a
// alguien y el servidor deja de repartir sus efectos. Aquí solo se piden.

import { catalogoSonidos } from './config.js';
import { socket } from './socket.js';
import { huboArrastre, mostrarNotificacionFlotante } from './animaciones.js';

/** Un efecto por segundo como mucho, para que no se convierta en ametralladora. */
const ESPERA_ENTRE_EFECTOS = 1000;
let enEspera = false;

/**
 * Abre o cierra el menú de emojis.
 *
 * No se abre si el gesto fue un arrastre: el mismo botón sirve para mover el
 * flotante de sitio, y sin esto se abría el menú cada vez que lo cambiabas de
 * esquina.
 */
export function toggleMenuSonidos(usuario, sala) {
    if (huboArrastre()) return;

    const menu = document.getElementById("menuSonidosDesplegable");
    if (!menu) return;

    menu.classList.toggle("mostrar");
    if (menu.classList.contains("mostrar")) renderizarSonidosJuego(usuario, sala);
}

/** Pinta una burbuja por cada efecto que la persona puede usar. */
export function renderizarSonidosJuego(usuario, sala) {
    const contenedor = document.getElementById("menuSonidosDesplegable");
    if (!contenedor) return;

    contenedor.innerHTML = "";
    if (!usuario) return;

    const inventario = usuario.inventario || [];
    const mios = catalogoSonidos.filter(item => inventario.includes(item.id) || item.precio === 0);

    if (mios.length === 0) {
        contenedor.innerHTML = "<span style='font-size:0.7rem; color:white;'>Sin sonidos</span>";
        return;
    }

    mios.forEach(sonido => {
        const btn = document.createElement("button");
        btn.className = "btn-emoji-sonido";
        btn.innerHTML = sonido.emoji;
        btn.onclick = () => enviarEfectoSonido(sonido.id, sala, usuario.nickname);
        contenedor.appendChild(btn);
    });
}

/** Pide al servidor que suene un efecto en la sala. */
export function enviarEfectoSonido(soundId, sala, nickname) {
    if (enEspera) return;
    enEspera = true;
    setTimeout(() => { enEspera = false; }, ESPERA_ENTRE_EFECTOS);

    socket.emit("enviar-efecto-sonido", { sala, soundId, emisor: nickname });
}

/**
 * Alguien de la sala pulsó un emoji.
 *
 * Solo se reproducen efectos del catálogo: el id llega por la red y se busca en
 * la lista, así que nunca se construye una ruta de audio con lo que mande otro.
 */
socket.on("reproducir-efecto-sonido", ({ soundId, emisor }) => {
    const sonido = catalogoSonidos.find(s => s.id === soundId);
    if (!sonido) return;

    const audio = new Audio(sonido.file);
    audio.volume = 0.8;
    audio.play().catch(e => console.log("Error playing effect:", e));

    mostrarNotificacionFlotante(`${emisor}: ${sonido.emoji}`);
});
