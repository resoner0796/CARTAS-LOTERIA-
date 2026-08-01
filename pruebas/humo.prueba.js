/**
 * Prueba de humo: ¿la app arranca y responde?
 *
 * Es la más importante de todas, y la más aburrida. Cubre los dos fallos que más
 * caros salieron, que tienen algo en común: **la app se veía perfecta**.
 *
 *   1. El ofuscador renombró funciones y doce botones dejaron de responder. Sin
 *      un error en consola, hasta que alguien los picaba.
 *   2. El módulo se ejecutaba antes que Socket.IO y el juego arrancaba sin
 *      conexión. Interfaz entera, cero salas, cero partidas.
 *
 * Por eso aquí se pica TODO y se mira si hubo handshake.
 */

const { Resultados, abrirConSesion, esperar, RUIDO } = require('./arnes');

module.exports = async function humo(navegador, url) {
    const r = new Resultados('Humo: la app arranca, responde y se conecta');
    const pagina = await navegador.newPage();

    const errores = [];
    const alBackend = [];
    pagina.on('pageerror', e => errores.push(String(e.message)));
    pagina.on('console', m => {
        const t = m.text();
        if (m.type() === 'error' && !RUIDO.test(t)) errores.push(t);
    });
    pagina.on('request', req => {
        if (req.url().includes('onrender')) alBackend.push(req.url());
    });

    await abrirConSesion(pagina, url);

    // La API real no está en las pruebas. Se le contesta con un 200 vacío en vez
    // de filtrar los "Failed to fetch" del informe: filtrarlos escondería también
    // los fallos de verdad, que es justo lo que esta prueba busca.
    await pagina.evaluate(() => {
        const real = window.fetch;
        const json = (cuerpo) => Promise.resolve(new Response(JSON.stringify(cuerpo),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));

        window.fetch = (u, opts) => {
            const url = String(u);
            if (!url.includes('onrender')) return real(u, opts);
            // Se responde con la FORMA que espera cada endpoint. Devolver `{}` a
            // todo hacía saltar errores que eran del stub, no del código.
            if (url.includes('/admin/usuarios')) return json([]);
            if (url.includes('/historial-usuario')) return json({ success: true, movimientos: [] });
            return json({ success: true });
        };
    });

    const inicio = await pagina.evaluate(() => {
        const conAccion = [...document.querySelectorAll('[data-accion]')];
        return {
            elementos: conAccion.length,
            acciones: [...new Set(conAccion.map(e => e.dataset.accion))],
            // Que el saldo esté pintado prueba que el código CORRIÓ, no solo que
            // se parseó: hubo que leer localStorage y tocar el DOM.
            saldo: (document.getElementById('menuMonedas') || {}).textContent || ''
        };
    });

    r.cierto('hay elementos con data-accion', inicio.elementos > 0);
    r.igual('el arranque leyó la sesión y pintó el saldo', inicio.saldo, '500');

    // Un handshake ausente = app viva por fuera, muerta por dentro.
    const handshake = alBackend.filter(u => /socket\.io\/\?/.test(u)).length;
    r.cierto('intenta conectar con el servidor (handshake)', handshake > 0);

    // Picamos cada acción distinta. Si alguna navega, recargamos y seguimos.
    const rotas = [];
    for (const accion of inicio.acciones) {
        const antes = errores.length;
        try {
            await pagina.evaluate(a => {
                const el = document.querySelector(`[data-accion="${a}"]`);
                if (el) el.click();
            }, accion);
            await esperar(70);
        } catch (e) {
            if (/context was destroyed|detached/i.test(e.message)) {
                await abrirConSesion(pagina, url);
                continue;
            }
            rotas.push(`${accion}: ${e.message}`);
        }
        const nuevos = errores.slice(antes).filter(e => !RUIDO.test(e));
        if (nuevos.length) rotas.push(`${accion} → ${nuevos[0]}`);
    }

    r.igual(`se picaron las ${inicio.acciones.length} acciones sin que reventara ninguna`,
        rotas.length ? rotas.slice(0, 3).join(' | ') : 0, 0);

    const limpios = errores.filter(e => !RUIDO.test(e));
    r.igual('sin errores de JS', limpios.length ? limpios[0].slice(0, 90) : 0, 0);

    await pagina.close();
    return r;
};
