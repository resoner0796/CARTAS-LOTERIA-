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

/**
 * Radio del montón, por si no se puede medir el contenedor.
 *
 * Normalmente se calcula del tamaño real, para que el montón se adapte solo a
 * móvil y a escritorio sin duplicar medidas aquí y en el CSS. Este valor solo
 * entra cuando el contenedor está oculto y mide 0.
 */
const RADIO_DE_RESERVA = 22;

/**
 * Ángulo áureo, en grados.
 *
 * Es el que usan las semillas de un girasol: colocando cada moneda a este
 * ángulo de la anterior, nunca se alinean en filas ni dejan huecos. Repartirlas
 * en anillos regulares deja patrones que se ven artificiales.
 */
const ANGULO_AUREO = 137.5;

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

    // El montón se abre desde el centro hacia fuera. La raíz cuadrada reparte
    // las monedas por igual sobre el área: sin ella se amontonan todas en el
    // borde, porque un anillo lejano tiene mucho más sitio que uno cercano.
    //
    // Con pocas monedas el montón queda chico y se cuentan de un vistazo; con
    // muchas se abre hasta el borde y se solapan, que es como se ve un montón de
    // monedas de verdad.
    // El radio sale del tamaño REAL del contenedor, no de un número fijo: así
    // el montón se adapta solo entre móvil y escritorio y no hay que mantener
    // la misma medida en dos sitios. Si está oculto mide 0 y se usa la reserva.
    const caja = contenedor.getBoundingClientRect();
    const radioDisponible = caja.width > 0 ? (caja.width / 2) - 3 : RADIO_DE_RESERVA;

    // Con pocas monedas el montón queda chico y se cuentan de un vistazo; a
    // partir de unas cuantas se abre del todo y empiezan a solaparse. El
    // multiplicador manda cuánto se despegan: subirlo las separa más.
    const radio = Math.min(radioDisponible, 6.4 * Math.sqrt(cuantas));

    for (let i = 0; i < cuantas; i++) {
        const moneda = document.createElement('img');
        moneda.src = IMAGEN;
        moneda.alt = '';
        moneda.className = 'moneda-bote';

        const distancia = cuantas === 1 ? 0 : radio * Math.sqrt(i / (cuantas - 1));
        const angulo = i * ANGULO_AUREO * (Math.PI / 180);
        const x = distancia * Math.cos(angulo);
        // Se achata en vertical: un círculo perfecto se lee como una diana;
        // aplastado parece un montón visto en perspectiva, apoyado en la mesa.
        const y = distancia * Math.sin(angulo) * 0.62;

        // Las de fuera van detrás y las del centro delante, como se ve un montón
        // desde arriba. Un giro distinto en cada una remata el desorden.
        moneda.style.left = '50%';
        moneda.style.top = '50%';
        moneda.style.zIndex = String(Math.round(100 - distancia * 4));
        moneda.style.transform =
            `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${(i * 47) % 360}deg)`;
        contenedor.appendChild(moneda);
    }
}


// ======================================================
// LAS MONEDAS DEL SALDO
// ======================================================

/**
 * Diez por columna, cuatro columnas.
 *
 * Las monedas se apilan HACIA ARRIBA dentro de cada columna, como pilas puestas
 * en la mesa una al lado de otra. Se probó en filas horizontales y no servía:
 * cuarenta monedas en fila ocupaban demasiado ancho y no se leían como dinero.
 */
const POR_COLUMNA = 10;
const COLUMNAS = 4;

/**
 * Tope de monedas que se enseñan del saldo.
 *
 * No es un tope del dinero: alguien con 70 ve cuarenta, y cuando gasta treinta
 * y le quedan cuarenta las sigue viendo todas. Al bajar de cuarenta, la
 * cuadrícula empieza a vaciarse de verdad. Así el montón significa algo en el
 * tramo donde se juega, en vez de crecer sin parar hasta llenar la pantalla.
 */
export const TOPE_MONEDAS_SALDO = POR_COLUMNA * COLUMNAS;

/** Tope de monedas que vuelan a la vez. Más que esto no se distinguen. */
const MAXIMO_VOLANDO_SALDO = 8;

/**
 * Pinta el saldo del jugador como pilas de monedas.
 *
 * Se llenan columnas completas de izquierda a derecha: 35 monedas son tres pilas
 * de diez y una de cinco. Dentro de cada pila se solapan, como monedas de verdad
 * una encima de otra.
 */
