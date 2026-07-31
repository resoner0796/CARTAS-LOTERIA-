// ======================================================
// CONFIGURACIÓN
// ======================================================
// Datos que no cambian en tiempo de ejecución: direcciones, claves públicas y
// catálogos. Este módulo no importa nada y no toca el DOM a propósito: es la
// hoja del árbol, así que puede importarse desde cualquier sitio sin miedo a
// crear un ciclo.
//
// Lo que NO va aquí: referencias a elementos del DOM (dependen de que la página
// ya esté parseada) y cualquier variable que el juego reasigne mientras corre.

/** Raíz de la API REST del backend en Render. */
export const API_URL = "https://loteria-backend-3nde.onrender.com/api";

/** Mismo servidor, sin el /api: es a donde se engancha el socket. */
export const SERVIDOR = "https://loteria-backend-3nde.onrender.com";

/**
 * Clave PÚBLICA de Stripe. Va en el cliente por diseño: identifica la cuenta y
 * no autoriza cobros por sí sola. No confundir con la secreta, que vive
 * únicamente en el backend.
 */
export const STRIPE_CLAVE_PUBLICA =
    "pk_live_51SfOSHHRnABvTmoyGETt893p5wdCWGOmKQOiW4YCkbquy0Vp0mx97dVdfgXlhPszaZ40iXNFW4NveUq4Lilv83wd00gCQpzFmR";

/**
 * Paquetes de monedas que se compran con tarjeta.
 *
 * Esto es solo para PINTAR los precios. Quien decide cuánto se cobra de verdad
 * es el servidor, que tiene su propia lista: aquí solo se manda qué paquete se
 * quiere. Si cambias un precio, cámbialo también en PAQUETES_MONEDAS del
 * backend o el jugador verá uno y pagará otro.
 */
export const paquetesMonedas = [
    { monedas: 50,  precio: 29.99 },
    { monedas: 150, precio: 79.99 },
    { monedas: 500, precio: 199.99 }
];

/** Ficha que trae todo el mundo antes de comprar ninguna. */
export const FICHA_POR_DEFECTO = 'assets/imagenes/ui/ficha.PNG';

/** Sonidos del soundboard. Los de precio 0 vienen desbloqueados. */
export const catalogoSonidos = [
    { id: 'snd_risa', nombre: 'Risa', emoji: '😂', precio: 0, file: 'assets/audios/tienda/risa.mp3' },
    { id: 'snd_corneta', nombre: 'Corneta', emoji: '📯', precio: 0, file: 'assets/audios/tienda/corneta.mp3' },
    { id: 'snd_tepasas', nombre: 'Te pasas', emoji: '😒', precio: 8, file: 'assets/audios/tienda/tepasas.mp3' },
    { id: 'snd_misahorros', nombre: 'Mis Ahorros', emoji: '😭', precio: 8, file: 'assets/audios/tienda/misahorros.mp3' },
    { id: 'snd_ronquido', nombre: 'Ronquido', emoji: '😴', precio: 8, file: 'assets/audios/tienda/ronquido.mp3' },
    { id: 'snd_cuack', nombre: 'Cuack', emoji: '🦆', precio: 8, file: 'assets/audios/tienda/cuack.mp3' },
    { id: 'snd_disparo', nombre: 'Disparo', emoji: '🔫', precio: 8, file: 'assets/audios/tienda/disparo.mp3' }
];

/** Aspectos de la ficha con la que se marcan las cartas. */
export const catalogoFichas = [
    { id: 'skin_default', nombre: 'Clásica', precio: 0, img: FICHA_POR_DEFECTO },
    { id: 'skin_bitcoin', nombre: 'Bitcoin', precio: 5, img: 'assets/imagenes/ui/fichasbitcoin.png' },
    { id: 'skin_corazon', nombre: 'Corazones', precio: 5, img: 'assets/imagenes/ui/fichascorazones.png' },
    { id: 'skin_verde',   nombre: 'Verde Neon', precio: 5, img: 'assets/imagenes/ui/fichasverdes.png' },
    { id: 'skin_frijol',  nombre: 'Frijolito', precio: 5, img: 'assets/imagenes/ui/fichasfrijol.png' }
];
