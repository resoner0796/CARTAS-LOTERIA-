// ======================================================
// GRITAR LOTERÍA Y VALIDAR GANADORES
// ======================================================
// El final de cada partida, que es la parte que reparte dinero:
//
//   1. Alguien grita lotería y manda sus cartas con las casillas que tapó.
//   2. El SERVIDOR decide si hay figura. Si no la hay, se lo dice a esa persona
//      y la partida sigue: un grito en falso ya no congela a toda la sala.
//   3. Si la hay, se abre una pausa de unos segundos para recoger empates.
//   4. El servidor reparte el bote entre quienes ganaron de verdad.
//
// Antes el paso 2 lo hacía el ANFITRIÓN mirando la carta de cada reclamante, con
// dos problemas que no se arreglan mirando mejor: se validaba a sí mismo, y
// cualquiera podía picar el botón de broma para parar la partida. Se pudo
// automatizar cuando las cartas dejaron de ser imágenes — con una carta como
// lista de números, el servidor sabe exactamente qué lleva cada una.
//
// Aquí ya no se juzga nada: solo se enseña lo que el servidor decidió.

import { socket } from './socket.js';
import { sesion, partida } from './estado.js';
import { mostrarAlerta } from './ui.js';
import { escaparHtml } from './utiles.js';
import { NOMBRE_FIGURA } from './config.js';
import { fichaEnUso } from './tienda.js';
import { tablaPorId } from './tablasPropias.js';
import { sonidos } from './audio.js';

const $ = id => document.getElementById(id);

/**
 * Grita lotería.
 *
 * Va el tablero entero: qué cartas se tenían, qué casillas se taparon, dónde
 * quedó cada ficha y con qué skin. Las casillas son lo que el servidor usa para
 * decidir; el resto es para poder volver a dibujarlo.
 */
export function emitirLoteria() {
    // Sin sesión no hay a quién adjudicar la victoria. No debería pasar jugando
    // normal, pero reventaba en vez de no hacer nada.
    if (!sesion.usuario) return;

    sonidos.pararTodo();      // que se oiga el grito, no la partida

    const boardState = {
        cards: partida.seleccionadas,
        chips: {},
        skin: fichaEnUso(),
        // QUÉ CASILLAS tapaste en cada carta. Esto es lo que el servidor usa
        // para validar, junto con sus propias barajas y su historial.
        //
        // Va aparte de `chips` a propósito: las fichas llevan su posición en
        // porcentaje, que sirve para volver a dibujarlas donde estaban, pero no
        // dice en qué casilla cayeron. La rejilla tiene margen y separación, así
        // que deducir la casilla del porcentaje sería aproximar justo el dato
        // que decide el bote.
        marcadas: {},
        // Cada carta viaja también con sus barajas, solo para pintar. El
        // SERVIDOR las reemplaza por las suyas antes de que nadie las vea.
        propias: {}
    };

    partida.seleccionadas.forEach(id => {
        const carta = tablaPorId(id);
        if (carta) boardState.propias[id] = carta.cartas;
    });

    document.querySelectorAll('#juegoCartas .carta-juego').forEach(contenedor => {
        const fichas = [...contenedor.querySelectorAll('.ficha')];
        if (fichas.length === 0) return;

        boardState.chips[contenedor.dataset.id] =
            fichas.map(f => ({ left: f.style.left, top: f.style.top }));

        // Una ficha soltada en el margen de la rejilla no tapa ninguna casilla,
        // y esas se quedan fuera en vez de colarse como un índice inventado.
        boardState.marcadas[contenedor.dataset.id] = fichas
            .map(f => f.dataset.casilla)
            .filter(c => c !== undefined)
            .map(Number);
    });

    socket.emit("loteria", {
        nickname: sesion.usuario.nickname,
        sala: partida.sala,
        boardState
    });
}

// ==================== LO QUE MANDA EL SERVIDOR ====================

socket.on("pausa-empate", ({ primerGanador, tiempo }) => {
    const mensaje = $("loteriaMensaje");
    if (!mensaje) return;

    mensaje.style.display = "block";
    mensaje.innerHTML = `
        <div style="font-size:2rem; color: gold; text-shadow: 2px 2px 0 #000;">¡${escaparHtml(primerGanador)} gritó BUENAS!</div>
        <div style="font-size:1.2rem; margin-top:20px; color: white;">Esperando empates... <span id="contadorEmpate" style="font-weight:bold; font-size:1.5rem;">${tiempo}</span>s</div>
    `;

    let quedan = tiempo;
    const cuenta = setInterval(() => {
        quedan--;
        const el = $("contadorEmpate");
        if (el) el.textContent = quedan;
        if (quedan <= 0) clearInterval(cuenta);
    }, 1000);
});

