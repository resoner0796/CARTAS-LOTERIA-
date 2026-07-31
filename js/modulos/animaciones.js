// ======================================================
// ANIMACIONES Y GESTOS
// ======================================================
// Puro DOM: no sabe del juego, ni del socket, ni de quién eres.

/**
 * ¿El último gesto sobre el botón flotante fue un arrastre y no un toque?
 *
 * Lo consulta el soundboard para no abrirse cuando la persona solo estaba
 * moviendo el botón de sitio. Antes esto se resolvía con `iniciarFabDraggable`
 * sobrescribiendo `window.toggleMenuSonidos` con una copia parcheada: dos
 * funciones con el mismo nombre, una pisando a la otra, y la buena dependiendo
 * de que el arrastre se hubiera inicializado antes. Ahora el gesto solo publica
 * su resultado y quien quiera lo consulta.
 */
let huboArrastreUltimo = false;
export function huboArrastre() { return huboArrastreUltimo; }

/** Umbral en píxeles a partir del cual un gesto deja de ser un toque. */
const UMBRAL_ARRASTRE = 5;

/** Hace que el botón flotante de sonidos se pueda mover por la pantalla. */
export function iniciarBotonArrastrable() {
    const fab = document.getElementById("fabSonidosContainer");
    const btn = document.getElementById("btnToggleSonidos");
    if (!fab || !btn) return;

    let arrastrando = false;
    let inicioX, inicioY, izquierdaInicial, arribaInicial;

    const empezar = (x, y) => {
        arrastrando = true;
        huboArrastreUltimo = false;
        inicioX = x;
        inicioY = y;
        const rect = fab.getBoundingClientRect();
        izquierdaInicial = rect.left;
        arribaInicial = rect.top;
        fab.style.transition = 'none';   // que el movimiento sea instantáneo
    };

    const mover = (x, y, evento) => {
        if (!arrastrando) return;
        const dx = x - inicioX;
        const dy = y - inicioY;

        if (Math.abs(dx) > UMBRAL_ARRASTRE || Math.abs(dy) > UMBRAL_ARRASTRE) {
            huboArrastreUltimo = true;
        }
        if (!huboArrastreUltimo) return;

        evento.preventDefault();          // en móvil, evita arrastrar la página
        fab.style.left = `${izquierdaInicial + dx}px`;
        fab.style.top = `${arribaInicial + dy}px`;
        // Hay que soltar bottom/right o pelean con top/left.
        fab.style.bottom = 'auto';
        fab.style.right = 'auto';
    };

    const soltar = () => {
        arrastrando = false;
        fab.style.transition = 'transform 0.2s';
    };

    btn.addEventListener('touchstart', e => empezar(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
    document.addEventListener('touchmove', e => mover(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
    document.addEventListener('touchend', soltar);

    btn.addEventListener('mousedown', e => empezar(e.clientX, e.clientY));
    document.addEventListener('mousemove', e => mover(e.clientX, e.clientY, e));
    document.addEventListener('mouseup', soltar);
}

/** Manda cinco monedas volando del saldo al destino. Solo decoración. */
export function animarVueloMonedas(destinoId = "bote-valor") {
    const origen = document.getElementById("monedas-valor");
    const destino = document.getElementById(destinoId);
    if (!origen || !destino) return;

    const desde = origen.getBoundingClientRect();
    const hasta = destino.getBoundingClientRect();

    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const moneda = document.createElement("img");
            moneda.src = "assets/imagenes/ui/peso.png";
            moneda.className = "flying-coin";

            // Un poco de azar para que no salgan todas del mismo píxel.
            moneda.style.left = (desde.left + 10 + (Math.random() * 20 - 10)) + "px";
            moneda.style.top = (desde.top + (Math.random() * 20 - 10)) + "px";
            document.body.appendChild(moneda);

            // El segundo cuadro: sin esperar, el navegador no ve el cambio de
            // posición como una transición y la moneda aparece ya en el destino.
            setTimeout(() => {
                moneda.style.left = (hasta.left + 10) + "px";
                moneda.style.top = hasta.top + "px";
                moneda.style.transform = "scale(0.5) rotate(360deg)";
                moneda.style.opacity = "0";
            }, 50);

            setTimeout(() => moneda.remove(), 900);   // 0.8s de transición + margen
        }, i * 100);
    }
}

/** Aviso pequeño que sube y se desvanece, abajo a la izquierda. */
export function mostrarNotificacionFlotante(texto) {
    const notif = document.createElement("div");
    notif.innerText = texto;          // innerText: el emisor lo escribe una persona
    Object.assign(notif.style, {
        position: "fixed", bottom: "90px", left: "20px",
        background: "rgba(0,0,0,0.7)", color: "gold",
        padding: "5px 10px", borderRadius: "10px",
        zIndex: "2001", fontSize: "0.9rem",
        animation: "flotarDesvanecer 2s forwards"
    });
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
}
