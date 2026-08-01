/**
 * Lo común a todas las pruebas: servidor, navegador y aserciones.
 *
 * Las pruebas abren la app en un Chrome de verdad y comprueban lo que se ve y lo
 * que se manda por la red. No hay unidades aisladas a propósito: los fallos que
 * ha tenido este proyecto —botones renombrados por el ofuscador, el juego
 * arrancando sin socket, una carrera al entrar desde el Hub— no se detectan
 * leyendo funciones sueltas. Se detectan ejecutando.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');

// ==================== NAVEGADOR ====================

/** Chrome del sistema. No se descarga uno: sería medio giga por un `npm i`. */
function buscarChrome() {
    const candidatos = {
        darwin: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ],
        linux: [
            '/usr/bin/google-chrome', '/usr/bin/chromium-browser',
            '/usr/bin/chromium', '/snap/bin/chromium'
        ],
        win32: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ]
    }[os.platform()] || [];

    const encontrado = candidatos.find(ruta => fs.existsSync(ruta));
    if (encontrado) return encontrado;

    throw new Error(
        'No se encontró Chrome.\n' +
        '   Estas pruebas usan el navegador que ya tienes instalado.\n' +
        '   Si lo tienes en otra ruta, exporta CHROME_BIN=/ruta/a/chrome'
    );
}

const CHROME = process.env.CHROME_BIN || buscarChrome();

// ==================== SERVIDOR ====================

const TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon'
};

/**
 * Sirve una carpeta en un puerto libre. En Node, para no depender de python.
 * Devuelve { url, cerrar }.
 */
function servirCarpeta(carpeta) {
    const servidor = http.createServer((req, res) => {
        const relativa = decodeURIComponent(req.url.split('?')[0]);
        let archivo = path.join(carpeta, relativa === '/' ? 'index.html' : relativa);

        // Nada de salirse de la carpeta servida.
        if (!archivo.startsWith(carpeta)) { res.writeHead(403).end(); return; }
        if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) {
            archivo = path.join(archivo, 'index.html');
        }
        if (!fs.existsSync(archivo)) { res.writeHead(404).end('no está'); return; }

        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
        fs.createReadStream(archivo).pipe(res);
    });

    return new Promise(resolver => {
        servidor.listen(0, '127.0.0.1', () => {
            const { port } = servidor.address();
            resolver({
                url: `http://127.0.0.1:${port}/`,
                cerrar: () => new Promise(r => servidor.close(r))
            });
        });
    });
}

/**
 * Prepara una copia del sitio tal como la publica Vercel: empaquetada por
 * esbuild y ofuscada. Es la que de verdad importa — dos de los peores fallos del
 * proyecto solo aparecían aquí y no en la fuente.
 */
function prepararCopiaDeProduccion() {
    const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'loteria-prod-'));

    for (const cosa of ['index.html', 'manifest.json', 'service-worker.js', 'package.json',
                        'js', 'css', 'scripts', 'assets', 'node_modules']) {
        const origen = path.join(RAIZ, cosa);
        if (fs.existsSync(origen)) fs.cpSync(origen, path.join(destino, cosa), { recursive: true });
    }

    // VERCEL=1 porque el script se niega a escribir fuera del contenedor de build.
    execFileSync('node', [path.join(destino, 'scripts', 'obfuscate.js')], {
        cwd: destino,
        env: { ...process.env, VERCEL: '1' },
        stdio: 'pipe'
    });

    return destino;
}

// ==================== ASERCIONES ====================

class Resultados {
    constructor(titulo) {
        this.titulo = titulo;
        this.pruebas = [];
    }

    /** Compara con ===, tras pasar los dos lados por String. */
    igual(nombre, obtenido, esperado) {
        this.pruebas.push({ nombre, obtenido, esperado, ok: String(obtenido) === String(esperado) });
    }

    cierto(nombre, condicion) {
        this.igual(nombre, !!condicion, true);
    }

    falso(nombre, condicion) {
        this.igual(nombre, !!condicion, false);
    }

    get fallos() { return this.pruebas.filter(p => !p.ok); }

    imprimir() {
        console.log(`\n  ${this.titulo}`);
        console.log('  ' + '─'.repeat(58));
        for (const p of this.pruebas) {
            console.log(`  ${p.ok ? '✅' : '❌'} ${p.nombre}`);
            if (!p.ok) console.log(`       esperaba: ${p.esperado}\n       obtuvo:   ${p.obtenido}`);
        }
    }
}

// ==================== UTILIDADES DE PÁGINA ====================

/** Sesión de mentira. Sin ella, media app sale por un usuario nulo. */
const SESION_FALSA = {
    email: 'prueba@arnes.local',
    nickname: 'Arnes',
    monedas: 500,
    inventario: ['snd_risa'],
    fichaActiva: 'assets/imagenes/ui/ficha.PNG',
    cartasFavoritas: [],
    esAdmin: true
};

/** Carga la app con sesión ya puesta y el splash superado. */
async function abrirConSesion(pagina, url, sesion = SESION_FALSA) {
    await pagina.goto(url, { waitUntil: 'domcontentloaded' });
    await pagina.evaluate(s => {
        localStorage.setItem('loteria_usuario', JSON.stringify(s));
        localStorage.setItem('loteria_token', 'token.de.prueba');
    }, sesion);
    await pagina.goto(url, { waitUntil: 'networkidle2' });
    await esperar(2300);
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

/** Pica un selector y deja un respiro para que la app reaccione. */
async function clic(pagina, selector, pausa = 300) {
    await pagina.evaluate(s => {
        const el = document.querySelector(s);
        if (el) el.click();
    }, selector);
    await esperar(pausa);
}

/**
 * Ruido que no dice nada del código.
 *
 * `Failed to fetch` merece explicación, porque parece grave y no lo es: viene
 * del handshake de Socket.IO, que el backend **rechaza a propósito** porque
 * `127.0.0.1:<puerto>` no está en su lista de orígenes permitidos. O sea, es la
 * señal de que el CORS del servidor está bien puesto.
 *
 * Lo que sí se comprueba es que el handshake se INTENTE (ver humo.prueba.js):
 * que no salga es el fallo que dejó el juego sin conexión sin que nadie lo viera.
 */
const RUIDO = /favicon|net::ERR|Failed to load resource|Failed to fetch|ERR_INTERNET|ERR_NAME|stripe|Access to fetch|CORS/i;

module.exports = {
    CHROME, RAIZ, SESION_FALSA, RUIDO,
    servirCarpeta, prepararCopiaDeProduccion,
    Resultados, abrirConSesion, esperar, clic
};
