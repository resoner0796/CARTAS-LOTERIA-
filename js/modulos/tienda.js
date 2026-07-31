// ======================================================
// TIENDA
// ======================================================
// Dos cosas distintas bajo el mismo techo:
//
//   1. Recarga de monedas con TARJETA (dinero real, vía Stripe embebido).
//   2. Compra de artículos con MONEDAS (skins de ficha y efectos de sonido).
//
// Como el resto de módulos, no lee el estado del juego: el usuario llega como
// argumento.
//
// ⚠️ Ni los precios de aquí ni los del catálogo mandan. El servidor tiene sus
// propias listas y es el único que decide cuánto se cobra; lo de este archivo
// es para pintar. Si cambias un precio, cámbialo en las dos partes.

import { catalogoSonidos, catalogoFichas, paquetesMonedas, FICHA_POR_DEFECTO } from './config.js';
import { api, guardarUsuario } from './sesion.js';
import { mostrarAlerta, mostrarConfirmacion } from './ui.js';

/** Checkout de Stripe montado ahora mismo, si lo hay. */
let checkoutStripe = null;

/** Reproductor para oír un efecto antes de comprarlo. */
const audioMuestra = new Audio();

/** Categoría abierta en el modal de detalle: 'sonidos' o 'fichas'. */
let categoriaActual = '';

/** Ficha con la que se marcan las cartas. La tienda la cambia; el juego la lee. */
let fichaActiva = FICHA_POR_DEFECTO;

export function fichaEnUso() { return fichaActiva; }
export function establecerFicha(url) { fichaActiva = url || FICHA_POR_DEFECTO; }

// ==================== RECARGA CON TARJETA ====================

export function abrirModalRecarga() {
    const modal = document.getElementById('modalTienda');
    if (!modal) return;
    modal.classList.add('active');
    volverAPaquetes();
    if (navigator.vibrate) navigator.vibrate(50);
}

export function cerrarTienda() {
    const modal = document.getElementById('modalTienda');
    if (modal) modal.classList.remove('active');
    destruirCheckout();
}

export function volverAPaquetes() {
    const seccion = document.getElementById("seccionPaquetes");
    const checkout = document.getElementById("checkout");
    const btnVolver = document.getElementById("btnVolverPaquetes");
    const titulo = document.getElementById("tituloTienda");

    if (seccion) seccion.style.display = "block";
    if (checkout) checkout.style.display = "none";
    if (btnVolver) btnVolver.style.display = "none";
    if (titulo) titulo.textContent = "Tienda de Monedas";
    destruirCheckout();
}

/** El checkout de Stripe hay que desmontarlo a mano o se queda vivo detrás. */
function destruirCheckout() {
    if (!checkoutStripe) return;
    checkoutStripe.destroy();
    checkoutStripe = null;
}

/**
 * Abre el checkout embebido de Stripe para un paquete.
 *
 * Solo se manda QUÉ paquete se quiere. El precio lo pone el servidor a partir de
 * su propio catálogo: antes viajaba en el cuerpo y se usaba tal cual, así que
 * cualquiera podía pedir 100.000 monedas por un peso.
 */
export async function iniciarPagoEmbedded(cantidadMonedas, usuario, stripe) {
    if (!usuario || !usuario.email) return mostrarAlerta("Necesitas iniciar sesión.");

    const paquete = paquetesMonedas.find(p => p.monedas === Number(cantidadMonedas));
    if (!paquete) return mostrarAlerta("Ese paquete no existe.", "Error");

    const seccion = document.getElementById("seccionPaquetes");
    const checkoutDiv = document.getElementById("checkout");
    const titulo = document.getElementById("tituloTienda");
    const btnVolver = document.getElementById("btnVolverPaquetes");

    if (seccion) seccion.style.display = "none";
    if (checkoutDiv) {
        checkoutDiv.style.display = "block";
        checkoutDiv.innerHTML = '<p style="text-align:center; padding:20px;">Cargando pago seguro...</p>';
    }
    if (titulo) titulo.textContent = "Completar Compra";
    if (btnVolver) btnVolver.style.display = "block";

    try {
        const res = await api(`/crear-orden`, {
            method: 'POST',
            body: JSON.stringify({
                cantidad: paquete.monedas,
                email: usuario.email,
                // Se declara explícitamente para que Stripe devuelva AQUÍ y no al
                // Hub si el pago se cancela. El servidor lo asume por defecto,
                // pero conviene no depender de un valor implícito cuando de eso
                // depende dónde acaba el jugador.
                origen: 'loteria'
            })
        });

        const { clientSecret } = await res.json();
        if (!clientSecret) throw new Error("No se recibió clave de pago");

        checkoutDiv.innerHTML = "";
        checkoutStripe = await stripe.initEmbeddedCheckout({ clientSecret });
        checkoutStripe.mount('#checkout');
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error al cargar el pago. Intenta de nuevo.", "Error");
        volverAPaquetes();
    }
}

// ==================== SALDO ====================

export function actualizarSaldoUI(usuario) {
    if (!usuario) return;
    const menuMonedas = document.getElementById('menuMonedas');
    const saldoTienda = document.getElementById('saldoTienda');

    if (menuMonedas) menuMonedas.textContent = usuario.monedas;
    if (saldoTienda) saldoTienda.innerHTML = `Tu saldo: <span style="color:white;">$${Number(usuario.monedas) || 0}</span>`;
}

// ==================== ARTÍCULOS ====================

