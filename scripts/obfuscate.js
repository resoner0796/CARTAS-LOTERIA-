#!/usr/bin/env node
/**
 * Ofusca js/app.js DURANTE EL BUILD DE VERCEL, en el contenedor de despliegue.
 *
 * El repo guarda siempre la versión legible. Nunca se commitea código ofuscado:
 * Vercel clona, corre esto (que reescribe js/app.js dentro de SU copia efímera)
 * y publica el resultado. Tu working tree local nunca se toca.
 *
 *   Vercel:  npm run build      (definido en vercel.json)
 *   Local:   npm run build:dry  (no escribe nada, solo comprueba que todo salga bien)
 *
 * ⚠️ renameGlobals va en false. index.html llama funciones desde atributos inline
 * (onclick="login()"); si el ofuscador las renombra, los botones dejan de servir sin
 * que salte ningún error hasta que un usuario los pica. Por eso al final verificamos
 * que cada identificador que el HTML necesita siga existiendo en la salida.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO = path.join(RAIZ, 'js', 'app.js');
const HTML = path.join(RAIZ, 'index.html');

const enSeco = process.argv.includes('--dry');
const enVercel = !!process.env.VERCEL;

// Salvavidas: escribir en el repo local dejaría tu fuente ofuscada de forma
// permanente. Solo escribimos dentro del contenedor de Vercel.
if (!enSeco && !enVercel) {
    console.error('❌ Esto reescribe js/app.js en el sitio y solo debe correr en Vercel.');
    console.error('   Si querías probarlo aquí, usa: npm run build:dry');
    process.exit(1);
}

const IGNORAR = new Set([
    'this', 'true', 'false', 'null', 'undefined', 'return', 'if', 'else', 'new',
    'typeof', 'void', 'delete', 'in', 'of', 'function', 'var', 'let', 'const',
    'window', 'document', 'event', 'console', 'Math', 'JSON', 'String', 'Number',
    'Boolean', 'Array', 'Object', 'Date', 'parseInt', 'parseFloat', 'alert'
]);

/**
 * Identificadores globales invocados desde atributos inline (onclick="...").
 *
 * ⚠️ Hay que mirar en DOS sitios, no solo en index.html:
 *   1. El propio HTML.
 *   2. El JS, porque genera HTML en caliente con plantillas que llevan sus
 *      propios onclick dentro:  `<div onclick="abrirJuegoPWA('${url}')">`
 *
 * Mirar solo el HTML dejó fuera esas funciones, el ofuscador las renombró y los
 * botones generados dinámicamente (tienda, catálogo de juegos, panel de admin)
 * dejaron de responder en producción sin un solo error hasta que alguien los
 * picaba. De ahí que ahora se escaneen ambas fuentes y las dos formas de comilla.
 */
function globalesUsadosEnAtributos(...fuentes) {
    const nombres = new Set();
    const recolectar = (codigo) => {
        const sinCadenas = codigo.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
        for (const [, punto, nombre] of sinCadenas.matchAll(/(\.)?\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g)) {
            if (punto || IGNORAR.has(nombre)) continue;
            nombres.add(nombre);
        }
    };
    for (const texto of fuentes) {
        if (!texto) continue;
        // El prefijo NO puede exigir un espacio: dentro del JS el atributo suele
        // arrancar pegado a la comilla que abre la plantilla, como en
        // `` `onclick="abrirJuegoPWA('${url}')"` ``. Exigir espacio dejaba fuera
        // justo esos casos, y la verificación no lo delataba porque solo
        // comprueba los nombres que este escáner encuentra.
        for (const [, codigo] of texto.matchAll(/(?:^|[^A-Za-z0-9_$])on[a-z]+\s*=\s*"([^"]*)"/gim)) recolectar(codigo);
        for (const [, codigo] of texto.matchAll(/(?:^|[^A-Za-z0-9_$])on[a-z]+\s*=\s*'([^']*)'/gim)) recolectar(codigo);
    }
    return [...nombres].sort();
}

/**
 * Ejecuta el bundle ya ofuscado en un DOM simulado y comprueba que cada nombre
 * que index.html necesita siga resolviéndose.
 *
 * Buscar los nombres como texto en la salida no sirve: con rc4 y splitStrings las
 * cadenas quedan troceadas y cifradas, así que un nombre presente y funcional
 * puede no aparecer nunca literalmente. Ejecutarlo es la única forma confiable, y
 * de paso detecta si el bundle revienta al cargar.
 *
 * Usamos `typeof <nombre>` dentro del mismo contexto en vez de mirar propiedades
 * del objeto global, porque las declaraciones `let`/`const` del tope no cuelgan de
 * window: viven en el ámbito léxico global, que es justo por donde los resuelve un
 * atributo inline como onclick="...".
 */
