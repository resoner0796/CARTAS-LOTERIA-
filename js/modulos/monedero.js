// ======================================================
// MONEDERO: TRANSFERENCIAS E HISTORIAL
// ======================================================
// Mandar monedas a otro jugador por nickname y ver los movimientos.
//
// Ninguna función lee el estado de la partida: **el usuario llega siempre como
// argumento**. Es lo que permite sacar esto de app.js sin arrastrar la global
// `usuarioActual`, y de paso deja claro qué necesita cada operación.

import { api, guardarUsuario } from './sesion.js';
import { mostrarAlerta, mostrarConfirmacion } from './ui.js';
import { escaparHtml } from './utiles.js';

/** Mínimo que se puede transferir. Por debajo no compensa el movimiento. */
const MINIMO_TRANSFERENCIA = 2;

/** A quién se le va a mandar, una vez confirmado que existe. */
let destinatarioConfirmado = null;

// ==================== TRANSFERENCIAS ====================

export function abrirModalTransferencia() {
    const modal = document.getElementById("modalTransferencia");
    if (!modal) {
        console.error("No se encontró el modal #modalTransferencia");
        return;
    }

    modal.classList.add("visible");
    modal.style.opacity = "1";
    modal.style.visibility = "visible";
    modal.style.pointerEvents = "all";

    const inputDest = document.getElementById("inputDestinatario");
    const inputMonto = document.getElementById("inputMontoTransferir");
    if (inputDest) inputDest.value = "";
    if (inputMonto) inputMonto.value = "";

    volverAPasoBuscar();
}

export function cerrarModalTransferencia() {
    const modal = document.getElementById("modalTransferencia");
    if (!modal) return;
    modal.classList.remove("visible");
    modal.style.opacity = "0";
    modal.style.visibility = "hidden";
    modal.style.pointerEvents = "none";
}

/** Vuelve al paso 1 (buscar) y olvida a quién se había encontrado. */
function volverAPasoBuscar() {
    const paso1 = document.getElementById("step-find-user");
    const paso2 = document.getElementById("step-amount");
    if (paso1) paso1.style.display = "block";
    if (paso2) paso2.style.display = "none";
    destinatarioConfirmado = null;
}

export function cancelarTransferencia() {
    volverAPasoBuscar();
}

/**
 * Busca al destinatario por nickname y, si existe, pasa al paso del monto.
 *
 * `boton` llega desde el despachador de acciones. Antes se leía del `event`
 * global implícito, que solo funciona en algunos navegadores.
 */
export async function verificarDestinatario(boton, usuario) {
    const inputDest = document.getElementById("inputDestinatario");
    // .trim() quita los espacios de los extremos pero respeta los de en medio,
    // que son legítimos: hay nicknames como "La Gata".
    const nickname = inputDest.value.trim();

    if (!nickname) return mostrarAlerta("Escribe un nickname", "Dato faltante");
    if (usuario && nickname === usuario.nickname) {
        return mostrarAlerta("No puedes enviarte a ti mismo", "Error");
    }

    const textoOriginal = boton ? boton.innerText : "";
    if (boton) {
        boton.innerText = "🔍 Buscando...";
        boton.disabled = true;
    }

    try {
        const res = await api(`/buscar-destinatario`, {
            method: 'POST',
            body: JSON.stringify({ nickname })
        });
        const data = await res.json();

        if (data.success) {
            destinatarioConfirmado = data.destinatario;

            document.getElementById("step-find-user").style.display = "none";
            document.getElementById("step-amount").style.display = "block";

            const msg = document.getElementById("userFoundMsg");
            // textContent y no innerHTML: el nickname lo escribe otra persona.
            if (msg) msg.textContent = `✅ Enviar a: ${destinatarioConfirmado.nickname}`;

            const inputMonto = document.getElementById("inputMontoTransferir");
            if (inputMonto) inputMonto.focus();
        } else {
            mostrarAlerta("❌ Jugador no encontrado. Verifica mayúsculas y espacios.", "No existe");
            destinatarioConfirmado = null;
        }
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error de conexión con el servidor.", "Error de Red");
    } finally {
        if (boton) {
            boton.innerText = textoOriginal;
            boton.disabled = false;
        }
    }
}

/**
 * Envía el monto al destinatario ya confirmado.
 *
 * `usuario` se MUTA al descontar el saldo, a propósito: es el mismo objeto que
 * app.js tiene como `usuarioActual`, y así el menú refleja el cobro sin esperar
 * a que el servidor conteste. `alTerminar` sirve para pedir la sincronización
 * de verdad, que es la que manda.
 */
