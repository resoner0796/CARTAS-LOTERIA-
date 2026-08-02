// ======================================================
// INTERFAZ: PANTALLAS Y MODALES
// ======================================================
// Lo que pinta la app sin saber nada del juego: navegar entre pantallas y los
// dos modales del sistema. No importa nada del resto de módulos y no toca el
// socket ni la sesión, así que se puede usar desde cualquier sitio.
//
// Sí toca el DOM, que es la diferencia con config.js: las referencias se buscan
// cuando hacen falta, no al cargar el módulo, porque el orden de evaluación de
// los imports no garantiza que la página ya esté parseada.

const FICHA_POR_DEFECTO = 'assets/imagenes/ui/ficha.PNG';

// ==================== PANTALLAS ====================

/** Cada pantalla de la SPA. Se resuelven a la primera llamada, no al importar. */
let pantallas = null;

function refsPantallas() {
    if (pantallas) return pantallas;
    pantallas = {
        splash: document.getElementById("pantallaSplash"),
        login: document.getElementById("pantallaLogin"),
        registro: document.getElementById("pantallaRegistro"),
        menu: document.getElementById("pantallaMenu"),
        sala: document.getElementById("pantallaSala"),
        seleccion: document.getElementById("pantallaSeleccion"),
        juego: document.getElementById("pantallaJuego"),
        pantallaAdmin: document.getElementById("pantallaAdmin")
    };
    return pantallas;
}

/** Navegar = alternar la clase .activa. No hay router ni historial. */
export function cambiarPantalla(nombre) {
    const refs = refsPantallas();
    Object.values(refs).forEach(p => p && p.classList.remove("activa"));
    if (refs[nombre]) {
        refs[nombre].classList.add("activa");
        if (nombre === "seleccion") refs[nombre].scrollTo(0, 0);
    }
}

/** Para quien necesite el elemento en bruto (el splash, sobre todo). */
export function pantalla(nombre) {
    return refsPantallas()[nombre];
}

// ==================== MODALES ====================
// Se usan SIEMPRE en lugar de alert() y confirm() nativos.

let onModalAceptar = null;

function refsModal() {
    return {
        caja: document.getElementById("modalSistema"),
        titulo: document.getElementById("modalSistemaTitulo"),
        mensaje: document.getElementById("modalSistemaMensaje"),
        aceptar: document.getElementById("btnModalAceptar"),
        cancelar: document.getElementById("btnModalCancelar")
    };
}

/**
 * Aviso de un solo botón.
 *
 * `prueba` es opcional y sirve para enseñar la tabla ganadora con sus fichas
 * encima, para que cualquiera pueda compararla con el historial. Trae
 * `{ tabla, fichas, skin, ruta }`; la RUTA viaja dentro del objeto en vez de
 * leerse de una global, que es lo que mantiene a este módulo independiente del
 * estado de la partida (en modo Pozo las tablas salen de otra carpeta).
 */
export function mostrarAlerta(mensaje, titulo = "Aviso del Sistema", prueba = null) {
    const m = refsModal();
    m.titulo.textContent = titulo;
    m.mensaje.textContent = mensaje;
    m.cancelar.style.display = "none";
    m.aceptar.textContent = "Entendido";

    const zonaCarta = document.getElementById("modalCartaGanadora");
    if (zonaCarta) {
        zonaCarta.innerHTML = "";
        if (prueba && prueba.tabla) {
            const rotulo = document.createElement("p");
            rotulo.className = "prueba-titulo";
            rotulo.textContent = "Tabla ganadora:";

            const marco = document.createElement("div");
            marco.className = "prueba-tabla";

            if (prueba.barajas) {
                // Carta propia: viaja con sus 16 barajas porque nadie más de la
                // sala la tiene. Se pinta la rejilla en lugar de una imagen.
                //
                // Se construye aquí a mano en vez de llamar a tablasPropias.js
                // a propósito: este módulo no importa nada del juego, y hacerlo
                // por una rejilla de 16 casillas lo ataría a media aplicación.
                const rejilla = document.createElement("div");
                rejilla.className = "tabla-generada";
                prueba.barajas.forEach(baraja => {
                    const casilla = document.createElement("div");
                    casilla.className = "casilla-tabla";
                    if (baraja === null || baraja === undefined) {
                        casilla.classList.add("casilla-vacia");
                    } else {
                        const b = document.createElement("img");
                        b.src = `assets/imagenes/barajas/${String(baraja).padStart(2, '0')}.png`;
                        b.alt = "";
                        casilla.appendChild(b);
                    }
                    rejilla.appendChild(casilla);
                });
                marco.appendChild(rejilla);
            } else {
                const img = document.createElement("img");
                img.src = `${prueba.ruta || 'assets/imagenes/cartas/'}${prueba.tabla}.jpg`;
                img.alt = "";
                marco.appendChild(img);
            }

            (prueba.fichas || []).forEach(pos => {
                const ficha = document.createElement("img");
                ficha.src = prueba.skin || FICHA_POR_DEFECTO;
                ficha.className = "ficha";
                ficha.style.left = pos.left;
                ficha.style.top = pos.top;
                marco.appendChild(ficha);
            });

            zonaCarta.appendChild(rotulo);
            zonaCarta.appendChild(marco);
            zonaCarta.style.display = "block";
        } else {
            zonaCarta.style.display = "none";
        }
    }

    onModalAceptar = () => cerrarModal();

    m.caja.classList.add("active");
    if (navigator.vibrate) navigator.vibrate(50);
}

/** Confirmación de dos botones. El callback solo corre si aceptan. */
export function mostrarConfirmacion(mensaje, callbackAceptar) {
    const m = refsModal();
    m.titulo.textContent = "¿Estás seguro?";
    m.mensaje.textContent = mensaje;

    // Los dos modales comparten el mismo contenedor, así que hay que borrar la
    // tabla ganadora de la vez anterior. Si no, al pedir confirmación para salir
    // aparecía otra vez la tabla del último que ganó.
    limpiarPruebaVictoria();
    m.cancelar.style.display = "inline-block";
    m.aceptar.textContent = "Sí";

    onModalAceptar = () => {
        callbackAceptar();
        cerrarModal();
    };

    m.caja.classList.add("active");
}

/** Borra la tabla ganadora del modal compartido. */
export function limpiarPruebaVictoria() {
    const zona = document.getElementById("modalCartaGanadora");
    if (!zona) return;
    zona.innerHTML = "";
    zona.style.display = "none";
}

export function cerrarModal() {
    const m = refsModal();
    if (m.caja) m.caja.classList.remove("active");
    onModalAceptar = null;
    limpiarPruebaVictoria();
}

/**
 * Engancha los dos botones del modal. Se llama una vez, desde el arranque:
 * hacerlo al importar fallaría si el módulo se evalúa antes de que exista el DOM.
 */
export function iniciarModales() {
    const m = refsModal();
    if (m.aceptar) m.aceptar.onclick = () => { if (onModalAceptar) onModalAceptar(); else cerrarModal(); };
    if (m.cancelar) m.cancelar.onclick = () => cerrarModal();
}