function verificarEjecutando(codigo, nombres) {
    const elemento = () => new Proxy({
        style: {}, dataset: {}, children: [], innerHTML: '', textContent: '',
        innerText: '', value: '', disabled: false, src: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, removeChild() {}, remove() {}, insertBefore() {},
        prepend() {}, addEventListener() {}, focus() {}, scrollTo() {},
        querySelector: () => elemento(), querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    }, { get: (t, p) => (p in t ? t[p] : undefined), set: (t, p, v) => (t[p] = v, true) });

    const guardado = {};
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            getElementById: () => elemento(), querySelector: () => elemento(),
            querySelectorAll: () => [], createElement: () => elemento(),
            body: elemento(), title: 't', addEventListener() {}
        },
        localStorage: {
            getItem: k => (k in guardado ? guardado[k] : null),
            setItem: (k, v) => { guardado[k] = String(v); },
            removeItem: k => { delete guardado[k]; }
        },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: { vibrate() {}, share: null, clipboard: { writeText: () => Promise.resolve() } },
        location: { search: '', pathname: '/', origin: 'https://x.test', href: 'https://x.test/' },
        history: { replaceState() {}, pushState() {} },
        fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
        addEventListener() {}, removeEventListener() {},
        Audio: function () { return { play: () => Promise.resolve(), pause() {}, currentTime: 0, volume: 1 }; },
        Stripe: () => ({ initEmbeddedCheckout: async () => ({ mount() {}, destroy() {} }) }),
        io: () => ({ on() {}, emit() {}, connected: false, id: 'x' }),
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        btoa: s => Buffer.from(s, 'binary').toString('base64'),
        URLSearchParams, Promise, JSON, Math, Date, Object, Array, String, Number, RegExp, Error
    };
    ctx.window = ctx;
    ctx.self = ctx;
    vm.createContext(ctx);

    try {
        vm.runInContext(codigo, ctx, { timeout: 20000 });
    } catch (e) {
        return { reventó: e.message, faltantes: [] };
    }

    const faltantes = nombres.filter(n => {
        try {
            return vm.runInContext(`typeof ${n}`, ctx, { timeout: 2000 }) === 'undefined';
        } catch {
            return true;
        }
    });
    return { reventó: null, faltantes };
}

const fuente = fs.readFileSync(ARCHIVO, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

if (/^const _0x/.test(fuente)) {
    console.error('❌ js/app.js ya viene ofuscado. Se aborta para no ofuscar dos veces.');
    process.exit(1);
}

const globales = globalesUsadosEnAtributos(html, fuente);

console.log(`🔒 Ofuscando js/app.js ${enSeco ? '(simulacro, no se escribe nada)' : '(build de Vercel)'} ...`);

const codigo = JavaScriptObfuscator.obfuscate(fuente, {
    target: 'browser',
    compact: true,

    // Renombramos TODO lo global salvo lo que index.html invoca por nombre desde
    // sus atributos inline. Esa lista se calcula del propio HTML, así que si mañana
    // agregas un onclick nuevo queda protegido solo.
    renameGlobals: true,
    reservedNames: globales.map(n => `^${n}$`),

    identifierNamesGenerator: 'mangled-shuffled',
    selfDefending: true,
    simplify: true,

    // Cadenas: rc4 en vez de base64, partidas en trozos y con envoltorios
    // intermedios para que no baste con decodificar el array de un jalón.
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    stringArrayCallsTransform: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersType: 'function',
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: true,
    splitStringsChunkLength: 8,

    numbersToExpressions: true,
    transformObjectKeys: true,

    // Aplanado de flujo moderado: encarece mucho la lectura, pero cuesta CPU y
    // esto es un juego en tiempo real que corre en celulares de gama baja.
    // 0.4 es el punto donde estorba al que curiosea sin que se sienta al jugar.
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.4,

    // deadCodeInjection infla el archivo a lo bestia y debugProtection puede
    // colgar el navegador. No compensan.
    deadCodeInjection: false,
    debugProtection: false,

    unicodeEscapeSequence: false
}).getObfuscatedCode();
// index.html puede invocar funciones definidas en sus propios bloques <script>
// inline, que no viven en este archivo. Solo verificamos lo que la fuente define.
// Solo verificamos nombres declarados al PRIMER NIVEL del archivo (sin sangría).
// Los atributos inline llevan dentro variables locales del bucle que los genera
// —`onclick="comprarItem('${item.id}')"`— y esas nunca existen en el ámbito
// global, así que buscarlas ahí daría una falsa alarma. Reservarlas no estorba;
// verificarlas sí.
const definidosAqui = globales.filter(n =>
    new RegExp(`^(?:async\\s+)?(?:function|var|let|const)\\s+${n}\\b|^window\\.${n}\\s*=`, 'm').test(fuente)
);

const { reventó, faltantes } = verificarEjecutando(codigo, definidosAqui);

if (reventó) {
    console.error(`\n❌ ABORTADO: el bundle ofuscado revienta al cargar:\n     ${reventó}`);
    console.error('   No se escribió nada.');
    process.exit(1);
}
if (faltantes.length > 0) {
    console.error('\n❌ ABORTADO: el ofuscador se comió identificadores que index.html necesita:');
    faltantes.forEach(n => console.error(`     - ${n}`));
    console.error('\n   Revisa que estén en reservedNames. No se escribió nada.');
    process.exit(1);
}

// Cuánto se expone realmente: de todas las funciones declaradas al tope en la
// fuente, ¿cuántas conservan su nombre en la salida?
const declaradas = [...fuente.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
const unicas = [...new Set(declaradas)];
const expuestas = unicas.filter(n => new RegExp(`\\b${n}\\b`).test(codigo));

if (!enSeco) fs.writeFileSync(ARCHIVO, codigo);

const kb = t => (Buffer.byteLength(t) / 1024).toFixed(0);
console.log(`✅ ${kb(fuente)} KB → ${kb(codigo)} KB`);
console.log(`   ${definidosAqui.length} de los ${globales.length} identificadores invocados desde atributos inline se definen aquí: verificados intactos.`);
console.log(`   Funciones declaradas en la fuente: ${unicas.length}`);
console.log(`   De esas, siguen con su nombre visible: ${expuestas.length} (las que el HTML invoca)`);
if (expuestas.length > globales.length) {
    console.log('   ⚠️ Hay más nombres visibles de los reservados. Revisa renameGlobals.');
}
if (enSeco) console.log('   (simulacro: js/app.js quedó intacto)');
