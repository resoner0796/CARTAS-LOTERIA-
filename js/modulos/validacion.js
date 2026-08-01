// ======================================================
// GRITAR LOTERÍA Y VALIDAR GANADORES
// ======================================================
// El final de cada partida, que es la parte que reparte dinero:
//
//   1. Alguien grita lotería y manda su tablero con las fichas puestas.
//   2. El servidor abre una pausa de unos segundos para recoger empates.
//   3. El ANFITRIÓN revisa la tabla de cada reclamante y da su veredicto.
//   4. El servidor reparte el bote entre los validados.
//
// El anfitrión valida mirando: por eso el reclamante manda las posiciones de sus
// fichas y aquí se reconstruye su tabla tal cual la tenía. Y por eso el anfitrión
// puede marcar CUÁL tabla se llenó — esa es la prueba que ve toda la sala, que
// importa sobre todo cuando el anfitrión se valida a sí mismo.

import { socket } from './socket.js';
import { sesion, partida } from './estado.js';
import { mostrarAlerta } from './ui.js';
import { escaparHtml } from './utiles.js';
import { fichaEnUso } from './tienda.js';
import { FICHA_POR_DEFECTO } from './config.js';
import { sonidos } from './audio.js';

const $ = id => document.getElementById(id);

/** Cuál de las tablas del reclamante se llenó. La marca el anfitrión, opcional. */
let tablaGanadoraElegida = null;

/**
 * Grita lotería.
 *
 * Va el tablero entero: qué tablas se tenían, dónde está cada ficha y con qué
 * skin. El servidor lo guarda para que el anfitrión pueda revisarlo aunque el
 * reclamante se desconecte.
 */
export function emitirLoteria() {
    sonidos.pararTodo();      // que se oiga el grito, no la partida

    const boardState = {
        cards: partida.seleccionadas,
        chips: {},
        skin: fichaEnUso()
    };

    document.querySelectorAll('#juegoCartas .carta-juego').forEach(contenedor => {
        const fichas = [...contenedor.querySelectorAll('.ficha')]
            .map(f => ({ left: f.style.left, top: f.style.top }));
        if (fichas.length > 0) boardState.chips[contenedor.dataset.id] = fichas;
    });

    socket.emit("loteria", {
        nickname: sesion.usuario.nickname,
        sala: partida.sala,
        boardState
    });
}

/** Toma el siguiente reclamante que quede por revisar. */
function procesarSiguienteValidacion(lista) {
    const siguiente = lista.find(r => r.status === 'pendiente');
    if (!siguiente) return;

    const total = lista.length;
    const numero = lista.filter(r => r.status !== 'pendiente').length + 1;
    abrirModalValidacionHost(siguiente, numero, total);
}

/** Reconstruye la tabla del reclamante para que el anfitrión la revise. */
function abrirModalValidacionHost(candidato, numero, total) {
    partida.ganadorTemp = candidato.id;
    tablaGanadoraElegida = null;

    const titulo = $("modalLoteriaTitulo");
    const texto = $("modalLoteriaTexto");
    if (titulo) titulo.textContent = `Validando Ganador (${numero} de ${total})`;
    if (texto) texto.textContent = `${candidato.nickname} reclama victoria. Revisa su tabla.`;

    const aviso = $("avisoCartaGanadora");
    if (aviso) aviso.textContent = "Toca la tabla que se llenó (opcional)";

    // Las cartas cantadas, para comparar. Siempre de la baraja de 54.
    const historial = $("modalHistorialFlex");
    if (historial) {
        historial.innerHTML = "";
        partida.historialIds.forEach(cartaId => {
            const img = document.createElement("img");
            img.src = `assets/imagenes/barajas/${cartaId}.png`;
            historial.appendChild(img);
        });
    }

    const zona = $("modalVerificationArea");
    if (!zona) return;
    zona.innerHTML = '';

    const tablero = candidato.boardState;
    if (!tablero || !tablero.cards) return;

    // La skin viaja con el tablero: así se ve igual que la tenía el reclamante.
    const skin = tablero.skin || FICHA_POR_DEFECTO;

    tablero.cards.forEach(tablaId => {
        const contenedor = document.createElement('div');
        contenedor.className = 'carta-juego tabla-validable';
        contenedor.dataset.tabla = tablaId;
        contenedor.onclick = () => elegirTablaGanadora(tablaId);

        const img = document.createElement('img');
        // Ruta dinámica: en modo Pozo las tablas salen de otra carpeta.
        img.src = `${partida.rutaCartas}${tablaId}.jpg`;
        img.className = 'carta-img seleccionada';
        img.style.pointerEvents = "none";
        contenedor.appendChild(img);

        (tablero.chips?.[tablaId] || []).forEach(pos => {
            const ficha = document.createElement("img");
            ficha.src = skin;
            ficha.className = "ficha";
            ficha.style.left = pos.left;
            ficha.style.top = pos.top;
            ficha.style.pointerEvents = "none";
            contenedor.appendChild(ficha);
        });

        zona.appendChild(contenedor);
    });

    // La casilla del pozo solo tiene sentido si hay algo acumulado.
    const veredictoPozo = $("pozoVeredicto");
    const chkGanoPozo = $("chkGanoPozo");
    if (veredictoPozo) {
        const aplica = partida.modo === 'tradicional' && partida.pozo > 0;
        veredictoPozo.style.display = aplica ? "flex" : "none";
        if (chkGanoPozo) chkGanoPozo.checked = false;
        if (aplica) {
            veredictoPozo.querySelector("span").textContent =
                `🎰 También se llevó el POZO de $${partida.pozo} (llenó las 4 del centro)`;
        }
    }

    const modal = $("loteriaModal");
    if (modal) modal.classList.add("active");
}

