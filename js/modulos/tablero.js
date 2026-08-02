// ======================================================
// TABLERO
// ======================================================
// Elegir tablas, ponerlas en la mesa, marcar fichas y seguir las cartas que se
// cantan. Es el juego en sí, del lado del cliente.
//
// Este módulo escucha SUS eventos de socket (`carta-cantada`,
// `cartas-desactivadas`, `barajear`…) en vez de tenerlos todos amontonados en
// app.js. Cada módulo se ocupa de lo suyo.
//
// ⚠️ No confundir los dos conjuntos, que es la trampa más fácil del proyecto:
//   CARTA  = la rejilla de 4×4 que elige el jugador. Las manda el servidor.
//   BARAJA = cada una de las que se cantan. Siempre 54, salga el modo que salga.

import { socket } from './socket.js';
import { partida } from './estado.js';
import { cambiarPantalla, mostrarConfirmacion } from './ui.js';
import { fichaEnUso } from './tienda.js';
import { esPropia, tablaPorId, pintarTabla } from './tablasPropias.js';

/** Tope de tablas por jugador. Más no caben en la mesa. */
const MAXIMO_TABLAS = 4;

/** A partir de dos tablas, el anfitrión ya puede arrancar. */
const MINIMO_PARA_INICIAR = 2;

// Las referencias se buscan cuando hacen falta, no al importar: el orden en que
// se evalúan los módulos no garantiza que la página esté parseada.
const $ = id => document.getElementById(id);

// ==================== ELEGIR TABLAS ====================

/**
 * Pinta todas las cartas disponibles para elegir.
 *
 * Las manda el servidor en `info-sala`, ya equilibradas y con las que le tocan
 * al modo: en el Pozo son veinte de ocho casillas y en el resto sesenta llenas.
 * Aquí no se decide ni cuántas hay ni qué llevan.
 *
 * Antes cada carta era un JPG y esta función contaba hasta 53 componiendo
 * nombres de archivo. Ahora una carta son sus dieciséis barajas y se pinta como
 * una rejilla, igual que las compradas.
 */
export function generarCartas() {
    const contenedor = $("contenedorCartas");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    partida.cartasSistema.forEach(carta => {
        const rejilla = pintarTabla(carta, { className: 'carta-img', perezoso: true });
        rejilla.dataset.id = carta.id;
        rejilla.onclick = () => {
            seleccionarCarta(rejilla);
            actualizarTextoBotonApuesta();
        };

        // La carta va envuelta para poder colgarle encima el número de orden:
        // la insignia se posiciona contra la envoltura, no contra la rejilla.
        const envoltura = document.createElement("div");
        envoltura.className = "carta-seleccion";
        const insignia = document.createElement("span");
        insignia.className = "orden-carta";

        envoltura.appendChild(rejilla);
        envoltura.appendChild(insignia);
        contenedor.appendChild(envoltura);
    });
}

/**
 * Pinta sobre cada tabla elegida el lugar que ocupa (1 a 4).
 *
 * Ese orden es el mismo con el que se acomodan en la mesa, así que el jugador
 * decide dónde le queda cada una. Hay que repintarlo entero en cada cambio: si
 * sueltas la segunda, la tercera pasa a ser segunda.
 */
export function renumerarSeleccion() {
    document.querySelectorAll("#contenedorCartas .carta-seleccion").forEach(env => {
        const img = env.querySelector(".carta-img");
        const insignia = env.querySelector(".orden-carta");
        if (!img || !insignia) return;

        const lugar = partida.seleccionadas.indexOf(img.dataset.id);
        if (lugar === -1) {
            env.classList.remove("elegida");
            insignia.textContent = "";
        } else {
            env.classList.add("elegida");
            insignia.textContent = lugar + 1;
        }
    });
}

/** Elige o suelta una tabla. El servidor la aparta para que nadie más la tome. */
export function seleccionarCarta(img) {
    const id = img.dataset.id;
    const btnIniciar = $("btnIniciar");

    if (partida.seleccionadas.includes(id)) {
        partida.seleccionadas = partida.seleccionadas.filter(c => c !== id);
        img.classList.remove("seleccionada");
        socket.emit("deseleccionar-carta", { carta: id, sala: partida.sala });

        if (btnIniciar && partida.seleccionadas.length < MINIMO_PARA_INICIAR) {
            btnIniciar.style.display = "none";
        }
        actualizarTextoBotonApuesta();
        renumerarSeleccion();
        return;
    }

    // Tabla que ya tiene otro jugador: el servidor la deja sin eventos.
    if (img.style.pointerEvents === 'none') return;

    if (partida.seleccionadas.length < MAXIMO_TABLAS) {
        img.classList.add("seleccionada");
        partida.seleccionadas.push(id);
        socket.emit("seleccionar-carta", { carta: id, sala: partida.sala });

        if (btnIniciar && partida.seleccionadas.length >= MINIMO_PARA_INICIAR) {
            btnIniciar.style.display = "block";
        }
        actualizarTextoBotonApuesta();
        renumerarSeleccion();
    }
}

