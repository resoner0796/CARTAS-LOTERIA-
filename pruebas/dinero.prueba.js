/**
 * Lo que toca dinero: qué manda el cliente al comprar y al transferir.
 *
 * El servidor ya no acepta que el navegador le diga cuánto cuestan las cosas
 * —tiene sus propios catálogos— pero conviene que el cliente tampoco lo intente:
 * si alguien vuelve a meter el precio en la petición, es señal de que se olvidó
 * por qué se quitó.
 *
 * También cubre las validaciones que deben rebotar SIN llegar al servidor.
 */

const { Resultados, abrirConSesion, esperar, clic } = require('./arnes');

module.exports = async function dinero(navegador, url) {
    const r = new Resultados('Dinero: compras, pagos y transferencias');
    const pagina = await navegador.newPage();
    await abrirConSesion(pagina, url);

    // Interponemos red y socket para no tocar el backend real.
    await pagina.evaluate(() => {
        window.__peticiones__ = [];
        window.__emits__ = [];

        const real = window.fetch;
        window.fetch = (u, opts = {}) => {
            let cuerpo = null;
            try { cuerpo = opts.body ? JSON.parse(opts.body) : null; } catch {}
            window.__peticiones__.push({ url: String(u), cuerpo });

            if (String(u).includes('/crear-orden')) {
                return Promise.resolve(new Response(JSON.stringify({ clientSecret: 'cs_falso' }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            if (String(u).includes('/buscar-destinatario')) {
                return Promise.resolve(new Response(JSON.stringify({
                    success: true, destinatario: { email: 'otro@test.local', nickname: 'Fulano' }
                }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            return real(u, opts);
        };

        if (window.io && window.io.Socket) {
            const orig = window.io.Socket.prototype.emit;
            window.io.Socket.prototype.emit = function (ev, datos) {
                window.__emits__.push({ ev, datos });
                return orig.apply(this, arguments);
            };
        }
    });

    // ---- Recarga con tarjeta ----
    await clic(pagina, '[data-accion="abrir-recarga"]');
    await clic(pagina, '[data-accion="pagar"][data-monedas="150"]', 500);

    const orden = await pagina.evaluate(() =>
        (window.__peticiones__ || []).find(p => p.url.includes('/crear-orden')) || null);

    r.cierto('pide la orden de pago al servidor', !!orden);
    if (orden) {
        r.igual('manda qué paquete quiere', orden.cuerpo.cantidad, 150);
        r.falso('NO manda el precio (lo pone el servidor)', 'precio' in orden.cuerpo);
        r.igual('declara el origen, para el retorno de Stripe', orden.cuerpo.origen, 'loteria');
    }
    await clic(pagina, '[data-accion="cerrar-tienda"]');

    // ---- Compra con monedas ----
    await pagina.evaluate(() => {
        const b = document.querySelector('[data-accion="tienda-categoria"][data-categoria="sonidos"]');
        if (b) b.click();
    });
    await esperar(400);

    await pagina.evaluate(() => { window.__emits__ = []; });
    await clic(pagina, '#gridTiendaItems .btn-buy');

    const antesDeAceptar = await pagina.evaluate(() => ({
        pregunta: document.getElementById('modalSistema').classList.contains('active'),
        yaEmitio: (window.__emits__ || []).some(e => e.ev === 'comprar-item')
    }));
    r.cierto('la compra pide confirmación', antesDeAceptar.pregunta);
    r.falso('y no cobra hasta que aceptas', antesDeAceptar.yaEmitio);

    await clic(pagina, '#btnModalAceptar');
    const compra = await pagina.evaluate(() =>
        (window.__emits__ || []).find(e => e.ev === 'comprar-item') || null);

    if (compra) {
        r.cierto('al aceptar manda qué artículo', !!compra.datos.itemId);
        r.falso('NO manda el precio (lo pone el servidor)', 'precio' in compra.datos);
    }
    await clic(pagina, '[data-accion="cerrar-tienda-detalle"]');

    // ---- Transferencias: lo que debe rebotar sin salir a la red ----
    await clic(pagina, '[data-accion="abrir-transferencia"]');

    await pagina.evaluate(() => {
        window.__peticiones__ = [];
        document.getElementById('inputDestinatario').value = 'Arnes';   // uno mismo
    });
    await clic(pagina, '[data-accion="buscar-destinatario"]');
    const propio = await pagina.evaluate(() => ({
        aviso: document.getElementById('modalSistemaTitulo').textContent,
        llamo: (window.__peticiones__ || []).some(p => p.url.includes('/buscar-destinatario'))
    }));
    r.igual('rechaza enviarse monedas a uno mismo', propio.aviso, 'Error');
    r.falso('sin llegar a preguntarle al servidor', propio.llamo);
    await clic(pagina, '#btnModalAceptar');

    await pagina.evaluate(() => { document.getElementById('inputDestinatario').value = 'Fulano'; });
    await clic(pagina, '[data-accion="buscar-destinatario"]');
    r.cierto('al encontrar al destinatario pasa al monto',
        await pagina.evaluate(() => document.getElementById('step-amount').style.display === 'block'));

    await pagina.evaluate(() => {
        window.__peticiones__ = [];
        document.getElementById('inputMontoTransferir').value = '1';    // bajo el mínimo
    });
    await clic(pagina, '[data-accion="transferir"]');
    const minimo = await pagina.evaluate(() => ({
        aviso: document.getElementById('modalSistemaTitulo').textContent,
        llamo: (window.__peticiones__ || []).some(p => p.url.includes('/transferir-saldo'))
    }));
    r.igual('rechaza montos bajo el mínimo', minimo.aviso, 'Monto inválido');
    r.falso('sin llegar a pedir la transferencia', minimo.llamo);
    await clic(pagina, '#btnModalAceptar');

    await pagina.evaluate(() => { document.getElementById('inputMontoTransferir').value = '99999'; });
    await clic(pagina, '[data-accion="transferir"]');
    r.igual('rechaza transferir más de lo que hay',
        await pagina.evaluate(() => document.getElementById('modalSistemaTitulo').textContent),
        'Saldo insuficiente');

    await pagina.close();
    return r;
};
