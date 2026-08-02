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

/** Cómo se presenta cada nivel de bot en la lista. */
const NIVEL_BOT = {
    distraido: '🤖 se distrae',
    normal:    '🤖',
    experto:   '🤖 experto'
};

/** Pide al servidor un bot más. Solo el anfitrión, y solo antes de empezar. */
export function agregarBot(nivel) {
    if (!partida.soyHost) return;
    socket.emit("agregar-bot", { sala: partida.sala, nivel });
}

/** Saca un bot de la sala. */
export function quitarBot(id) {
    if (!partida.soyHost) return;
    socket.emit("quitar-bot", { sala: partida.sala, id });
}

/** Una fila de la lista: corona del anfitrión, racha, apuesta y botón de silencio. */
function filaJugador(j) {
    const apostado = j.apostado ? "💸" : "";
    const corona = j.host ? "👑" : "";

    // Un bot se distingue a simple vista, y con su nivel: si no, parece que
    // estás jugando contra gente y no lo estás.
    if (j.esBot) {
        const etiqueta = NIVEL_BOT[j.nivel] || '🤖';
        const quitar = partida.soyHost
            ? `<button class="btn-mute" data-accion="quitar-bot" data-id="${escaparHtml(j.id)}"
                       title="Sacarlo de la sala">✖️</button>`
            : "";
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity:0.85;">
            <span>${etiqueta} ${escaparHtml(j.nickname)}</span>
            <span style="display:flex; align-items:center; gap:6px;">${apostado}${quitar}</span>
        </div>`;
    }

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

        // Los botones de bot solo tienen sentido para el anfitrión. Se decide
        // aquí y no al entrar porque `partida.soyHost` llega en `rol-asignado`,
        // que puede tardar más que el primer pintado de la lista.
        const zona = $("zonaBots");
        if (zona) zona.style.display = partida.soyHost ? "block" : "none";
    });
}

socket.on("silenciados-actualizados", (lista) => {
    partida.silenciados = Array.isArray(lista) ? lista : [];
});

socket.on("bot-rechazado", ({ motivo }) => {
    mostrarAlerta(motivo || "No se pudo añadir el bot.", "Sin bot 🤖");
});

socket.on("estas-silenciado", () => {
    mostrarAlerta("El anfitrión silenció tus efectos de sonido en esta sala.", "Sin sonidos 🔇");
});
