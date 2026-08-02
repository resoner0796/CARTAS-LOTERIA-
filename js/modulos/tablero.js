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
//   TABLA  = lo que elige el jugador. 53 (o 20 en modo Pozo).
//   CARTA  = lo que se canta. Siempre 54, salga el modo que salga.

import { socket } from './socket.js';
import { partida } from './estado.js';
import { cambiarPantalla, mostrarConfirmacion } from './ui.js';
import { fichaEnUso } from './tienda.js';
import { esPropia, tablaPorId, pintarTabla } from './tablasPropias.js';

/** Cuántas tablas se ofrecen para elegir, según el modo. */
const TABLAS_POR_MODO = { pozo: 20, porDefecto: 53 };

/** Tope de tablas por jugador. Más no caben en la mesa. */
const MAXIMO_TABLAS = 4;

/** A partir de dos tablas, el anfitrión ya puede arrancar. */
const MINIMO_PARA_INICIAR = 2;

// Las referencias se buscan cuando hacen falta, no al importar: el orden en que
// se evalúan los módulos no garantiza que la página esté parseada.
const $ = id => document.getElementById(id);

// ==================== ELEGIR TABLAS ====================

/**
 * Pinta todas las tablas disponibles para elegir.
 *
 * Los nombres de archivo cambian con el modo: Pozo usa un set aparte SIN ceros
 * (`1.jpg`) y el resto va con ceros (`01.jpg`). Equivocarse aquí no da error:
 * pinta tablas rotas o que no son.
 */
export function generarCartas() {
    const contenedor = $("contenedorCartas");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    const total = partida.modo === 'pozo' ? TABLAS_POR_MODO.pozo : TABLAS_POR_MODO.porDefecto;

    for (let i = 1; i <= total; i++) {
        const id = partida.modo === 'pozo' ? String(i) : String(i).padStart(2, '0');

        const img = document.createElement("img");
        img.src = `${partida.rutaCartas}${id}.jpg`;
        img.classList.add("carta-img");
        img.dataset.id = id;
        img.onclick = () => {
            seleccionarCarta(img);
            actualizarTextoBotonApuesta();
        };

        // La tabla va envuelta para poder colgarle encima el número de orden:
        // un <img> no admite ::before ni ::after.
        const envoltura = document.createElement("div");
        envoltura.className = "carta-seleccion";
        const insignia = document.createElement("span");
        insignia.className = "orden-carta";

        envoltura.appendChild(img);
        envoltura.appendChild(insignia);
        contenedor.appendChild(envoltura);
    }
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
 * Conviven dos clases de carta y se pintan distinto: las 53 de siempre son una
 * imagen entera, y una carta propia es una rejilla de 16 barajas construida al
 * vuelo. A partir de aquí las dos se comportan igual —se marcan con fichas y
 * viajan al anfitrión— así que la diferencia se acaba en esta función.
 */
export function montarMesa() {
    const mesa = $("juegoCartas");
    if (!mesa) return;
    mesa.innerHTML = "";

    partida.seleccionadas.forEach(id => {
        const contenedor = document.createElement("div");
        contenedor.classList.add("carta-juego");
        contenedor.dataset.id = id;

        const propia = tablaPorId(id);
        if (propia) {
            contenedor.classList.add("carta-juego-propia");
            contenedor.appendChild(pintarTabla(propia));
        } else {
            contenedor.innerHTML = `<img src="${partida.rutaCartas}${id}.jpg" class="carta-img seleccionada">`;
        }

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
    } else {
        if (partida.seleccionadas.length >= MAXIMO_TABLAS) return;
        partida.seleccionadas.push(id);
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
}

export function limpiarFichas() {
    document.querySelectorAll(".ficha").forEach(f => f.remove());
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
export function limpiarHistorialCantadas() {
    const historial = $("historial");
    if (historial) historial.innerHTML = "";
    partida.historialIds = [];
}

socket.on("partida-reiniciada", () => {
    limpiarFichas();
    limpiarHistorialCantadas();
});
