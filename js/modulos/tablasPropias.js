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
import { cerrarModalTiendaDetalle } from './tienda.js';

/** Casillas de una tabla: rejilla de 4×4. */
const CASILLAS = 16;

/** Precios, solo para PINTARLOS. Quien cobra es el servidor, con los suyos. */
export const PACK = { precio: 20, cuantas: 4 };
export const PERSONALIZADA = { precio: 25 };

/** Dónde van las cartas en el modo esquinas. Igual que en el servidor. */
const CASILLAS_ESQUINAS = [0, 3, 5, 6, 9, 10, 12, 15];

/** En dobles, la carta repetida ocupa estas dos del centro. */
const CASILLAS_DOBLE = [5, 6];

/** La baraja completa. */
const TOTAL_BARAJAS = 54;

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
            <button class="btn-buy" data-accion="comprar-pack">COMPRAR AL AZAR</button>
        </div>

        <div class="pack-tablas">
            <p class="pack-titulo">Arma la tuya</p>
            <p class="pack-precio">$${PERSONALIZADA.precio} monedas</p>
            <p class="pack-nota">Eliges tú carta por carta, las 16 casillas.</p>
            <button class="btn-use" data-accion="abrir-creador">CREAR A MI GUSTO</button>
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

    // El mostrador se cierra ANTES del aviso. Si se queda abierto, al dar
    // «Entendido» reaparece detrás con su botón de Volver y parece que la compra
    // no terminó: la persona ve un modal que no pidió.
    cerrarModalTiendaDetalle();

    mostrarAlerta(`Se añadieron ${cuantas} tablas nuevas a «Mis Cartas».`, '¡Listo! 🎴');
});

socket.on('error-pack', (mensaje) => {
    const boton = document.querySelector('[data-accion="comprar-pack"]');
    if (boton) { boton.disabled = false; boton.textContent = 'COMPRAR'; }
    const guardar = document.getElementById('btnGuardarTabla');
    if (guardar) { guardar.disabled = false; guardar.textContent = `CREAR — $${PERSONALIZADA.precio}`; }
    mostrarAlerta(mensaje || 'No se pudo comprar el pack', 'Ups');
});


// ==================== ARMAR UNA TABLA A MANO ====================
// El flujo del generador original: 16 casillas, se toca una y se elige la
// baraja. Aquí se avisa de lo que no cuadra mientras se arma, pero **quien
// decide es el servidor**: validarTablaManual() vuelve a mirarlo todo. Esto es
// para que la persona no pierda el tiempo, no para impedir trampas.

/** Lo que se lleva armado: 16 casillas, null donde no hay nada. */
let enConstruccion = new Array(16).fill(null);
let modoEnConstruccion = 'normal';
let casillaElegida = null;

/** ¿Qué casillas se pueden llenar en este modo? */
function casillasDelModo(modo) {
    return modo === 'esquinas' ? CASILLAS_ESQUINAS : [...Array(16).keys()];
}

export function abrirCreador() {
    const modal = document.getElementById('modalCrearTabla');
    if (!modal) return;

    // El selector va por `change`, no por la tabla de acciones: esa escucha
    // clics, y un <select> se puede cambiar con el teclado sin llegar a picarlo.
    const select = document.getElementById('selectModoCrear');
    if (select && !select.dataset.enganchado) {
        select.addEventListener('change', cambiarModoCreador);
        select.dataset.enganchado = '1';
    }

    modoEnConstruccion = 'normal';
    enConstruccion = new Array(16).fill(null);
    if (select) select.value = 'normal';
    modal.classList.add('active');
    pintarCreador();
}

export function cerrarCreador() {
    const modal = document.getElementById('modalCrearTabla');
    if (modal) modal.classList.remove('active');
}

/** Al cambiar de tipo se vacía: las casillas válidas ya no son las mismas. */
export function cambiarModoCreador() {
    const select = document.getElementById('selectModoCrear');
    modoEnConstruccion = select ? select.value : 'normal';
    enConstruccion = new Array(16).fill(null);
    pintarCreador();
}

function pintarCreador() {
    const rejilla = document.getElementById('rejillaCrear');
    if (!rejilla) return;

    rejilla.innerHTML = '';
    const validas = casillasDelModo(modoEnConstruccion);

    for (let i = 0; i < 16; i++) {
        const casilla = document.createElement('div');
        casilla.className = 'casilla-tabla casilla-editable';

        if (!validas.includes(i)) {
            // En esquinas, las que no se usan no se pueden tocar.
            casilla.classList.add('casilla-bloqueada');
        } else {
            casilla.onclick = () => abrirElectorBaraja(i);
            const carta = enConstruccion[i];
            if (carta === null) {
                casilla.classList.add('casilla-libre');
                casilla.textContent = '+';
            } else {
                const img = document.createElement('img');
                img.src = `assets/imagenes/barajas/${String(carta).padStart(2, '0')}.png`;
                img.alt = '';
                casilla.appendChild(img);
            }
        }
        rejilla.appendChild(casilla);
    }
    actualizarEstadoCreador();
}

