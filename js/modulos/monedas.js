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

/**
 * A partir de aquí el pozo late.
 *
 * Diez es donde deja de parecer calderilla: son diez partidas con alguien
 * apuntado, o menos si se apuntan varios. Por debajo no merece llamar la
 * atención; por encima, es el premio gordo de la mesa.
 */
const POZO_LLAMATIVO = 10;

const IMAGEN = 'assets/imagenes/ui/peso.png';

/** Golpecito de la torre al recibir monedas. */
function rebotar(contenedor) {
    contenedor.classList.remove('recibe-monedas');
    void contenedor.offsetWidth;          // reinicia la animación
    contenedor.classList.add('recibe-monedas');
    setTimeout(() => contenedor.classList.remove('recibe-monedas'), 420);
}

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

    const valor = Math.max(0, Math.floor(Number(cantidad) || 0));
    const cuantas = Math.min(valor, tope);

    // Se recuerda el VALOR, no las monedas pintadas. Parece lo mismo y no lo es:
    // pasado el tope la torre deja de crecer, así que un pozo de 26 y otro de 30
    // pintan 25 monedas los dos. Comparando lo pintado, el segundo cambio se
    // daba por "sin novedad" y nada de lo que dependa del valor real se
    // enteraría.
    const antes = Number(contenedor.dataset.valor || 0);
    if (contenedor.dataset.valor === String(valor)) return;
    contenedor.dataset.valor = String(valor);

    // El pozo cambia de aspecto según lo gordo que sea. Va antes de pintar
    // porque no depende de las monedas, sino de cuánto hay dentro.
    if (contenedor.classList.contains('pozo-monedas')) {
        contenedor.classList.toggle('pozo-crecido', valor >= POZO_LLAMATIVO && valor < tope);
        contenedor.classList.toggle('pozo-lleno', valor >= tope);
    }

    // Si CRECIÓ, da un golpecito: es lo que remata el vuelo de monedas que salió
    // del saldo al apostar. Solo al crecer — al repartirse, el bote baja a cero
    // y ahí no hay nada que celebrar.
    if (valor > antes) rebotar(contenedor);

    // Repintar la torre solo si cambia el número de monedas: entre 26 y 30 se
    // ven iguales y rehacerlas haría parpadear la pila sin motivo.
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
