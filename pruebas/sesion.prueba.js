/**
 * Entrar desde el Hub, y que la sesión viaje firmada.
 *
 * El SSO es el código que más veces ha fallado de este proyecto, y siempre por
 * lo mismo: **carreras**. El perfil llega por la red y el arranque decidía antes
 * de tiempo que no había sesión, sacando un login a quien acababa de entrar
 * desde el Hub. Con el arranque en frío de Render esa espera puede ser larga, así
 * que aquí la respuesta se retrasa a propósito.
 */

const { Resultados, esperar } = require('./arnes');

/** Un JWT con la forma correcta. No hace falta que valga: el cliente no lo verifica. */
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InBydWViYUBhcm5lcy5sb2NhbCJ9.firmafalsa';

module.exports = async function sesionPrueba(navegador, url) {
    const r = new Resultados('Sesión: entrar desde el Hub');

    // ---- Token bueno, con la red lenta ----
    {
        const pagina = await navegador.newPage();
        const errores = [];
        pagina.on('pageerror', e => errores.push(String(e.message)));

        await pagina.evaluateOnNewDocument(() => {
            const real = window.fetch;
            window.__pidioPerfil__ = false;
            window.fetch = (u, opts) => {
                if (String(u).includes('/usuario/datos-frescos')) {
                    window.__pidioPerfil__ = true;
                    // 900 ms de retraso: es justo la ventana donde el arranque
                    // se equivocaba y enseñaba el login.
                    return new Promise(res => setTimeout(() => res(new Response(JSON.stringify({
                        success: true, email: 'prueba@arnes.local', nickname: 'DesdeHub',
                        monedas: 777, esAdmin: false, inventario: [],
                        fichaActiva: 'assets/imagenes/ui/ficha.PNG', cartasFavoritas: []
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } })), 900));
                }
                return real(u, opts);
            };
        });

        await pagina.goto(`${url}?tk=${JWT}`, { waitUntil: 'networkidle2' });
        await esperar(3200);

        const e = await pagina.evaluate(() => ({
            pidio: window.__pidioPerfil__,
            enMenu: document.getElementById('pantallaMenu').classList.contains('activa'),
            enLogin: document.getElementById('pantallaLogin').classList.contains('activa'),
            token: !!localStorage.getItem('loteria_token'),
            nick: (JSON.parse(localStorage.getItem('loteria_usuario') || '{}')).nickname || '',
            urlLimpia: !location.search.includes('tk=')
        }));

        r.cierto('pide el perfil al servidor', e.pidio);
        r.cierto('entra directo al menú', e.enMenu);
        r.falso('NUNCA enseña el login (la carrera vieja)', e.enLogin);
        r.cierto('guarda el token para las siguientes peticiones', e.token);
        r.igual('guarda el perfil que mandó el Hub', e.nick, 'DesdeHub');
        r.cierto('quita el token de la barra de direcciones', e.urlLimpia);
        r.igual('sin errores de JS', errores.length ? errores[0].slice(0, 80) : 0, 0);
        await pagina.close();
    }

    // ---- El servidor rechaza el token ----
    {
        const pagina = await navegador.newPage();
        await pagina.evaluateOnNewDocument(() => {
            const real = window.fetch;
            window.fetch = (u, opts) => String(u).includes('/usuario/datos-frescos')
                ? Promise.resolve(new Response(JSON.stringify({ success: false }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }))
                : real(u, opts);
        });
        await pagina.goto(`${url}?tk=${JWT}`, { waitUntil: 'networkidle2' });
        await esperar(2600);

        const e = await pagina.evaluate(() => ({
            enLogin: document.getElementById('pantallaLogin').classList.contains('activa'),
            sinToken: !localStorage.getItem('loteria_token')
        }));
        r.cierto('un token rechazado lleva al login', e.enLogin);
        r.cierto('y borra el token malo', e.sinToken);
        await pagina.close();
    }

    // ---- El formato viejo `?sso=` ya no debe entrar ----
    {
        const pagina = await navegador.newPage();
        // Base64 de un perfil inventado: lo que permitía el formato sin firmar.
        const falso = Buffer.from(JSON.stringify({
            email: 'victima@ajena.com', nickname: 'Suplantado', monedas: 99999
        })).toString('base64');

        await pagina.goto(`${url}?sso=${encodeURIComponent(falso)}`, { waitUntil: 'networkidle2' });
        await esperar(3000);

        const guardado = await pagina.evaluate(() => localStorage.getItem('loteria_usuario') || '');
        r.falso('el ?sso= falsificable ya no entra', guardado.includes('Suplantado'));
        await pagina.close();
    }

    return r;
};
