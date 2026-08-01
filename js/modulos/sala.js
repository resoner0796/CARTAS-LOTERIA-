// ======================================================
// SALAS
// ======================================================
// Crear una sala, entrar a otra, invitar y salir.
//
// Quién es el anfitrión, cuánto cuesta cada tabla y qué modo se juega lo decide
// el SERVIDOR y llega por el evento `info-sala`. Aquí solo se pide entrar.

import { socket } from './socket.js';
import { sesion, partida } from './estado.js';
import { mostrarAlerta, mostrarConfirmacion, cambiarPantalla, pantalla } from './ui.js';

const RUTA_FONDOS = "assets/imagenes/ui/";

/** Salas con decorado propio. El resto usa el fondo por defecto. */
const FONDOS = {
    Familia: { seleccion: "fondo-seleccion-familia.PNG", juego: "fondo-juego-familia.PNG" },
    Oficina: { seleccion: "fondo-seleccion-oficina.PNG", juego: "fondo-juego-oficina.PNG" },
    Amigos:  { seleccion: "fondo-seleccion-amigos.PNG",  juego: "fondo-juego-amigos.PNG" }
};
const FONDO_POR_DEFECTO = { seleccion: "fondo-seleccion.PNG", juego: "fondo-juego.PNG" };

/**
 * Comparte el enlace de invitación a la sala.
 *
 * Hay dos caminos porque la Lotería puede estar corriendo **dentro de un iframe
 * del Hub**. Ahí `navigator.share` no sirve —el gesto pertenece a la ventana de
 * arriba—, así que se le pide al Hub que comparta él. Si estamos en la página
 * suelta, se comparte en directo, y si el navegador no sabe compartir, al menos
 * se copia el enlace.
 */
export function compartirSala() {
    if (!partida.sala) return mostrarAlerta("Primero debes entrar a una sala.", "Error");

    const urlBase = window.location.origin + window.location.pathname;
    const enlace = `${urlBase}?sala=${encodeURIComponent(partida.sala)}`;

    const datos = {
        title: '¡Juguemos Lotería! 🎰',
        text: `Únete a mi sala "${partida.sala}" en Juegos en la Nube. ¡Entra ya!`,
        url: enlace
    };

    if (window.self !== window.top) {
        console.log("📡 Enviando señal al HUB para compartir...");
        window.parent.postMessage({ action: 'COMPARTIR_NATIVO', datos }, '*');
        return;
    }

    if (navigator.share) {
        navigator.share(datos).catch(console.error);
    } else {
        navigator.clipboard.writeText(enlace)
            .then(() => mostrarAlerta("Link copiado 📋", "Listo"));
    }
}

export function crearSalaPropia() {
    const nombre = document.getElementById("inputCrearSala").value.trim();
    const selector = document.getElementById("inputModoJuego");
    const modo = selector ? selector.value : "clasico";

    if (!nombre) return mostrarAlerta("Ponle nombre a tu sala");
    unirseSalaDirecto(nombre, modo);
}

export function unirseSalaExistente() {
    const nombre = document.getElementById("inputUnirseSala").value.trim();
    if (!nombre) return mostrarAlerta("Escribe el nombre de la sala");
    // Sin modo: la sala ya existe y el suyo manda.
    unirseSalaDirecto(nombre, null);
}

/** Entra a una sala por su nombre. `modo` solo cuenta si la sala es nueva. */
export function unirseSalaDirecto(nombreSala, modo) {
    if (!sesion.usuario) return mostrarAlerta("Inicia sesión para entrar a una sala.", "Sin sesión");

    partida.sala = nombreSala;

    const fondo = FONDOS[nombreSala] || FONDO_POR_DEFECTO;
    aplicarFondo(pantalla('seleccion'), RUTA_FONDOS + fondo.seleccion);
    aplicarFondo(pantalla('juego'), RUTA_FONDOS + fondo.juego);

    socket.emit("unirse-sala", {
        nickname: sesion.usuario.nickname,
        email: sesion.usuario.email,
        sala: partida.sala,
        modo
    });

    const titulo = document.getElementById("tituloSalaActual");
    if (titulo) titulo.textContent = `Sala: ${partida.sala}`;
    cambiarPantalla("sala");
}

export function aplicarFondo(elemento, imagen) {
    if (!elemento) return;
    elemento.style.backgroundImage = `url("${imagen}")`;
    elemento.style.backgroundSize = 'cover';
    elemento.style.backgroundPosition = 'center';
}

/**
 * Sale de la sala, avisando al servidor.
 *
 * `limpiarTablero` llega como argumento porque lo que hay que borrar son
 * elementos del juego, y este módulo no sabe de tableros.
 */
export function salirDeSalaEnJuego(limpiarTablero) {
    mostrarConfirmacion("¿Seguro que quieres salir de la sala?", () => {
        socket.emit("salir-sala", partida.sala);
        limpiarTablero();
        cambiarPantalla("menu");
    });
}