/** El botón de apostar dice cuánto se va a pagar, no solo "apostar". */
export function actualizarTextoBotonApuesta() {
    const btn = $("btnApostar");
    if (!btn) return;

    // Se cuenta `partida.seleccionadas`, no lo pintado en la pantalla de
    // selección. Antes se miraba el DOM porque era el único sitio donde se
    // elegía; con las cartas PROPIAS, que se eligen desde «Mis Cartas», ahí no
    // aparece ninguna y el botón se quedaba en «Selecciona cartas» aunque
    // hubiera cuatro elegidas: no se podía apostar con ellas.
    const elegidas = partida.seleccionadas.length;
    const total = elegidas * partida.costoCarta;

    if (elegidas > 0) {
        btn.innerText = `Apostar $${total}`;
        btn.disabled = false;
        btn.style.opacity = "1";
    } else {
        btn.innerText = "Selecciona cartas";
        btn.disabled = true;
        btn.style.opacity = "0.5";
    }
}

// ==================== LA MESA ====================

/**
 * Pone en la mesa las cartas elegidas, listas para marcar.
 *
 * Las del sistema y las compradas se pintan exactamente igual: las dos son una
 * lista de barajas, y `tablaPorId()` resuelve el id venga de donde venga. Antes
 * había dos ramas aquí, una para el JPG y otra para la rejilla.
 */
export function montarMesa() {
    const mesa = $("juegoCartas");
    if (!mesa) return;
    mesa.innerHTML = "";

    partida.seleccionadas.forEach(id => {
        const contenedor = document.createElement("div");
        contenedor.classList.add("carta-juego");
        contenedor.dataset.id = id;

        const carta = tablaPorId(id);
        if (!carta) return;          // id que no existe: mejor nada que un hueco roto
        contenedor.classList.add("carta-juego-rejilla");
        contenedor.appendChild(pintarTabla(carta));

        contenedor.onclick = e => marcarFicha(e, contenedor);
        mesa.appendChild(contenedor);
    });
}

/**
 * Elige o suelta una carta propia.
 *
 * A diferencia de las 53, estas NO se avisan al servidor para que las bloquee:
 * son únicas de cada persona, nadie más puede elegirlas. Sí cuentan para el
 * tope de cuatro y para lo que se apuesta.
 */
export function alternarCartaPropia(id) {
    const yaEsta = partida.seleccionadas.includes(id);

    if (yaEsta) {
        partida.seleccionadas = partida.seleccionadas.filter(c => c !== id);
        socket.emit("deseleccionar-carta", { carta: id, sala: partida.sala });
    } else {
        if (partida.seleccionadas.length >= MAXIMO_TABLAS) return;
        partida.seleccionadas.push(id);
        // Hay que avisar igual que con las de siempre. El servidor NO las aparta
        // para los demás —son de una sola persona— pero necesita saber que las
        // tienes: es lo que cuenta para cobrar la apuesta. Sin este aviso el
        // servidor veía cero cartas y salía en silencio, sin cobrar ni sumar al
        // bote y sin dejar rastro en la consola.
        socket.emit("seleccionar-carta", { carta: id, sala: partida.sala });
    }

    const btnIniciar = $("btnIniciar");
    if (btnIniciar) {
        btnIniciar.style.display =
            partida.seleccionadas.length >= MINIMO_PARA_INICIAR ? "block" : "none";
    }
    actualizarTextoBotonApuesta();
    renumerarSeleccion();
}

/**
 * Pone o quita una ficha donde se toca.
 *
 * La posición se guarda en PORCENTAJE, no en píxeles: la tabla cambia de tamaño
 * con la pantalla, y en píxeles las fichas se descolocarían al girar el móvil.
 */