/** Dice qué falta y habilita el botón solo cuando la tabla está lista. */
function actualizarEstadoCreador() {
    const aviso = document.getElementById('avisoCrear');
    const boton = document.getElementById('btnGuardarTabla');
    const revision = revisarEnConstruccion();

    if (aviso) aviso.textContent = revision.ok
        ? '¡Lista! Puedes guardarla.'
        : revision.motivo;
    if (boton) boton.disabled = !revision.ok;
}

/**
 * La misma revisión que hace el servidor, para avisar mientras se arma.
 *
 * ⚠️ Que esté aquí NO sustituye a la del servidor. Si algún día se quita allí
 * porque «ya se comprueba en el cliente», cualquiera se armará la tabla que
 * quiera desde la consola.
 */
function revisarEnConstruccion() {
    const validas = casillasDelModo(modoEnConstruccion);
    const puestas = validas.map(i => enConstruccion[i]).filter(c => c !== null);

    if (puestas.length < validas.length) {
        return { ok: false, motivo: `Faltan ${validas.length - puestas.length} cartas por elegir` };
    }
    if (modoEnConstruccion === 'dobles') {
        const [a, b] = CASILLAS_DOBLE;
        if (enConstruccion[a] !== enConstruccion[b]) {
            return { ok: false, motivo: 'Las dos del centro tienen que ser la misma carta' };
        }
        const sinLaSegunda = enConstruccion.filter((_, i) => i !== b);
        if (new Set(sinLaSegunda).size !== sinLaSegunda.length) {
            return { ok: false, motivo: 'Solo puede repetirse la carta del centro' };
        }
        return { ok: true };
    }
    if (new Set(puestas).size !== puestas.length) {
        return { ok: false, motivo: 'Hay una carta repetida' };
    }
    return { ok: true };
}

// --- El elector de baraja ---

function abrirElectorBaraja(casilla) {
    casillaElegida = casilla;
    const modal = document.getElementById('modalElegirBaraja');
    const zona = document.getElementById('gridBarajas');
    if (!modal || !zona) return;

    zona.innerHTML = '';
    for (let n = 1; n <= TOTAL_BARAJAS; n++) {
        const img = document.createElement('img');
        img.src = `assets/imagenes/barajas/${String(n).padStart(2, '0')}.png`;
        img.className = 'opcion-baraja';
        img.alt = '';

        // Las que ya están puestas se marcan, para no elegirlas dos veces sin
        // darse cuenta. En dobles se permite: el centro va repetido a propósito.
        const yaPuesta = enConstruccion.includes(n);
        if (yaPuesta && modoEnConstruccion !== 'dobles') img.classList.add('baraja-usada');

        img.onclick = () => elegirBaraja(n);
        zona.appendChild(img);
    }
    modal.classList.add('active');
}

export function cerrarElectorBaraja() {
    const modal = document.getElementById('modalElegirBaraja');
    if (modal) modal.classList.remove('active');
    casillaElegida = null;
}

function elegirBaraja(numero) {
    if (casillaElegida === null) return;

    // En dobles, poner la carta del centro la pone en las DOS casillas: es lo
    // que define el modo, y hacerlo a mano dos veces sería absurdo.
    if (modoEnConstruccion === 'dobles' && CASILLAS_DOBLE.includes(casillaElegida)) {
        CASILLAS_DOBLE.forEach(c => { enConstruccion[c] = numero; });
    } else {
        enConstruccion[casillaElegida] = numero;
    }

    cerrarElectorBaraja();
    pintarCreador();
}

/** Manda la tabla al servidor, que la revisa otra vez y cobra. */
export function guardarTablaPersonalizada() {
    const revision = revisarEnConstruccion();
    if (!revision.ok) return mostrarAlerta(revision.motivo, 'Falta algo');

    const boton = document.getElementById('btnGuardarTabla');
    if (boton) { boton.disabled = true; boton.textContent = 'Guardando...'; }

    socket.emit('comprar-tabla-personalizada', {
        cartas: enConstruccion,
        modo: modoEnConstruccion
    });
}

socket.on('tabla-personalizada-creada', () => {
    const boton = document.getElementById('btnGuardarTabla');
    if (boton) { boton.disabled = false; boton.textContent = `CREAR — $${PERSONALIZADA.precio}`; }
    cerrarCreador();
    cerrarModalTiendaDetalle();
    mostrarAlerta('Tu tabla quedó guardada en «Mis Cartas».', '¡Listo! 🎴');
});
