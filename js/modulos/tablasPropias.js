// ======================================================
// TABLAS PROPIAS
// ======================================================
// Las tablas que el jugador compra en packs. A diferencia de las 53 de siempre,
// que son imágenes enteras, **una tabla propia es una lista de 16 números**: el
// servidor sabe qué carta hay en cada casilla.
//
// De ahí sale todo lo demás. Con las tablas como datos, el servidor puede
// comprobar una lotería sin que nadie mire, y se puede poner un bot que elija y
// marque. Nada de eso es posible con un JPG.
//
// ⚠️ Aquí NO se generan tablas. Se piden al servidor y se pintan. Si alguna vez
// alguien mueve la generación a este archivo, el día que el servidor valide solo
// cualquiera se fabricará una tabla con las cartas ya cantadas.

import { socket } from './socket.js';
import { mostrarAlerta } from './ui.js';

/** Casillas de una tabla: rejilla de 4×4. */
const CASILLAS = 16;

/** Lo que cuesta un pack y cuántas trae. Solo para PINTARLO: cobra el servidor. */
export const PACK = { precio: 20, cuantas: 4 };

/** Los modos que se venden, con su nombre y de qué van. */
export const MODOS_TABLA = [
    { id: 'normal',   nombre: 'Normal',   detalle: '16 cartas distintas' },
    { id: 'esquinas', nombre: 'Esquinas', detalle: '8 cartas — para el Pozo' },
    { id: 'dobles',   nombre: 'Dobles',   detalle: 'una carta repetida al centro' }
];

/** Las tablas de esta persona, tal como las mandó el servidor. */
let misTablas = [];

export function tablasGuardadas() { return misTablas; }

/** Pide las tablas al servidor. Se llama al entrar y tras comprar. */
export function pedirMisTablas() {
    socket.emit('solicitar-mis-tablas');
}

/**
 * Pinta una tabla en una rejilla de 4×4.
 *
 * Cada casilla lleva la baraja que le toca, sacada de `imagenes/barajas/` —el
 * conjunto de 54, con ceros— que es el mismo que se canta. Las casillas a `null`
 * quedan vacías, y eso solo pasa en el modo `esquinas`.
 */
export function pintarTabla(tabla, opciones = {}) {
    const rejilla = document.createElement('div');
    rejilla.className = 'tabla-generada';
    if (opciones.className) rejilla.className += ' ' + opciones.className;
    if (tabla.id) rejilla.dataset.tabla = tabla.id;

    const cartas = tabla.cartas || [];
    for (let i = 0; i < CASILLAS; i++) {
        const casilla = document.createElement('div');
        casilla.className = 'casilla-tabla';

        const carta = cartas[i];
        if (carta === null || carta === undefined) {
            casilla.classList.add('casilla-vacia');
        } else {
            const img = document.createElement('img');
            // Con ceros: las barajas van de 01 a 54, como las que se cantan.
            img.src = `assets/imagenes/barajas/${String(carta).padStart(2, '0')}.png`;
            img.alt = '';
            casilla.appendChild(img);
        }
        rejilla.appendChild(casilla);
    }
    return rejilla;
}

// ==================== «MIS CARTAS» ====================

export function abrirMisCartas() {
    const modal = document.getElementById('modalMisCartas');
    if (!modal) return;
    modal.classList.add('active');
    renderizarMisCartas();
    pedirMisTablas();      // por si compró en otro dispositivo
}

export function cerrarMisCartas() {
    const modal = document.getElementById('modalMisCartas');
    if (modal) modal.classList.remove('active');
}

function renderizarMisCartas() {
    const zona = document.getElementById('gridMisCartas');
    const aviso = document.getElementById('avisoMisCartas');
    if (!zona) return;

    zona.innerHTML = '';

    if (misTablas.length === 0) {
        if (aviso) {
            aviso.textContent = 'Todavía no tienes tablas propias. Cómpralas en la tienda, en «Generador de Cartas».';
            aviso.style.display = 'block';
        }
        return;
    }
    if (aviso) aviso.style.display = 'none';

    misTablas.forEach(tabla => {
        const caja = document.createElement('div');
        caja.className = 'mi-tabla';

        caja.appendChild(pintarTabla(tabla));

        const pie = document.createElement('div');
        pie.className = 'mi-tabla-pie';
        const nombre = MODOS_TABLA.find(m => m.id === tabla.modo);
        pie.textContent = nombre ? nombre.nombre : tabla.modo;
        caja.appendChild(pie);

        zona.appendChild(caja);
    });
}

// ==================== COMPRAR UN PACK ====================

/** Pinta el mostrador del generador dentro del modal de la tienda. */
export function abrirGeneradorTienda() {
    const modal = document.getElementById('modalTiendaDetalle');
    const titulo = document.getElementById('tituloCategoriaTienda');
    const zona = document.getElementById('gridTiendaItems');
    if (!modal || !zona) return;

    modal.classList.add('active');
    if (titulo) titulo.textContent = 'Generador de Cartas 🎴';

    const opciones = MODOS_TABLA.map(m =>
        `<option value="${m.id}">${m.nombre} — ${m.detalle}</option>`).join('');

    zona.innerHTML = `
        <div class="pack-tablas">
            <p class="pack-titulo">Pack de ${PACK.cuantas} tablas</p>
            <p class="pack-precio">$${PACK.precio} monedas</p>
            <p class="pack-nota">Tablas tuyas, distintas a las de todos. Las verás en «Mis Cartas».</p>
            <label class="pack-modo">
                <span>Tipo:</span>
                <select id="selectModoTabla">${opciones}</select>
            </label>
            <button class="btn-buy" data-accion="comprar-pack">COMPRAR</button>
        </div>
    `;
}

/**
 * Pide el pack al servidor.
 *
 * Solo viaja el MODO. El precio y cuántas trae los pone el servidor, igual que
 * en el resto de compras: si el precio viajara desde aquí, volveríamos al
 * agujero que costó cerrar seis veces.
 */
export function comprarPack() {
    const select = document.getElementById('selectModoTabla');
    const modo = select ? select.value : 'normal';

    const boton = document.querySelector('[data-accion="comprar-pack"]');
    if (boton) { boton.disabled = true; boton.textContent = 'Comprando...'; }

    socket.emit('comprar-pack-tablas', { modo });
}

// ==================== LO QUE MANDA EL SERVIDOR ====================

socket.on('mis-tablas', (tablas) => {
    misTablas = Array.isArray(tablas) ? tablas : [];
    // Solo se repinta si está abierto: si no, se queda listo para la próxima vez.
    const modal = document.getElementById('modalMisCartas');
    if (modal && modal.classList.contains('active')) renderizarMisCartas();

    const boton = document.getElementById('btnMisCartas');
    if (boton) boton.style.display = misTablas.length > 0 ? '' : 'none';
});

socket.on('pack-comprado', ({ cuantas }) => {
    const boton = document.querySelector('[data-accion="comprar-pack"]');
    if (boton) { boton.disabled = false; boton.textContent = 'COMPRAR'; }
    mostrarAlerta(`Se añadieron ${cuantas} tablas nuevas a «Mis Cartas».`, '¡Listo! 🎴');
});

socket.on('error-pack', (mensaje) => {
    const boton = document.querySelector('[data-accion="comprar-pack"]');
    if (boton) { boton.disabled = false; boton.textContent = 'COMPRAR'; }
    mostrarAlerta(mensaje || 'No se pudo comprar el pack', 'Ups');
});