/** Marca o desmarca cuál tabla se llenó. Se puede dar veredicto sin elegir. */
function elegirTablaGanadora(tablaId) {
    tablaGanadoraElegida = (tablaGanadoraElegida === tablaId) ? null : tablaId;

    document.querySelectorAll("#modalVerificationArea .tabla-validable").forEach(cont => {
        cont.classList.toggle("elegida-ganadora", cont.dataset.tabla === tablaGanadoraElegida);
    });

    const aviso = $("avisoCartaGanadora");
    if (aviso) {
        aviso.textContent = tablaGanadoraElegida
            ? "Marcada la tabla ganadora ✓"
            : "Toca la tabla que se llenó (opcional)";
    }
}

/** Engancha los botones de aceptar y rechazar del anfitrión. */
export function iniciarValidacion() {
    const aceptar = $("btnAceptarGanador");
    const rechazar = $("btnRechazarGanador");
    const modal = $("loteriaModal");

    if (aceptar) aceptar.onclick = () => {
        if (!partida.ganadorTemp) return;
        const chkGanoPozo = $("chkGanoPozo");
        socket.emit("veredicto-host", {
            sala: partida.sala,
            candidatoId: partida.ganadorTemp,
            esValido: true,
            tablaGanadora: tablaGanadoraElegida,
            ganoPozo: !!(chkGanoPozo && chkGanoPozo.checked)
        });
        if (chkGanoPozo) chkGanoPozo.checked = false;
        if (modal) modal.classList.remove("active");
    };

    if (rechazar) rechazar.onclick = () => {
        if (!partida.ganadorTemp) return;
        socket.emit("veredicto-host", {
            sala: partida.sala,
            candidatoId: partida.ganadorTemp,
            esValido: false
        });
        if (modal) modal.classList.remove("active");
    };
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

socket.on("iniciar-validacion-secuencial", (lista) => {
    const mensaje = $("loteriaMensaje");
    if (mensaje) mensaje.style.display = "none";
    procesarSiguienteValidacion(lista);
});

socket.on("continuar-validacion", (lista) => procesarSiguienteValidacion(lista));

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

    // La ruta viaja DENTRO de la prueba porque el modal vive en ui.js y no
    // conoce el estado de la partida. En modo Pozo las tablas salen de otra
    // carpeta, así que sin esto la tabla ganadora saldría rota.
    mostrarAlerta(msg, "¡RESULTADO FINAL!", prueba && { ...prueba, ruta: partida.rutaCartas });

    sonidos.aplausos();
    lanzarConfeti();
});

socket.on("falsa-alarma-masiva", () => {
    const mensaje = $("loteriaMensaje");
    if (mensaje) mensaje.style.display = "none";
    mostrarAlerta("Todos los reclamos fueron rechazados. ¡Sigue el juego!", "Falsa Alarma 🤡");
    sonidos.corre();          // sigue la partida
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
