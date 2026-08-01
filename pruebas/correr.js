#!/usr/bin/env node
/**
 * Corre todas las pruebas contra un Chrome de verdad.
 *
 *   npm test           sobre la fuente (rápido, para desarrollar)
 *   npm run test:build  sobre el bundle empaquetado y ofuscado
 *
 * La segunda es la que de verdad importa: **es el código que se publica**. Dos de
 * los peores fallos del proyecto no aparecían de otra forma —doce botones que el
 * ofuscador renombró, y el juego arrancando sin socket— porque en la fuente todo
 * iba bien.
 *
 * Las pruebas no necesitan backend: interponen `fetch` y el socket. Sí necesitan
 * red para bajar el guión de Socket.IO, que lo sirve Render.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const {
    CHROME, RAIZ, servirCarpeta, prepararCopiaDeProduccion
} = require('./arnes');

const CONTRA_BUILD = process.argv.includes('--build');

(async () => {
    let carpeta = RAIZ;
    let temporal = null;

    if (CONTRA_BUILD) {
        console.log('\n📦 Empaquetando y ofuscando, como haría Vercel...');
        try {
            temporal = prepararCopiaDeProduccion();
            carpeta = temporal;
        } catch (e) {
            console.error('\n❌ El build falló, así que no hay nada que probar:\n');
            console.error(String(e.stdout || e.message).trim());
            process.exit(1);
        }
    }

    const servidor = await servirCarpeta(carpeta);
    const navegador = await puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    console.log(`\n🧪 Pruebas sobre ${CONTRA_BUILD ? 'EL BUNDLE OFUSCADO (lo que se publica)' : 'la fuente'}`);
    console.log(`   ${servidor.url}`);

    const archivos = fs.readdirSync(__dirname)
        .filter(f => f.endsWith('.prueba.js'))
        .sort();

    const resultados = [];
    for (const archivo of archivos) {
        const prueba = require(path.join(__dirname, archivo));
        try {
            resultados.push(await prueba(navegador, servidor.url));
        } catch (e) {
            console.error(`\n  ❌ ${archivo} reventó: ${e.message}`);
            process.exitCode = 1;
        }
    }

    await navegador.close();
    await servidor.cerrar();
    if (temporal) fs.rmSync(temporal, { recursive: true, force: true });

    resultados.forEach(r => r.imprimir());

    const total = resultados.reduce((n, r) => n + r.pruebas.length, 0);
    const fallos = resultados.reduce((n, r) => n + r.fallos.length, 0);

    console.log('\n' + '═'.repeat(62));
    if (fallos === 0) {
        console.log(`  ✅ ${total} comprobaciones, todas bien`);
    } else {
        console.log(`  ❌ ${fallos} de ${total} fallaron`);
        resultados.flatMap(r => r.fallos).forEach(f => console.log(`     · ${f.nombre}`));
    }
    console.log('═'.repeat(62) + '\n');

    process.exit(fallos === 0 ? (process.exitCode || 0) : 1);
})();