export function marcarFicha(e, contenedor) {
    if (e.target.classList.contains("ficha")) {
        if (navigator.vibrate) navigator.vibrate(10);
        e.target.remove();
        return;
    }

    // En una carta propia no hay una imagen única: se mide la rejilla entera,
    // que es lo que ocupa el mismo sitio que la imagen en las de siempre.
    const referencia = contenedor.querySelector("img.carta-img")
                    || contenedor.querySelector(".tabla-generada");
    if (!referencia) return;

    const marco = referencia.getBoundingClientRect();
    const px = ((e.clientX - marco.left) / marco.width) * 100;
    const py = ((e.clientY - marco.top) / marco.height) * 100;

    if (navigator.vibrate) navigator.vibrate(30);

    const ficha = document.createElement("img");
    ficha.src = fichaEnUso();          // la skin comprada, o la clásica
    ficha.classList.add("ficha");
    ficha.style.left = `${px}%`;
    ficha.style.top = `${py}%`;
    contenedor.appendChild(ficha);

    // La casilla marcada deja de latir. El aviso está para ayudar a encontrar la
    // baraja que acaban de cantar, y una vez tapada ya no ayuda: sigue llamando
    // la atención sobre algo que ya está resuelto.
    //
    // Se busca por dónde se tocó, no por el número: es lo único que dice QUÉ
    // casilla se acaba de tapar, que es lo que hay que apagar.
    e.target.closest?.('.casilla-tabla')?.classList.remove('baraja-cantada');
}

/** Cuánto vuelan las fichas al salir despedidas, y cuánto tardan. */
const VUELO = 320;                  // px desde el centro de su carta
const DURACION_VUELO = 720;         // ms, igual que la animación del CSS
const CASCADA = 260;                // ms de diferencia entre la primera y la última

/**
 * Quita las fichas del tablero.
 *
 * Con `animado`, salen despedidas del centro hacia afuera antes de irse: las de
 * en medio primero y las de las esquinas al final. Solo se anima al pulsar
 * Limpiar, que es cuando la mesa se queda a la vista; los otros sitios que
 * llaman aquí cambian de pantalla acto seguido y la animación no se vería.
 */
export function limpiarFichas(animado = false) {
    const fichas = [...document.querySelectorAll(".ficha")];
    if (!animado || fichas.length === 0) {
        fichas.forEach(f => f.remove());
        return;
    }

    // La dirección de cada ficha sale de dónde está DENTRO de su tabla. Se
    // colocan con left/top en porcentaje, así que el centro es el 50% y la
    // distancia se mide en esas mismas unidades: sirve igual con la tabla
    // grande del móvil que con cuatro pequeñas en el escritorio.
    const posiciones = fichas.map(f => {
        const x = parseFloat(f.style.left) - 50;
        const y = parseFloat(f.style.top) - 50;
        const d = Math.hypot(x, y);
        return { x, y, d: Number.isFinite(d) ? d : 0 };
    });
    const masLejos = Math.max(...posiciones.map(p => p.d)) || 1;

    fichas.forEach((f, i) => {
        const p = posiciones[i];
        // Una ficha justo en el centro no tiene hacia dónde salir: se le da un
        // rumbo cualquiera en vez de dejarla desvaneciéndose en el sitio.
        const angulo = p.d > 0.5 ? Math.atan2(p.y, p.x) : Math.random() * Math.PI * 2;

        f.style.setProperty("--vx", `${Math.cos(angulo) * VUELO}px`);
        f.style.setProperty("--vy", `${Math.sin(angulo) * VUELO}px`);
        f.style.setProperty("--giro", `${(Math.random() * 2 - 1) * 220}deg`);
        f.style.setProperty("--retraso", `${(p.d / masLejos) * CASCADA}ms`);
        f.classList.add("saliendo");
    });

    // Se borran de una sola vez al final. Escuchar `animationend` en cada ficha
    // parece más fino, pero ese evento no llega si la pestaña está en segundo
    // plano o si el sistema tiene desactivadas las animaciones, y las fichas se
    // quedarían encima del tablero para siempre.
    setTimeout(() => fichas.forEach(f => f.remove()), DURACION_VUELO + CASCADA + 60);
}

/** Suelta todas las tablas y vuelve a la pantalla de selección. */
export function cambiarCartas() {
    const hacerlo = () => {
        partida.seleccionadas.forEach(id => {
            socket.emit("deseleccionar-carta", { carta: id, sala: partida.sala });
        });
        partida.seleccionadas = [];

        limpiarFichas();
        const mesa = $("juegoCartas");
        if (mesa) mesa.innerHTML = "";
        const btnIniciar = $("btnIniciar");
        if (btnIniciar) btnIniciar.style.display = "none";

        document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
            img.classList.remove("seleccionada");
            img.style.opacity = 1;
            img.style.pointerEvents = "auto";
        });
        renumerarSeleccion();
        cambiarPantalla("seleccion");
    };

    // Si la partida está corriendo, cambiar de tablas obliga a pausarla.
    const btnDetener = $("btnDetenerJuego");
    if (btnDetener && btnDetener.style.display !== "none" && partida.soyHost) {
        mostrarConfirmacion("El juego está corriendo. ¿Pausar para cambiar cartas?", () => {
            socket.emit("detener-juego", partida.sala);
            hacerlo();
        });
    } else {
        hacerlo();
    }
}

