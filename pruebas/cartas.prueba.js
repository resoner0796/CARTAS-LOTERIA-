#!/usr/bin/env node
/**
 * Las cartas del sistema, que ahora son DATOS y no imágenes.
 *
 * El servidor manda en `info-sala` las cartas del modo con sus barajas dentro, y
 * el cliente las pinta como una rejilla de 4×4. Antes eran archivos JPG y esta
 * pantalla componía nombres contando hasta 53.
 *
 * Lo que se comprueba aquí es justo lo que el cambio puede romper en silencio:
 * que se pinten TODAS las que manda el servidor, que cada casilla lleve la
 * baraja que le toca, que el modo esquinas deje sus huecos, y —lo más
 * importante— que no quede ni una petición a la carpeta de JPGs. Un resto de esa
 * ruta no daría error visible: pintaría un hueco roto entre cartas buenas.
 */

const { RUIDO, Resultados, abrirConSesion, esperar, clic } = require('./arnes');

/**
 * Deja preparada la captura del socket, ANTES de que se cargue nada.
 *
 * El socket real no puede conectar —el backend rechaza el origen local, y así
 * debe ser— pero la instancia existe y tiene sus escuchas puestas: es lo único
 * que hace falta para simular lo que llega del servidor.
 *
 * Hay que atraparla en el momento en que se crea. socket.io-client v4 no expone
 * sus conexiones por ningún sitio (`io.managers` es de la v2), y cuando la
 * página termina de cargar ya no hay forma de llegar a ella. Así que se pone un
 * setter en `window.io`: el guión de Socket.IO asigna ahí su función al cargar,
 * y ese es el instante en que se puede envolver `Socket.prototype.on` para
 * quedarse con la instancia en cuanto registre su primera escucha.
 */
async function prepararCaptura(pagina) {
    await pagina.evaluateOnNewDocument(() => {
        let real;
        Object.defineProperty(window, 'io', {
            configurable: true,
            get() { return real; },
            set(v) {
                real = v;
                if (v && v.Socket && !v.Socket.prototype.__capturaPuesta) {
                    v.Socket.prototype.__capturaPuesta = true;
                    const origOn = v.Socket.prototype.on;
                    v.Socket.prototype.on = function (...args) {
                        window.__socket__ = this;
                        return origOn.apply(this, args);
                    };
                }
            }
        });
    });
}

/** Se queda con todo lo que el cliente manda al servidor. */
async function espiarEnvios(pagina) {
    await pagina.evaluate(() => {
        window.__enviados__ = [];
        const socket = window.__socket__;
        const orig = socket.emit.bind(socket);
        socket.emit = function (ev, datos) {
            window.__enviados__.push({ ev, datos });
            return orig(ev, datos);
        };
    });
}

/** Dispara un evento de socket como si llegara del servidor. */
async function recibirDelServidor(pagina, evento, datos) {
    const llego = await pagina.evaluate((ev, d) => {
        const socket = window.__socket__;
        if (!socket) return 'no se capturó el socket';
        const escuchas = socket.listeners(ev);
        if (escuchas.length === 0) return `nadie escucha ${ev}`;
        // Si un escucha revienta, hay que verlo: si no, el evento parece haber
        // llegado bien y el fallo aparece cuatro comprobaciones más tarde.
        try { escuchas.forEach(fn => fn(d)); } catch (e) { return 'reventó: ' + e.message; }
        return 'ok';
    }, evento, datos);
    await esperar(400);
    return llego;
}

/** Un conjunto pequeño, con barajas que se reconocen a simple vista. */
const CARTAS_NORMAL = [
    { id: '01', cartas: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], modo: 'normal' },
    { id: '02', cartas: [17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32], modo: 'normal' },
    { id: '03', cartas: [33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48], modo: 'normal' }
];

/** Modo esquinas: solo ocho casillas llenas, el resto a null. */
const CARTAS_ESQUINAS = [
    { id: '01', cartas: [51,null,null,52,null,53,54,null,null,1,2,null,3,null,null,4], modo: 'esquinas' }
];

