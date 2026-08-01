/**
 * Que el texto que escribe una persona no ejecute código.
 *
 * Esto ya pasó de verdad: el historial de movimientos pintaba con `innerHTML` la
 * descripción de cada apunte, y la de una transferencia lleva dentro el nickname
 * del OTRO jugador ("Envío a Fulano"). Un nickname con `<img src=x onerror=...>`
 * **se ejecutaba**. Se comprobó ejecutándolo contra el código anterior.
 *
 * Hoy el registro rechaza símbolos raros, pero las cuentas creadas antes de esa
 * validación pueden tener cualquier cosa y sus movimientos ya están guardados.
 * De ahí la regla: valida la entrada, pero **escapa siempre en la salida**.
 */

const { Resultados, abrirConSesion, esperar, clic } = require('./arnes');

/** Carga que enciende una bandera si el navegador llega a ejecutarla. */
const CARGA = '<img src=x onerror="window.__seEjecuto__=true">';

module.exports = async function escapado(navegador, url) {
    const r = new Resultados('Escapado: el texto de otros no ejecuta código');
    const pagina = await navegador.newPage();
    await abrirConSesion(pagina, url);

    await pagina.evaluate(carga => {
        window.__seEjecuto__ = false;
        const real = window.fetch;
        window.fetch = (u, opts) => {
            if (String(u).includes('/historial-usuario')) {
                return Promise.resolve(new Response(JSON.stringify({
                    success: true,
                    movimientos: [{
                        tipo: 'transferencia', esIngreso: true, monto: 50,
                        descripcion: 'Recibido de ' + carga,
                        fecha: '01/01/2026 10:00'
                    }]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            if (String(u).includes('/admin/usuarios')) {
                return Promise.resolve(new Response(JSON.stringify([
                    { nickname: carga, email: 'malo@test.local', monedas: 10 }
                ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            return real(u, opts);
        };
    }, CARGA);

    // ---- Historial de movimientos ----
    await clic(pagina, '[data-accion="abrir-historial"]', 600);
    const hist = await pagina.evaluate(() => ({
        ejecutado: window.__seEjecuto__,
        hayImg: !!document.querySelector('#listaHistorial img'),
        texto: (document.querySelector('#listaHistorial .hist-desc') || {}).textContent || ''
    }));

    r.falso('el historial NO ejecuta la carga', hist.ejecutado);
    r.falso('no se inyectó ningún <img>', hist.hayImg);
    r.cierto('el HTML se ve como texto plano', hist.texto.includes('<img src=x'));
    await clic(pagina, '[data-accion="cerrar-historial"]');

    // ---- Panel de administración ----
    await clic(pagina, '[data-accion="abrir-admin"]', 600);
    const admin = await pagina.evaluate(() => ({
        ejecutado: window.__seEjecuto__,
        hayImg: !!document.querySelector('#tablaUsuariosAdmin img'),
        texto: (document.querySelector('#tablaUsuariosAdmin td') || {}).textContent || ''
    }));

    r.falso('el panel de admin NO ejecuta la carga', admin.ejecutado);
    r.falso('tampoco inyecta un <img>', admin.hayImg);
    r.cierto('el nickname hostil se ve como texto', admin.texto.includes('<img src=x'));

    await pagina.close();
    return r;
};
