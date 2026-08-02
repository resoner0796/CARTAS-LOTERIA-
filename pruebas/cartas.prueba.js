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

const { RUIDO, Resultados, abrirConSesion, esperar } = require('./arnes');

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

    // ── Que no quede rastro de los JPG ───────────────────────────────────────
    // Se mira todo lo que la página llegó a PEDIR por red, no lo que hay en el
    // DOM: una ruta muerta se ve en el tráfico aunque no deje hueco visible.
    const jpgs = pedidos.filter(u => /imagenes\/cartas\//.test(u));
    r.igual('en toda la sesión no se pidió ni un JPG de carta', jpgs.length, 0);

    r.cierto('sin errores de JS', errores.length === 0);
    if (errores.length) console.log('       ' + errores.join('\n       '));

    await pagina.close();
    return r;
};