/** Vuelve a marcar en pantalla las tablas que ya se tenían. Tras un F5. */
export function restaurarSeleccionVisual() {
    partida.seleccionadas.forEach(id => {
        const img = document.querySelector(`#contenedorCartas .carta-img[data-id="${id}"]`);
        if (img) img.classList.add("seleccionada");
    });
    renumerarSeleccion();
    actualizarTextoBotonApuesta();

    const btnApostar = $("btnApostar");
    if (btnApostar && partida.haApostado) btnApostar.disabled = true;
}

/** Deja el tablero como al principio. Al salir de la sala. */
export function resetearTablero() {
    partida.silenciados = [];
    partida.pozo = 0;

    const chkPozo = $("chkPozo");
    if (chkPozo) { chkPozo.checked = false; chkPozo.disabled = false; }

    limpiarFichas();
    partida.seleccionadas = [];

    const mesa = $("juegoCartas");
    if (mesa) mesa.innerHTML = "";
    const btnIniciar = $("btnIniciar");
    if (btnIniciar) btnIniciar.style.display = "none";
    const historial = $("historial");
    if (historial) historial.innerHTML = "";

    partida.haApostado = false;
    const btnApostar = $("btnApostar");
    if (btnApostar) btnApostar.disabled = false;

    // Quita el ?sala= de la barra para no reentrar sola al recargar.
    window.history.pushState({}, document.title, window.location.pathname);
}

// ==================== LO QUE MANDA EL SERVIDOR ====================

/**
 * Enciende en la mesa las barajas iguales a la que acaban de cantar.
 *
 * Vale para todas las cartas desde que dejaron de ser imágenes: cada casilla es
 * una baraja suelta con su número, así que se puede señalar.
 *
 * Se resalta, NO se marca: poner la ficha sigue siendo cosa de quien juega. Si
 * se marcara solo, no habría partida. Y en cuanto se pone la ficha encima, el
 * aviso se apaga —lo hace `marcarFicha()`— porque ya cumplió.
 */
function resaltarBarajaCantada(numeroConCeros) {
    // Primero se apaga la anterior: el aviso late hasta que cantan la siguiente,
    // así que solo puede haber una encendida. Con varias a la vez no se sabría
    // cuál es la que acaban de decir.
    document.querySelectorAll('#juegoCartas .baraja-cantada')
        .forEach(c => c.classList.remove('baraja-cantada'));

    document.querySelectorAll('#juegoCartas .casilla-tabla img').forEach(img => {
        if (!img.src.endsWith(`/${numeroConCeros}.png`)) return;
        img.parentElement.classList.add('baraja-cantada');
    });
}

socket.on("carta-cantada", (cartaId) => {
    // Las cartas cantadas SIEMPRE llevan ceros y salen de barajas/, sin importar
    // el modo. Es el conjunto de 54, distinto del de las tablas.
    const id = String(cartaId).padStart(2, '0');

    const historial = $("historial");
    if (historial) {
        const img = document.createElement("img");
        img.src = `assets/imagenes/barajas/${id}.png`;
        historial.prepend(img);
        historial.scrollLeft = 0;
    }
    partida.historialIds.unshift(id);

    new Audio(`assets/audios/${id}.mp3`).play().catch(() => {});

    resaltarBarajaCantada(id);
});

socket.on("cartas-desactivadas", ids => {
    document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
        const ocupadaPorOtro = ids.includes(img.dataset.id)
            && !partida.seleccionadas.includes(img.dataset.id);
        img.style.opacity = ocupadaPorOtro ? 0.3 : 1;
        img.style.pointerEvents = ocupadaPorOtro ? "none" : "auto";
    });
});

/** Borra las cartas ya cantadas: al barajear y al reiniciar la partida. */
/** Apaga el aviso de la baraja en juego. Al barajear o al parar la partida. */
export function apagarAvisoBaraja() {
    document.querySelectorAll('#juegoCartas .baraja-cantada')
        .forEach(c => c.classList.remove('baraja-cantada'));
}

export function limpiarHistorialCantadas() {
    const historial = $("historial");
    if (historial) historial.innerHTML = "";
    partida.historialIds = [];
}

socket.on("partida-reiniciada", () => {
    limpiarFichas();
    limpiarHistorialCantadas();
    apagarAvisoBaraja();
});