export function abrirCategoriaTienda(categoria, usuario) {
    categoriaActual = categoria;
    const modal = document.getElementById("modalTiendaDetalle");
    const titulo = document.getElementById("tituloCategoriaTienda");
    const grid = document.getElementById("gridTiendaItems");
    if (!modal || !grid) return;

    modal.classList.add("active");
    grid.innerHTML = "";

    if (categoria === 'sonidos') {
        if (titulo) titulo.textContent = "Efectos de Sonido 🔊";
        renderizarSonidos(grid, usuario);
    } else if (categoria === 'fichas') {
        if (titulo) titulo.textContent = "Skins de Fichas 🟣";
        renderizarFichas(grid, usuario);
    }
}

export function cerrarModalTiendaDetalle() {
    const modal = document.getElementById("modalTiendaDetalle");
    if (modal) modal.classList.remove("active");
}

/** Repinta la categoría abierta. Se usa tras comprar o al llegar saldo nuevo. */
export function refrescarCategoria(usuario) {
    const grid = document.getElementById("gridTiendaItems");
    if (!grid) return;
    grid.innerHTML = "";
    if (categoriaActual === 'sonidos') renderizarSonidos(grid, usuario);
    if (categoriaActual === 'fichas') renderizarFichas(grid, usuario);
}

export function categoriaAbierta() { return categoriaActual; }

export function renderizarSonidos(contenedor, usuario) {
    if (!usuario) return;
    const inventario = usuario.inventario || [];

    catalogoSonidos.forEach(item => {
        const yaLoTiene = inventario.includes(item.id) || item.precio === 0;

        const div = document.createElement('div');
        div.className = "item-tienda-card";
        const btnHtml = yaLoTiene
            ? `<button class="btn-owned">✔ Listo</button>`
            : `<button class="btn-buy" data-accion="comprar-item" data-item="${item.id}" data-precio="${item.precio}">$${item.precio}</button>`;

        div.innerHTML = `
            <div style="font-size: 2rem; cursor:pointer;" data-accion="oir-sonido" data-archivo="${item.file}">${item.emoji}</div>
            <span class="item-nombre">${item.nombre}</span>
            ${btnHtml}
        `;
        contenedor.appendChild(div);
    });
}

export function renderizarFichas(contenedor, usuario) {
    if (!usuario) return;
    const inventario = usuario.inventario || [];

    catalogoFichas.forEach(item => {
        // La clásica la tiene todo el mundo: vale 0.
        const yaLoTiene = inventario.includes(item.id) || item.precio === 0;
        const esLaActiva = (item.img === fichaActiva);

        const div = document.createElement('div');
        div.className = "item-tienda-card";

        let btnHtml;
        if (esLaActiva) {
            btnHtml = `<button class="btn-use btn-active">En Uso</button>`;
        } else if (yaLoTiene) {
            btnHtml = `<button class="btn-use" data-accion="usar-ficha" data-img="${item.img}">Usar</button>`;
        } else {
            btnHtml = `<button class="btn-buy" data-accion="comprar-item" data-item="${item.id}" data-precio="${item.precio}">$${item.precio}</button>`;
        }

        div.innerHTML = `
            <img src="${item.img}" class="preview-img-tienda">
            <span class="item-nombre">${item.nombre}</span>
            ${btnHtml}
        `;
        contenedor.appendChild(div);
    });
}

export function previewSonido(ruta) {
    audioMuestra.src = ruta;
    audioMuestra.volume = 0.5;
    audioMuestra.play().catch(e => console.log("Error preview:", e));
}

/** Activa una ficha: primero en pantalla, después en la nube. */
export async function usarFicha(urlImagen, usuario) {
    if (!usuario) return;

    fichaActiva = urlImagen;
    usuario.fichaActiva = urlImagen;
    localStorage.setItem("loteria_ficha_activa", urlImagen);
    guardarUsuario(usuario);

    refrescarCategoria(usuario);
    mostrarAlerta("¡Ficha actualizada!", "Estilo Nuevo 😎");

    try {
        await api(`/usuario/guardar-preferencias`, {
            method: 'POST',
            body: JSON.stringify({ email: usuario.email, fichaActiva: urlImagen })
        });
    } catch (e) {
        // No se avisa: en pantalla ya funcionó y el siguiente arranque lo
        // recupera del localStorage. Interrumpir aquí sería peor.
        console.error("No se pudo guardar la ficha en la nube", e);
    }
}

/**
 * Compra un artículo con monedas.
 *
 * El `precio` es el que se pinta y sirve para avisar antes de gastar; el cobro
 * de verdad lo hace el servidor con su propio catálogo. Antes el precio viajaba
 * en el evento y se restaba tal cual, así que uno negativo sumaba monedas.
 */
export function comprarItem(itemId, precio, usuario, emitirCompra) {
    if (!usuario) return;

    if (usuario.monedas < precio) {
        mostrarConfirmacion("¡No tienes suficientes monedas! ¿Quieres recargar?", () => {
            cerrarModalTiendaDetalle();
            abrirModalRecarga();
        });
        return;
    }

    const cobrar = () => {
        // Descuento inmediato para que la tienda responda; el servidor manda la
        // cifra buena en el siguiente 'usuario-actualizado'.
        usuario.monedas -= precio;
        if (!usuario.inventario) usuario.inventario = [];
        usuario.inventario.push(itemId);

        actualizarSaldoUI(usuario);
        refrescarCategoria(usuario);
        emitirCompra(itemId);
    };

    if (precio > 0) {
        mostrarConfirmacion(`¿Comprar por $${precio} monedas?`, cobrar);
    } else {
        cobrar();
    }
}
