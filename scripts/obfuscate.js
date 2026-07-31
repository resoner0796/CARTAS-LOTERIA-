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

/** Identificadores globales que index.html referencia desde atributos inline. */
function globalesUsadosEnHtml(html) {
    const nombres = new Set();
    for (const [, codigo] of html.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/gi)) {
        const sinCadenas = codigo.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
        for (const [, punto, nombre] of sinCadenas.matchAll(/(\.)?\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g)) {
            if (punto || IGNORAR.has(nombre)) continue;
            nombres.add(nombre);
        }
    }
    return [...nombres].sort();
}

/**
 * Un nombre sobrevive de dos formas:
 *  1. Literal, si es una función declarada al tope (renameGlobals:false las respeta).
 *  2. Codificado en el string array, si se declara como `window.compartirSala = ...`
 *     (eso cuenta como acceso a propiedad y el nombre se mueve al array).
 * Para el caso 2 el ofuscador usa base64 con alfabeto propio, no el estándar.
 * Lo extraemos del propio código generado para no hardcodearlo.
 */
function nombresPresentes(codigo) {
    const presentes = new Set();
    for (const [, c] of codigo.matchAll(/'([^'\\]{2,120})'/g)) presentes.add(c);
    for (const [, c] of codigo.matchAll(/"([^"\\]{2,120})"/g)) presentes.add(c);

    const alfabeto = (codigo.match(/'([A-Za-z0-9+/=]{65})'/) || [])[1];
    if (!alfabeto) return presentes;

    const decodificar = (entrada) => {
        let bits = '';
        const bytes = [];
        for (const ch of entrada) {
            const i = alfabeto.indexOf(ch);
            if (i < 0 || i === 64) continue;
            bits += i.toString(2).padStart(6, '0');
        }
        for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
        return Buffer.from(bytes).toString('utf8');
    };

    for (const valor of [...presentes]) {
        const d = decodificar(valor);
        if (d && /^[\x20-\x7E]+$/.test(d)) presentes.add(d);
    }
    return presentes;
}

const fuente = fs.readFileSync(ARCHIVO, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

if (/^const _0x/.test(fuente)) {
    console.error('❌ js/app.js ya viene ofuscado. Se aborta para no ofuscar dos veces.');
    process.exit(1);
}

console.log(`🔒 Ofuscando js/app.js ${enSeco ? '(simulacro, no se escribe nada)' : '(build de Vercel)'} ...`);

const codigo = JavaScriptObfuscator.obfuscate(fuente, {
    target: 'browser',
    compact: true,

    // CRÍTICO: no tocar. Ver comentario de arriba.
    renameGlobals: false,

    identifierNamesGenerator: 'hexadecimal',
    selfDefending: true,
    simplify: true,

    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,

    // Apagados a propósito: cuestan mucha CPU y esto es un juego en tiempo real
    // que corre en celulares de gama baja.
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,

    splitStrings: false,
    unicodeEscapeSequence: false
}).getObfuscatedCode();

const globales = globalesUsadosEnHtml(html);
const enCadenas = nombresPresentes(codigo);
const perdidos = globales.filter(n => !new RegExp(`\\b${n}\\b`).test(codigo) && !enCadenas.has(n));

if (perdidos.length > 0) {
    console.error('\n❌ ABORTADO: el ofuscador se comió identificadores que index.html necesita:');
    perdidos.forEach(n => console.error(`     - ${n}`));
    console.error('\n   Revisa que renameGlobals siga en false. No se escribió nada.');
    process.exit(1);
}

if (!enSeco) fs.writeFileSync(ARCHIVO, codigo);

const kb = t => (Buffer.byteLength(t) / 1024).toFixed(0);
console.log(`✅ ${kb(fuente)} KB → ${kb(codigo)} KB`);
console.log(`   ${globales.length} identificadores usados desde index.html verificados intactos.`);
if (enSeco) console.log('   (simulacro: js/app.js quedó intacto)');