module.exports = async function cartas(navegador, url) {
    const r = new Resultados('Cartas del sistema: datos en vez de imágenes');
    const pagina = await navegador.newPage();

    const errores = [];
    const pedidos = [];
    pagina.on('console', m => { if (m.type() === 'error' && !RUIDO.test(m.text())) errores.push(m.text()); });
    pagina.on('request', p => pedidos.push(p.url()));

    await prepararCaptura(pagina);
    await abrirConSesion(pagina, url);

    // Se entra a una sala de verdad. Hace falta para que el botón de apostar
    // funcione: sin `partida.sala` sale por la primera guarda y no llega a
    // tocar las monedas, que es justo lo que se quiere probar.
    await pagina.evaluate(() => {
        document.getElementById('inputUnirseSala').value = 'ArnesTest';
    });
    await clic(pagina, '[data-accion="unirse-sala"]', 600);

    // ── Modo normal ──────────────────────────────────────────────────────────
    const estado = await recibirDelServidor(pagina, 'info-sala', {
        modo: 'tradicional', costo: 1, cartas: CARTAS_NORMAL
    });
    r.igual('el evento info-sala llega a quien lo escucha', estado, 'ok');

    const pintado = await pagina.evaluate(() => {
        const rejillas = [...document.querySelectorAll('#contenedorCartas .carta-seleccion')];
        const primera = rejillas[0] && rejillas[0].querySelector('.tabla-generada');
        const barajas = primera
            ? [...primera.querySelectorAll('.casilla-tabla img')]
                  .map(i => i.src.split('/').pop().replace('.png', ''))
            : [];
        return {
            cuantas: rejillas.length,
            casillas: primera ? primera.querySelectorAll('.casilla-tabla').length : 0,
            barajas: barajas.join(','),
            id: rejillas[0] && rejillas[0].querySelector('.carta-img')?.dataset.id,
            // Ni una sola <img> de la carpeta vieja de cartas.
            imagenesDeCarta: document.querySelectorAll('#contenedorCartas img[src*="imagenes/cartas"]').length
        };
    });

    r.igual('pinta todas las cartas que mandó el servidor', pintado.cuantas, 3);
    r.igual('cada una es una rejilla de 16 casillas', pintado.casillas, 16);
    r.igual('con las barajas exactas que mandó el servidor',
        pintado.barajas, '01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16');
    r.igual('conserva el id para poder elegirla', pintado.id, '01');
    r.igual('ya no pinta ninguna imagen de carta', pintado.imagenesDeCarta, 0);

    // ── Elegir una y verla en la mesa ────────────────────────────────────────
    await pagina.evaluate(() => {
        document.querySelector('#contenedorCartas .carta-img')?.click();
    });
    await esperar(300);

    const elegida = await pagina.evaluate(() => ({
        marcada: !!document.querySelector('#contenedorCartas .carta-img.seleccionada'),
        insignia: document.querySelector('#contenedorCartas .carta-seleccion .orden-carta')?.textContent
    }));
    r.cierto('al tocarla se marca como elegida', elegida.marcada);
    r.igual('y le pone el número de orden', elegida.insignia, '1');

    // La mesa se monta al entrar al juego. Se restaura el estado como haría el
    // servidor tras una recarga: es el camino que se rompía cuando las cartas
    // dejaron de ser imágenes y `info-sala` no llegaba al reconectar.
    await recibirDelServidor(pagina, 'estado-sala-restaurado', {
        enJuego: true, cartas: ['02'], apostado: false, monedas: 500
    });

    const mesa = await pagina.evaluate(() => {
        const carta = document.querySelector('#juegoCartas .carta-juego');
        const barajas = carta
            ? [...carta.querySelectorAll('.casilla-tabla img')]
                  .map(i => i.src.split('/').pop().replace('.png', ''))
            : [];
        return {
            cuantas: document.querySelectorAll('#juegoCartas .carta-juego').length,
            barajas: barajas.join(','),
            imagenesDeCarta: document.querySelectorAll('#juegoCartas img[src*="imagenes/cartas"]').length
        };
    });

    r.igual('la mesa monta la carta restaurada', mesa.cuantas, 1);
    r.igual('con las barajas que le tocan, no las de otra',
        mesa.barajas, '17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32');
    r.igual('y tampoco ahí queda una imagen de carta', mesa.imagenesDeCarta, 0);

    // ── El contador de barajas ───────────────────────────────────────────────
    const contador = () => pagina.evaluate(() =>
        document.getElementById('contadorBarajas')?.textContent || '');

    await recibirDelServidor(pagina, 'carta-cantada', '05');
    r.igual('el contador cuenta la primera baraja', await contador(), '1/54');
    await recibirDelServidor(pagina, 'carta-cantada', '06');
    await recibirDelServidor(pagina, 'carta-cantada', '07');
    r.igual('y sigue contando', await contador(), '3/54');
    r.falso('sin palabras, solo los números',
        /baraja|quedan/i.test(await contador()));

    // ── El aviso de la baraja cantada ────────────────────────────────────────
    // La mesa tiene la carta '02', que lleva las barajas 17 a 32.
    await pagina.evaluate(() => {
        document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
        document.getElementById('pantallaJuego').classList.add('activa');
    });
    await recibirDelServidor(pagina, 'carta-cantada', '17');

    const encendida = await pagina.evaluate(() =>
        document.querySelectorAll('#juegoCartas .casilla-tabla.baraja-cantada').length);
    r.igual('al cantar una baraja que tienes, su casilla late', encendida, 1);

    const cantadaNoTenida = await recibirDelServidor(pagina, 'carta-cantada', '54');
    const apagadaOtra = await pagina.evaluate(() =>
        document.querySelectorAll('#juegoCartas .casilla-tabla.baraja-cantada').length);
    r.igual('el evento de la siguiente baraja llega', cantadaNoTenida, 'ok');
    r.igual('y una que no tienes apaga la anterior', apagadaOtra, 0);

    // Se vuelve a encender y se le pone la ficha encima tocándola.
    await recibirDelServidor(pagina, 'carta-cantada', '17');
    const trasMarcar = await pagina.evaluate(() => {
        const casilla = document.querySelector('#juegoCartas .casilla-tabla.baraja-cantada');
        if (!casilla) return { latiendo: -1, fichas: -1 };
        // Se pica la baraja misma, que es lo que toca el dedo.
        casilla.querySelector('img').click();
        return {
            latiendo: document.querySelectorAll('#juegoCartas .baraja-cantada').length,
            fichas: document.querySelectorAll('#juegoCartas .ficha').length
        };
    });
    r.igual('poner la ficha encima apaga el latido', trasMarcar.latiendo, 0);
    r.igual('y la ficha se queda puesta', trasMarcar.fichas, 1);

    // ── Gritar lotería manda QUÉ CASILLAS se taparon ─────────────────────────
    // Es el dato con el que el servidor decide, y el que no se puede deducir de
    // la posición de la ficha: la rejilla tiene margen y separación.
    await espiarEnvios(pagina);

    // Se parte de la mesa limpia: viene una ficha del bloque anterior. Un clic
    // sintético sobre la baraja no la quita —el de verdad sí, porque la ficha
    // está encima— así que se quedaría contada de más.
    await pagina.evaluate(() =>
        document.querySelector('[data-accion="limpiar-fichas"]').click());
    await esperar(1200);          // lo que tarda la animación en llevárselas

    const mesaLimpia = await pagina.evaluate(() =>
        document.querySelectorAll('#juegoCartas .ficha').length);
    r.igual('Limpiar se lleva las fichas del tablero', mesaLimpia, 0);

    // Se tapan las cuatro de la fila de arriba de la carta que está en la mesa.
    await pagina.evaluate(() => {
        const casillas = document.querySelectorAll('#juegoCartas .casilla-tabla');
        [0, 1, 2, 3].forEach(i => casillas[i].querySelector('img').click());
    });
    await esperar(200);

    await pagina.evaluate(() =>
        document.querySelector('[data-accion="gritar-loteria"]').click());
    await esperar(400);

    const grito = await pagina.evaluate(() =>
        (window.__enviados__ || []).find(e => e.ev === 'loteria') || null);

    r.cierto('gritar lotería manda el evento', !!grito);
    if (grito) {
        const marcadas = grito.datos?.boardState?.marcadas?.['02'] || [];
        r.igual('con las casillas que se taparon, por su número',
            marcadas.slice().sort((a, b) => a - b).join(','), '0,1,2,3');
        r.igual('y sigue mandando la posición de las fichas para dibujarlas',
            (grito.datos?.boardState?.chips?.['02'] || []).length, 4);
    }

    // ── Apostar sin monedas avisa, en vez de no hacer nada ───────────────────
    // El navegador hace volar las monedas ANTES de saber si se aceptó: sin este
    // aviso se veía la animación, el bote no subía y no aparecía nada.
    await recibirDelServidor(pagina, 'apuesta-rechazada', {
        motivo: 'No te alcanza: 4 cartas cuestan $4 y el pozo $1. Te faltan $1.'
    });
    const sinMonedas = await pagina.evaluate(() => ({
        visible: document.getElementById('modalSistema')?.classList.contains('active'),
        texto: document.getElementById('modalSistemaMensaje')?.textContent || '',
        botonListo: !document.getElementById('btnApostar')?.disabled
    }));
    r.cierto('si no alcanza para la apuesta, avisa', sinMonedas.visible);
    r.cierto('y dice cuánto falta', sinMonedas.texto.includes('Te faltan $1'));
    r.cierto('y deja volver a intentarlo', sinMonedas.botonListo);
    await pagina.evaluate(() => document.getElementById('btnModalAceptar')?.click());
    await esperar(200);

    // ── Un grito en falso no para la partida ─────────────────────────────────
    await recibirDelServidor(pagina, 'loteria-rechazada', { motivo: 'Te faltó una para la figura' });
    const rechazo = await pagina.evaluate(() => ({
        visible: document.getElementById('modalSistema')?.classList.contains('active'),
        texto: document.getElementById('modalSistemaMensaje')?.textContent,
        conBaraja: !!document.querySelector('#modalCartaGanadora .prueba-cierre img')
    }));
    r.cierto('el servidor puede rechazar un grito en falso', rechazo.visible);
    r.igual('y se enseña por qué', rechazo.texto, 'Te faltó una para la figura');
    r.falso('sin baraja, porque no había ninguna que cazar', rechazo.conBaraja);

    await pagina.evaluate(() => document.getElementById('btnModalAceptar')?.click());
    await esperar(200);

    // Y cuando SÍ se le pasó, se le enseña cuál era.
    await recibirDelServidor(pagina, 'loteria-rechazada', {
        motivo: '¡Se te pasó! Había que gritar con esa baraja.', baraja: 17
    });
    const seLePaso = await pagina.evaluate(() => ({
        titulo: document.getElementById('modalSistemaTitulo')?.textContent || '',
        baraja: document.querySelector('#modalCartaGanadora .prueba-cierre img')?.src || '',
        // No se pinta la carta entera: solo interesa cuál era la baraja.
        casillas: document.querySelectorAll('#modalCartaGanadora .casilla-tabla').length
    }));
    r.cierto('si se te pasó, el título lo dice', seLePaso.titulo.includes('fue'));
    r.cierto('y se enseña CUÁL baraja era',
        seLePaso.baraja.endsWith('/barajas/17.png'));
    r.igual('sin pintar la carta entera, que ahí no aporta', seLePaso.casillas, 0);

    await pagina.evaluate(() => document.getElementById('btnModalAceptar')?.click());
    await esperar(200);

    // ── Modo esquinas: los huecos ────────────────────────────────────────────
    await recibirDelServidor(pagina, 'info-sala', {
        modo: 'pozo', costo: 2, cartas: CARTAS_ESQUINAS
    });

    const esquinas = await pagina.evaluate(() => {
        const rejilla = document.querySelector('#contenedorCartas .tabla-generada');
        return {
            cuantas: document.querySelectorAll('#contenedorCartas .carta-seleccion').length,
            conBaraja: rejilla ? rejilla.querySelectorAll('.casilla-tabla img').length : -1,
            vacias: rejilla ? rejilla.querySelectorAll('.casilla-vacia').length : -1
        };
    });

    r.igual('el Pozo reemplaza las cartas por las suyas', esquinas.cuantas, 1);
    r.igual('solo ocho casillas llevan baraja', esquinas.conBaraja, 8);
    r.igual('y las otras ocho quedan vacías', esquinas.vacias, 8);

    // ── El resultado final dice con qué se ganó ──────────────────────────────
    await recibirDelServidor(pagina, 'ganadores-multiples', {
        ganadores: ['Arnes'],
        premio: 40,
        pozoGanado: 0,
        ganadorPozo: null,
        prueba: {
            tabla: '02',
            nickname: 'Arnes',
            barajas: [17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
            fichas: [{ left: '12.5%', top: '12.5%' }],
            figura: 'diagonal',
            barajaFinal: 21
        }
    });

    const final = await pagina.evaluate(() => ({
        texto: document.getElementById('modalSistemaMensaje')?.textContent || '',
        cierre: document.querySelector('#modalCartaGanadora .prueba-cierre img')?.src || '',
        casillas: document.querySelectorAll('#modalCartaGanadora .casilla-tabla').length
    }));

    r.cierto('el resultado final dice por qué figura se ganó',
        final.texto.includes('diagonal'));
    r.cierto('enseña la carta ganadora como rejilla', final.casillas === 16);
    r.cierto('y la baraja con la que se cerró',
        final.cierre.endsWith('/barajas/21.png'));

    await pagina.evaluate(() => document.getElementById('btnModalAceptar')?.click());
    await esperar(200);

    // ── Los bots se ven en la lista y se distinguen ──────────────────────────
    await recibirDelServidor(pagina, 'rol-asignado', { host: true });
    await recibirDelServidor(pagina, 'jugadores-actualizados', {
        'yo':        { id: 'yo', nickname: 'Arnes', email: 'prueba@arnes.local', monedas: 500, host: true },
        'bot:uno':   { id: 'bot:uno', nickname: 'Doña Cuca', esBot: true, nivel: 'distraido', monedas: 0 },
        'bot:dos':   { id: 'bot:dos', nickname: 'El Catrín', esBot: true, nivel: 'experto', monedas: 0 }
    });

    const lista = await pagina.evaluate(() => ({
        texto: document.getElementById('jugadoresLista')?.textContent || '',
        quitar: document.querySelectorAll('#jugadoresLista [data-accion="quitar-bot"]').length,
        zonaVisible: document.getElementById('zonaBots')?.style.display
    }));

    r.cierto('los bots aparecen en la lista', lista.texto.includes('Doña Cuca'));
    r.cierto('y se distingue su nivel', lista.texto.includes('se distrae'));
    r.cierto('el experto también se marca', lista.texto.includes('experto'));
    r.igual('el anfitrión puede sacarlos', lista.quitar, 2);
    r.igual('y ve los botones para añadir', lista.zonaVisible, 'block');

    // Pedir un bot manda el evento con su nivel.
    await pagina.evaluate(() => {
        window.__enviados__ = [];
        document.querySelector('[data-accion="agregar-bot"][data-nivel="experto"]').click();
    });
    await esperar(200);
    const pedido = await pagina.evaluate(() =>
        (window.__enviados__ || []).find(e => e.ev === 'agregar-bot') || null);
    r.cierto('pedir un bot manda el evento', !!pedido);
    r.igual('con el nivel que se picó', pedido?.datos?.nivel, 'experto');

    // Quien NO es anfitrión no ve nada de esto.
    await recibirDelServidor(pagina, 'rol-asignado', { host: false });
    await recibirDelServidor(pagina, 'jugadores-actualizados', {
        'bot:uno': { id: 'bot:uno', nickname: 'Doña Cuca', esBot: true, nivel: 'normal', monedas: 0 }
    });
    const comoInvitado = await pagina.evaluate(() => ({
        zona: document.getElementById('zonaBots')?.style.display,
        quitar: document.querySelectorAll('#jugadoresLista [data-accion="quitar-bot"]').length
    }));
    r.igual('quien no es anfitrión no ve los botones de bot', comoInvitado.zona, 'none');
    r.igual('ni puede sacarlos', comoInvitado.quitar, 0);

    // ── Las monedas del saldo vuelven al cobrar ──────────────────────────────
    // El bug: con más de 40 monedas la cuadrícula está llena, así que apostar
    // no cambiaba «cuántas tocan» y el repintado se saltaba. Las monedas que
    // volaron nunca regresaban, y apuesta tras apuesta la cuadrícula se vaciaba
    // hasta cero sin recuperarse.
    const cuadricula = () => pagina.evaluate(() =>
        [...document.querySelectorAll('#saldoMonedas .moneda-saldo')]
            .filter(m => m.style.visibility !== 'hidden').length);

    const comoJugador = (monedas) => ({
        'yo': { id: 'yo', nickname: 'Arnes', email: 'prueba@arnes.local', monedas, host: true }
    });

    await recibirDelServidor(pagina, 'jugadores-actualizados', comoJugador(70));
    r.igual('con 70 monedas la cuadrícula se llena (tope 40)', await cuadricula(), 40);

    // Se apuesta DE VERDAD, picando el botón: es el camino que esconde monedas
    // sin avisar a la cuadrícula, y simularlo a mano no probaría el arreglo.
    await pagina.evaluate(() => {
        const b = document.getElementById('btnApostar');
        b.disabled = false;
        b.click();
    });
    await esperar(400);

    const trasApostar = await cuadricula();
    r.cierto('al apostar salen monedas volando de la cuadrícula',
        trasApostar > 0 && trasApostar < 40);

    // El servidor confirma el saldo: 66. Sigue por encima del tope, así que la
    // cuadrícula tiene que volver a llenarse. ESTA es la comprobación del bug:
    // sin el arreglo, `pintarSaldo` ve 40 y 40 y no repinta, así que se quedan
    // las que hay.
    await recibirDelServidor(pagina, 'jugadores-actualizados', comoJugador(66));
    r.igual('y el saldo del servidor las repone', await cuadricula(), 40);

    // Y al ganar, con el saldo más alto todavía, sigue llena.
    await recibirDelServidor(pagina, 'jugadores-actualizados', comoJugador(106));
    r.igual('al cobrar el premio sigue llena', await cuadricula(), 40);

    // Por debajo del tope la cuadrícula refleja el número exacto.
    await recibirDelServidor(pagina, 'jugadores-actualizados', comoJugador(12));
    r.igual('con 12 monedas se ven 12', await cuadricula(), 12);
    await recibirDelServidor(pagina, 'jugadores-actualizados', comoJugador(31));
    r.igual('y al subir a 31 se ven 31', await cuadricula(), 31);

    // ── Que no quede rastro de los JPG ───────────────────────────────────────
    // Se mira todo lo que la página llegó a PEDIR por red, no lo que hay en el
    // DOM: una ruta muerta se ve en el tráfico aunque no deje hueco visible.
    const jpgs = pedidos.filter(u => /imagenes\/cartas\//.test(u));
    r.igual('en toda la sesión no se pidió ni un JPG de carta', jpgs.length, 0);

    // ── En el móvil las cuatro cartas no se pisan ────────────────────────────
    // La rejilla no tenía `box-sizing: border-box`, así que su margen blanco y
    // su filo se SUMABAN al 100% y desbordaban el hueco 22px. Con cuatro cartas
    // en el tablero del móvil el espacio entre ellas medía -12px: se solapaban.
    await pagina.setViewport({ width: 390, height: 844 });
    await recibirDelServidor(pagina, 'info-sala', {
        modo: 'tradicional', costo: 1,
        cartas: ['01', '02', '03', '04'].map(id => ({
            id, cartas: Array.from({ length: 16 }, (_, i) => i + 1), modo: 'normal'
        }))
    });
    await recibirDelServidor(pagina, 'estado-sala-restaurado', {
        enJuego: true, cartas: ['01', '02', '03', '04'], apostado: true, monedas: 50
    });

    const enMovil = await pagina.evaluate(() => {
        const g = [...document.querySelectorAll('#juegoCartas .tabla-generada')]
            .map(x => x.getBoundingClientRect());
        if (g.length < 4) return { cuantas: g.length };
        return {
            cuantas: g.length,
            horizontal: Math.round(g[1].left - (g[0].left + g[0].width)),
            vertical: Math.round(g[2].top - (g[0].top + g[0].height))
        };
    });

    r.igual('el tablero del móvil pone las cuatro cartas', enMovil.cuantas, 4);
    r.cierto('con espacio horizontal entre ellas, no encimadas',
        enMovil.horizontal >= 8);
    r.cierto('y espacio vertical también', enMovil.vertical >= 8);

    r.cierto('sin errores de JS', errores.length === 0);
    if (errores.length) console.log('       ' + errores.join('\n       '));

    await pagina.close();
    return r;
};
