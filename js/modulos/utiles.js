// ======================================================
// UTILIDADES
// ======================================================
// Funciones sueltas que no pertenecen a ninguna parte concreta del juego y que
// usa medio archivo. Como config.js, este módulo no importa nada: se puede
// llamar desde donde sea.

/**
 * Escapa texto antes de meterlo en un innerHTML.
 *
 * Nicknames, nombres de sala y correos los escribe gente, y varios de ellos se
 * pintan con innerHTML. Sin escapar, un nickname como <img src=x onerror=...>
 * ejecuta código en el navegador de TODOS los de la sala. Y como la sesión vive
 * en localStorage, ese código puede robarla.
 */
export function escaparHtml(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

/**
 * Pinta un número y, si cambió respecto a lo que ya había, le da un latido
 * dorado. Sin esto el saldo cambiaba en silencio: apostabas y el número
 * simplemente era otro, sin nada que dijera "acabas de pagar".
 */
export function actualizarValor(elemento, valor) {
    if (!elemento) return;
    const nuevo = String(valor);
    const cambio = elemento.textContent !== "" && elemento.textContent !== nuevo;
    elemento.textContent = nuevo;
    if (!cambio) return;

    elemento.classList.remove("saldo-cambio");
    void elemento.offsetWidth;          // reinicia la animación
    elemento.classList.add("saldo-cambio");
    setTimeout(() => elemento.classList.remove("saldo-cambio"), 700);
}