export async function realizarTransferencia(boton, usuario, alTerminar) {
    const inputMonto = document.getElementById("inputMontoTransferir");
    const monto = parseInt(inputMonto.value);

    if (!destinatarioConfirmado) {
        return mostrarAlerta("Error interno: Destinatario perdido. Busca de nuevo.", "Error");
    }
    if (!monto || monto < MINIMO_TRANSFERENCIA) {
        return mostrarAlerta(`La transferencia mínima es de $${MINIMO_TRANSFERENCIA} monedas`, "Monto inválido");
    }
    if (!usuario || monto > usuario.monedas) {
        return mostrarAlerta("No tienes suficientes monedas", "Saldo insuficiente");
    }

    const destino = destinatarioConfirmado;

    mostrarConfirmacion(`¿Seguro que quieres enviar $${monto} monedas a ${destino.nickname}?`, async () => {
        const btnConfirmar = boton || document.querySelector("#step-amount button:last-child");
        let textoOriginal = "CONFIRMAR";
        if (btnConfirmar) {
            textoOriginal = btnConfirmar.innerText;
            btnConfirmar.innerText = "Enviando...";
            btnConfirmar.disabled = true;
        }

        try {
            const res = await api(`/transferir-saldo`, {
                method: 'POST',
                body: JSON.stringify({
                    origenEmail: usuario.email,
                    destinoEmail: destino.email,
                    cantidad: monto
                })
            });
            const data = await res.json();

            if (data.success) {
                // Descuento inmediato para que la UI responda; el servidor
                // manda la cifra buena en el siguiente 'usuario-actualizado'.
                usuario.monedas -= monto;
                guardarUsuario(usuario);

                const menuMonedas = document.getElementById("menuMonedas");
                if (menuMonedas) menuMonedas.textContent = usuario.monedas;

                cerrarModalTransferencia();
                mostrarAlerta(`🎉 ¡Enviaste $${monto} a ${destino.nickname}!`, "¡Transferencia Exitosa!");

                if (typeof alTerminar === "function") alTerminar();
            } else {
                mostrarAlerta(data.error || "Falló la transferencia", "Error");
            }
        } catch (e) {
            console.error(e);
            mostrarAlerta("Error de red al intentar transferir", "Fallo");
        } finally {
            if (btnConfirmar) {
                btnConfirmar.innerText = textoOriginal;
                btnConfirmar.disabled = false;
            }
        }
    });
}

// ==================== HISTORIAL ====================

const ICONOS = {
    recarga: '💳',
    compra: '🛒',
    apuesta: '🎲',
    victoria: '🏆',
    premio: '🎁'
};

export function abrirHistorial(usuario) {
    const modal = document.getElementById("modalHistorial");
    if (!modal) return;
    modal.classList.add("active");
    cargarMovimientos(usuario);
}

export function cerrarModalHistorial() {
    const modal = document.getElementById("modalHistorial");
    if (modal) modal.classList.remove("active");
}

async function cargarMovimientos(usuario) {
    const contenedor = document.getElementById("listaHistorial");
    if (!contenedor) return;
    contenedor.innerHTML = '<div style="padding:20px; text-align:center;">Cargando... ⏳</div>';

    if (!usuario || !usuario.email) {
        contenedor.innerHTML = '<p>Inicia sesión para ver tu historial.</p>';
        return;
    }

    try {
        const res = await api(`/historial-usuario?email=${encodeURIComponent(usuario.email)}`);
        const data = await res.json();

        if (data.success) {
            renderizarHistorial(data.movimientos);
        } else {
            contenedor.innerHTML = '<p>No se pudo cargar el historial.</p>';
        }
    } catch (e) {
        console.error(e);
        contenedor.innerHTML = '<p>Error de conexión.</p>';
    }
}

function renderizarHistorial(movimientos) {
    const contenedor = document.getElementById("listaHistorial");
    contenedor.innerHTML = "";

    if (!movimientos || movimientos.length === 0) {
        contenedor.innerHTML = '<div style="padding:20px; color:#777;">Aún no tienes movimientos.</div>';
        return;
    }

    movimientos.forEach(mov => {
        const icono = mov.tipo === 'transferencia'
            ? (mov.esIngreso ? '↙️' : '↗️')
            : (ICONOS[mov.tipo] || '📄');

        const signo = mov.esIngreso ? '+' : '-';
        const claseColor = mov.esIngreso ? 'hist-positivo' : 'hist-negativo';
        const fechaStr = mov.fecha || "---";     // el servidor ya la manda formateada

        const item = document.createElement("div");
        item.className = "item-historial";
        // La descripción de una transferencia lleva dentro el nickname del OTRO
        // jugador ("Envío a Fulano"), así que es texto escrito por una persona
        // y va escapado. Hoy el registro no admite símbolos raros, pero las
        // cuentas anteriores a esa validación pueden tener cualquier cosa, y sus
        // movimientos ya están guardados.
        item.innerHTML = `
            <div class="hist-info">
                <div class="hist-icon">${icono}</div>
                <div>
                    <div class="hist-desc">${escaparHtml(mov.descripcion)}</div>
                    <div class="hist-fecha">${escaparHtml(fechaStr)}</div>
                </div>
            </div>
            <div class="hist-monto ${claseColor}">
                ${signo}$${Number(mov.monto) || 0}
            </div>
        `;
        contenedor.appendChild(item);
    });
}
