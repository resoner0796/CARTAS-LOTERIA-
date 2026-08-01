// ======================================================
// ENTRAR DESDE EL HUB (SSO)
// ======================================================
// La Lotería no tiene login propio: el Hub reparte la sesión en la URL, como
// `?tk=<JWT>`. Este módulo la recoge, pide el perfil y mete a la persona
// directamente al menú.
//
// Es el código que más veces nos ha mordido del proyecto, siempre por lo mismo:
// **carreras**. Lo que sigue no es estilo, es lo que costó arreglarlo.

import { api, guardarToken, guardarUsuario, borrarSesion } from './sesion.js';
import { sesion } from './estado.js';
import { cambiarPantalla, mostrarAlerta } from './ui.js';
import { socket } from './socket.js';
import { establecerFicha, actualizarSaldoUI } from './tienda.js';
import { unirseSalaDirecto } from './sala.js';

/** Un JWT son tres partes separadas por puntos. No lo validamos: no tenemos la llave. */
function pareceJWT(valor) {
    return typeof valor === 'string' && valor.split('.').length === 3;
}

function limpiarUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
}

/**
 * Recoge la sesión que manda el Hub, si viene.
 *
 * ⚠️ Hay que llamarla ANTES de que `window.onload` pueda ejecutarse. Sin eso hay
 * una carrera: el arranque mira el localStorage y, como el perfil todavía no ha
 * llegado del servidor, da la sesión por inexistente y saca la pantalla de
 * acceso. Con el arranque en frío de Render esa petición puede tardar lo suyo,
 * así que quien venía del Hub se quedaba viendo un login que no debía existir.
 * La bandera `sesion.entrandoDesdeHub` es lo que le dice al arranque que espere.
 *
 * @param alEntrar  qué hacer con el menú una vez dentro (lo pone app.js)
 * @param ocultarSplash  para quitar la pantalla de carga
 */
export function verificarSSO(alEntrar, ocultarSplash) {
    const params = new URLSearchParams(window.location.search);
    const tk = params.get('tk');

    // Antes se aceptaba también `?sso=`, que era JSON en base64 SIN FIRMAR:
    // cualquiera podía fabricarse uno con el correo que quisiera. Se mantuvo un
    // tiempo por si quedaban enlaces viejos circulando, con la nota de retirarlo
    // en cuanto el Hub mandara JWT. El Hub ya solo manda JWT por sus dos caminos
    // —el catálogo y el botón de la portada—, así que se retiró.
    // **No lo reintroduzcas.**
    if (!pareceJWT(tk)) return;

    sesion.entrandoDesdeHub = true;
    guardarToken(tk);

    api('/usuario/datos-frescos')
        .then(r => r.json())
        .then(d => {
            if (!d.success) throw new Error("el servidor rechazó el token");

            const perfil = {
                email: d.email, nickname: d.nickname, monedas: d.monedas,
                esAdmin: !!d.esAdmin, inventario: d.inventario || [],
                fichaActiva: d.fichaActiva, cartasFavoritas: d.cartasFavoritas || []
            };
            guardarUsuario(perfil);
            limpiarUrl();

            // Se entra en el momento, sin recargar. Recargar significaba esperar
            // dos veces: la petición del perfil y la carga entera de la página.
            sesion.usuario = perfil;
            if (perfil.fichaActiva) establecerFicha(perfil.fichaActiva);
            if (perfil.cartasFavoritas?.length) {
                localStorage.setItem("loteria_cartas_fav", JSON.stringify(perfil.cartasFavoritas));
            }
            sesion.entrandoDesdeHub = false;

            // Primero se entra, y solo después lo accesorio. Si algo de esto
            // fallara —el socket, una imagen, la tienda— no tiene por qué
            // costarle la sesión a alguien que ya se identificó bien.
            cambiarPantalla("menu");
            ocultarSplash();

            try {
                alEntrar();
                actualizarSaldoUI(sesion.usuario);
                // El socket se conectó sin token, antes de que llegara el perfil.
                // Se reengancha para que el handshake viaje ya identificado.
                socket.disconnect().connect();

                const invitacion = new URLSearchParams(window.location.search).get('sala');
                if (invitacion) unirseSalaDirecto(invitacion, null);
            } catch (fallo) {
                console.warn("Entramos, pero algo del arranque falló:", fallo);
            }
        })
        .catch(e => {
            console.error("SSO:", e);
            borrarSesion();
            limpiarUrl();
            sesion.entrandoDesdeHub = false;
            ocultarSplash(() => {
                cambiarPantalla("login");
                mostrarAlerta("No pudimos validar tu sesión del Hub. Entra de nuevo.", "Sesión");
            });
        });
}
