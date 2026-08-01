// ======================================================
// SET DE TABLAS FAVORITO
// ======================================================
// Guardar las tablas que sueles elegir y volver a ponerlas de un botón.
//
// Se guarda en DOS sitios a propósito: en localStorage siempre, y en la nube si
// hay sesión. Si la nube falla, lo local ya quedó hecho y no se pierde el set —
// por eso el aviso de error dice justo eso en vez de dar todo por perdido.

import { api, guardarUsuario } from './sesion.js';
import { mostrarAlerta } from './ui.js';
import { socket } from './socket.js';
import { sesion, partida } from './estado.js';

const CLAVE_LOCAL = "loteria_cartas_fav";

/** Guarda las tablas elegidas ahora mismo como set favorito. */
export async function guardarSetFavorito(boton) {
    if (partida.seleccionadas.length === 0) {
        return mostrarAlerta("Selecciona cartas primero.");
    }

    const elegidas = [...partida.seleccionadas];
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(elegidas));

    if (!sesion.usuario || !sesion.usuario.email) {
        return mostrarAlerta("Inicia sesión para guardar en la nube.", "Guardado Local");
    }

    // El botón llega desde el despachador de acciones. Antes se leía del `event`
    // global implícito, que solo funciona en algunos navegadores.
    const textoOriginal = boton ? boton.innerText : "";
    if (boton) boton.innerText = "Guardando...";

    try {
        await api(`/usuario/guardar-preferencias`, {
            method: 'POST',
            body: JSON.stringify({ email: sesion.usuario.email, cartasFavoritas: elegidas })
        });

        sesion.usuario.cartasFavoritas = elegidas;
        guardarUsuario(sesion.usuario);
        mostrarAlerta("¡Cartas guardadas en tu cuenta! ☁️", "Guardado");
    } catch (e) {
        console.error(e);
        mostrarAlerta("Se guardó localmente, pero falló la nube.", "Aviso");
    } finally {
        if (boton) boton.innerText = textoOriginal;
    }
}

/**
 * Vuelve a elegir el set guardado.
 *
 * `seleccionar` llega como argumento en lugar de importarse porque la selección
 * vive en el módulo del juego, y ese sí importa de aquí: pedirlo al revés
 * crearía un ciclo entre los dos.
 */
export function cargarSetFavorito(seleccionar, renumerar) {
    let favoritas = [];

    // Primero la nube, que es lo que sigue a la persona entre dispositivos.
    if (sesion.usuario && sesion.usuario.cartasFavoritas && sesion.usuario.cartasFavoritas.length > 0) {
        favoritas = sesion.usuario.cartasFavoritas;
    } else {
        const guardadas = localStorage.getItem(CLAVE_LOCAL);
        if (guardadas) {
            try { favoritas = JSON.parse(guardadas) || []; } catch { favoritas = []; }
        }
    }

    if (favoritas.length === 0) {
        return mostrarAlerta("No tienes ningún set guardado.", "Sin datos");
    }

    // Hay que soltar las tablas que se tenían: el servidor las mantiene
    // apartadas para que nadie más las elija.
    partida.seleccionadas.forEach(id => {
        socket.emit("deseleccionar-carta", { carta: id, sala: partida.sala });
    });
    partida.seleccionadas = [];

    document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
        img.classList.remove("seleccionada");
    });

    // Escalonado: cada selección avisa al servidor, y de golpe llegaban todas a
    // la vez sin que el tablero de los demás se enterara en orden.
    favoritas.forEach((id, i) => {
        setTimeout(() => {
            const img = document.querySelector(`.carta-img[data-id="${id}"]`);
            if (img) seleccionar(img);
            renumerar();
        }, i * 50);
    });

    mostrarAlerta("Tus cartas favoritas han sido cargadas.", "Listo");
}