socket.on("notificar-otro-ganador", (otroNick) => {
    const mensaje = $("loteriaMensaje");
    if (!mensaje) return;
    mensaje.innerHTML += `<div style="font-size:1.5rem; color:#ff4081; font-weight:bold; margin-top:10px; animation: pulsate 0.5s infinite;">¡${escaparHtml(otroNick)} TAMBIÉN GRITÓ!</div>`;
    if (navigator.vibrate) navigator.vibrate([100, 100]);
});

/**
 * El servidor dice que no hay figura. Solo lo ve quien gritó.
 *
 * La partida NO se para: se sigue cantando mientras aparece el aviso. Es la
 * diferencia con antes, cuando un grito en falso congelaba a toda la sala hasta
 * que el anfitrión resolviera.
 */
socket.on("loteria-rechazada", ({ motivo, baraja }) => {
    // Si se le pasó, viene CUÁL era: se enseña la baraja, porque saber que se
    // te pasó sin saber cuál era es una mitad de aviso.
    mostrarAlerta(
        motivo || "Todavía no tienes lotería.",
        baraja ? "¡Se te fue! 😖" : "Aún no 🙈",
        baraja ? { barajaFinal: baraja } : null
    );
    sonidos.corre();
});

socket.on("ganadores-multiples", ({ ganadores, premio, prueba, pozoGanado, ganadorPozo }) => {
    const mensaje = $("loteriaMensaje");
    if (mensaje) mensaje.style.display = "none";

    // Se vuelve a habilitar pero NO se desmarca: entrar al pozo es una decisión
    // que dura mientras estés en la sala, no una casilla que haya que picar cada
    // partida. Se suelta al salir de la sala.
    const chkPozo = $("chkPozo");
    if (chkPozo) chkPozo.disabled = false;

    let msg = ganadores.length > 1
        ? `¡EMPATE! 🤝\nGanadores: ${ganadores.join(", ")}\nSe llevan ${premio} monedas cada uno.`
        : `¡TENEMOS GANADOR! 🏆\n${ganadores[0]} se lleva ${premio} monedas.`;

    if (pozoGanado > 0 && ganadorPozo) {
        msg += `\n\n🎰 ¡Y SE LLEVÓ EL POZO!\n${ganadorPozo} suma ${pozoGanado} monedas más.`;
    }

    // Con qué figura se ganó. Lo dice el servidor, que es quien la encontró, y
    // es información que antes no existía: el anfitrión validaba a ojo y nadie
    // llegaba a saber si había sido una diagonal o las cuatro esquinas.
    if (prueba && prueba.figura) {
        msg += `\n\nGanó por: ${NOMBRE_FIGURA[prueba.figura] || prueba.figura}.`;
    }

    // La prueba llega del servidor con las barajas de la carta ganadora dentro,
    // así que ya no hace falta pasarle una carpeta de dónde sacar la imagen.
    mostrarAlerta(msg, "¡RESULTADO FINAL!", prueba);

    sonidos.aplausos();
    lanzarConfeti();
});

// Queda del flujo viejo. Hoy no debería llegar —el servidor no abre la pausa si
// no hay una figura de verdad— pero si llegara, la sala tiene que enterarse de
// que el juego sigue en vez de quedarse mirando el contador.
socket.on("falsa-alarma-masiva", () => {
    const mensaje = $("loteriaMensaje");
    if (mensaje) mensaje.style.display = "none";
    mostrarAlerta("Se reanuda el juego.", "Sigue la partida");
    sonidos.corre();
});

function lanzarConfeti() {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 500]);

    for (let i = 0; i < 100; i++) {
        const confeti = document.createElement("div");
        confeti.classList.add("confeti");
        confeti.style.left = Math.random() * 100 + "vw";
        confeti.style.top = "-10px";
        confeti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        confeti.style.animationDelay = (Math.random() * 2) + "s";
        document.body.appendChild(confeti);
        confeti.addEventListener("animationend", () => confeti.remove());
    }
}