export function pintarSaldo(contenedor, cantidad) {
    if (!contenedor) return;

    const valor = Math.max(0, Math.floor(Number(cantidad) || 0));
    const cuantas = Math.min(valor, TOPE_MONEDAS_SALDO);

    if (contenedor.dataset.saldo === String(cuantas)) return;
    const antes = Number(contenedor.dataset.saldo || 0);
    contenedor.dataset.saldo = String(cuantas);

    contenedor.innerHTML = '';
    if (cuantas === 0) return;

    for (let col = 0; col < COLUMNAS; col++) {
        const enEstaPila = Math.min(POR_COLUMNA, cuantas - col * POR_COLUMNA);
        if (enEstaPila <= 0) break;

        const pila = document.createElement('div');
        pila.className = 'pila-monedas';

        for (let i = 0; i < enEstaPila; i++) {
            const moneda = document.createElement('img');
            moneda.src = IMAGEN;
            moneda.alt = '';
            moneda.className = 'moneda-saldo';
            // Las de abajo por encima: es como se ve una pila apoyada, con la
            // última puesta tapando el canto de la anterior.
            moneda.style.zIndex = String(POR_COLUMNA - i);
            // El brillo recorre las pilas en vez de encenderse todas a la vez.
            moneda.style.animationDelay = `${(col * POR_COLUMNA + i) * 0.05}s`;
            pila.appendChild(moneda);
        }
        contenedor.appendChild(pila);
    }

    // Al cobrar algo, la cuadrícula da un golpecito. Al gastar no: ahí ya hay
    // monedas volando hacia el bote y dos animaciones a la vez es ruido.
    if (cuantas > antes) {
        contenedor.classList.remove('saldo-sube');
        void contenedor.offsetWidth;
        contenedor.classList.add('saldo-sube');
        setTimeout(() => contenedor.classList.remove('saldo-sube'), 450);
    }
}

/**
 * Manda volando al bote las últimas monedas de la pila del saldo.
 *
 * Antes las monedas salían del NÚMERO del saldo, que era lo único que había.
 * Ahora que el saldo son monedas de verdad, salen de las de arriba de las pilas
 * y esas desaparecen: se ve de dónde sale el dinero, no aparece de la nada.
 *
 * Las que vuelan son clones colocados encima; la original se esconde en el acto
 * para que la pila baje ya, sin esperar a que termine el viaje. El saldo bueno
 * lo manda el servidor un momento después y vuelve a pintar la cuadrícula.
 *
 * @param contenedor  el #saldoMonedas con las pilas
 * @param cuantas     cuántas monedas se apuestan
 * @param destinoId   a dónde van (el bote o el pozo)
 */
export function volarDesdeSaldo(contenedor, cuantas, destinoId = 'boteMonedas') {
    if (!contenedor) return;
    const destino = document.getElementById(destinoId);
    if (!destino) return;

    // De arriba de las pilas hacia abajo: las últimas puestas son las primeras
    // en salir, como quien coge del montón.
    const disponibles = [...contenedor.querySelectorAll('.moneda-saldo')]
        .filter(m => m.style.visibility !== 'hidden')
        .reverse()
        .slice(0, Math.max(1, Math.min(Math.floor(cuantas) || 1, MAXIMO_VOLANDO_SALDO)));

    if (disponibles.length === 0) return;

    const caja = destino.getBoundingClientRect();

    disponibles.forEach((original, i) => {
        const desde = original.getBoundingClientRect();
        // La original se va en el acto: la pila baja mientras el clon viaja.
        original.style.visibility = 'hidden';

        const clon = document.createElement('img');
        clon.src = IMAGEN;
        clon.alt = '';
        clon.className = 'moneda-volando';
        clon.style.left = `${desde.left}px`;
        clon.style.top = `${desde.top}px`;
        clon.style.width = `${desde.width}px`;
        clon.style.height = `${desde.height}px`;
        document.body.appendChild(clon);

        // Escalonadas, para que se vea un chorrito y no un salto de todas.
        setTimeout(() => {
            clon.style.left = `${caja.left + caja.width / 2 - desde.width / 2}px`;
            clon.style.top = `${caja.top + caja.height / 2 - desde.height / 2}px`;
            clon.style.transform = 'scale(0.55) rotate(300deg)';
            clon.style.opacity = '0';
        }, 30 + i * 70);

        setTimeout(() => clon.remove(), 1100 + i * 70);
    });

    // ⚠️ Hay que contarle a la cuadrícula lo que le acabamos de quitar.
    //
    // `pintarSaldo()` no repinta si el número de monedas no ha cambiado, y para
    // saberlo mira `dataset.saldo`. Esta función esconde monedas por debajo sin
    // tocarlo, así que la cuadrícula se quedaba diciendo que tenía 40 mientras
    // enseñaba 36 — y el siguiente pintado, viendo 40 y 40, no hacía nada.
    //
    // Con más de 40 monedas no se notaba al apostar (la cuadrícula está llena
    // igualmente) pero sí al COBRAR: ganabas y las monedas no volvían. Apuesta
    // tras apuesta la cuadrícula se vaciaba hasta cero sin recuperarse nunca.
    const visibles = [...contenedor.querySelectorAll('.moneda-saldo')]
        .filter(m => m.style.visibility !== 'hidden').length;
    contenedor.dataset.saldo = String(visibles);
}
