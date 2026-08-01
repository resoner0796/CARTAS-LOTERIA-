// ======================================================
// PILAS DE MONEDAS
// ======================================================
// El bote y el pozo enseñan tantas monedas como dinero hay dentro, en vez de
// tres fijas. Cada tabla apostada es $1, así que un bote de 8 son ocho monedas
// que se ven crecer.
//
// El sitio donde caben es MUY pequeño —46×46 px en un móvil— así que la pila se
// compacta sola: con pocas monedas se separan y se distinguen una a una; con
// muchas se juntan y forman una torre. Así nunca se sale del hueco ni hace falta
// tocar el layout, que en este proyecto ya se rompió una vez.

/** Alto en píxeles que puede ocupar la torre. Es lo que hay en móvil. */
const ALTO_DISPONIBLE = 34;

/** Separación máxima entre monedas. Con pocas, se ven despegadas. */
const SEPARACION_MAXIMA = 5;

/** Ni una moneda por peso hasta el infinito: a partir de aquí, la torre se queda. */
export const TOPE_MONEDAS_POZO = 25;
const TOPE_POR_DEFECTO = TOPE_MONEDAS_POZO;

const IMAGEN = 'assets/imagenes/ui/peso.png';

/**
 * Pinta una torre de monedas dentro de `contenedor`.
 *
 * @param contenedor  el .bote-monedas donde va la pila
 * @param cantidad    cuánto dinero hay (una moneda por unidad)
 * @param tope        cuántas monedas como mucho (el pozo llega a 25)
 *
 * Se respeta el `<strong>` con la cifra, que vive en el mismo contenedor: solo
 * se quitan y ponen las imágenes.
 */
export function pintarMonedas(contenedor, cantidad, tope = TOPE_POR_DEFECTO) {
    if (!contenedor) return;

    const cuantas = Math.max(0, Math.min(Math.floor(Number(cantidad) || 0), tope));

    // Si no cambia el número, no se repinta: esto se llama en cada evento del
    // socket y rehacer la torre a cada rato hace parpadear las monedas.
    if (contenedor.dataset.monedas === String(cuantas)) return;
    contenedor.dataset.monedas = String(cuantas);

    contenedor.querySelectorAll('img.moneda-bote').forEach(m => m.remove());
    if (cuantas === 0) return;

    // Cuantas más monedas, más juntas: así la torre siempre cabe en el hueco.
    const separacion = Math.min(SEPARACION_MAXIMA, ALTO_DISPONIBLE / cuantas);

    for (let i = 0; i < cuantas; i++) {
        const moneda = document.createElement('img');
        moneda.src = IMAGEN;
        moneda.alt = '';
        moneda.className = 'moneda-bote';
        // La de abajo es la primera; cada siguiente sube un poco y queda por
        // encima, que es como se apilan las de verdad.
        moneda.style.bottom = `${i * separacion}px`;
        moneda.style.zIndex = String(i + 1);
        // Un ladeo mínimo y alterno para que no parezca un bloque perfecto: las
        // monedas de verdad nunca quedan alineadas. Va por `transform` y NO por
        // `margin-left`, que es lo que el CSS usa para centrar la torre: un
        // estilo en línea lo pisaba y toda la pila salía corrida a un lado.
        const ladeo = Math.min(1.5, separacion / 2);
        moneda.style.transform = `translateX(${(i % 2 === 0 ? -ladeo : ladeo)}px)`;
        contenedor.appendChild(moneda);
    }
}
