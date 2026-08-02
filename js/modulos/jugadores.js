// ======================================================
// LA GENTE DE LA SALA
// ======================================================
// La lista de jugadores y el silencio que puede imponer el anfitrión.
//
// La lista se pinta en DOS sitios —la sala de espera y la partida— con el mismo
// marcado, así que se genera una vez y se mete en los dos.

import { socket } from './socket.js';
import { sesion, partida } from './estado.js';
import { guardarUsuario } from './sesion.js';
import { mostrarAlerta } from './ui.js';
import { escaparHtml, actualizarValor } from './utiles.js';
import { pintarSaldo } from './monedas.js';

const $ = id => document.getElementById(id);

/**
 * Corta o devuelve los sonidos de alguien. Solo el anfitrión.
 *
 * Quien de verdad decide es el SERVIDOR: al silenciar a alguien deja de repartir
 * sus efectos a la sala. Esto solo lo pide; comprobarlo aquí no serviría de nada
 * porque el cliente se puede modificar.
 */
export function alternarSilencio(email) {
    if (!partida.soyHost) return;
    const callado = partida.silenciados.includes(email);
    socket.emit("silenciar-jugador", { sala: partida.sala, email, silenciar: !callado });
}

/** Una fila de la lista: corona del anfitrión, racha, apuesta y botón de silencio. */
function filaJugador(j) {
    const apostado = j.apostado ? "💸" : "";
    const corona = j.host ? "👑" : "";

    let racha = "";
    if (j.racha > 0) {
        racha = "🔥";
        if (j.racha > 1) racha += `<small style="color:orange; font-weight:bold;">x${j.racha}</small>`;
    }

    // El botón de silencio solo lo ve el anfitrión, y nunca sobre sí mismo.
    let botonSilencio = "";
    if (partida.soyHost && j.email && j.email !== sesion.usuario?.email) {
        const callado = partida.silenciados.includes(j.email);
        botonSilencio = `<button class="btn-mute ${callado ? 'callado' : ''}"
                        data-accion="silenciar" data-email="${escaparHtml(j.email)}"
                        title="${callado ? 'Devolverle los sonidos' : 'Silenciar sus sonidos'}"
                        >${callado ? '🔇' : '🔊'}</button>`;
    }

    // A quien no es anfitrión se le enseña el icono, pero sin botón.
    const iconoCallado = (!partida.soyHost && partida.silenciados.includes(j.email)) ? ' 🔇' : '';

    // El nickname lo escribe una persona: va escapado siempre.
    return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <span>${corona} ${escaparHtml(j.nickname)} ${racha}${iconoCallado}</span>
            <span style="display:flex; align-items:center; gap:6px;">${apostado}${botonSilencio}</span>
        </div>`;
}

/**
 * Repinta la lista en la sala y en la partida.
 *
 * `alCambiarSaldo` lo pone app.js: es lo que refresca el menú cuando el servidor
 * dice que nuestro saldo cambió.
 */
export function iniciarJugadores(alCambiarSaldo) {
    socket.on("jugadores-actualizados", jugadores => {
        partida.jugadores = jugadores;

        // Entre todos viene el nuestro, y es la cifra buena: la del servidor.
        const mios = Object.values(jugadores).find(j => j.email === sesion.usuario?.email);
        if (mios && sesion.usuario) {
            actualizarValor($("monedas-valor"), mios.monedas);
            // Las monedas del saldo, una por peso: es la cifra del servidor, así
            // que aquí es donde la cuadrícula queda con lo que de verdad hay.
            pintarSaldo($("saldoMonedas"), mios.monedas);
            partida.haApostado = mios.apostado;
            sesion.usuario.monedas = mios.monedas;
            guardarUsuario(sesion.usuario);
            alCambiarSaldo();
        }

        const btnApostar = $("btnApostar");
        if (btnApostar) btnApostar.disabled = partida.haApostado;

        const html = "<h3>Jugadores en sala:</h3>" +
            Object.values(jugadores).map(filaJugador).join("");

        const enSala = $("jugadoresLista");
        const enJuego = $("jugadoresListaIngame");
        if (enSala) enSala.innerHTML = html;
        if (enJuego) enJuego.innerHTML = html;
    });
}

socket.on("silenciados-actualizados", (lista) => {
    partida.silenciados = Array.isArray(lista) ? lista : [];
});

socket.on("estas-silenciado", () => {
    mostrarAlerta("El anfitrión silenció tus efectos de sonido en esta sala.", "Sin sonidos 🔇");
});
