// ======================================================
// SESIÓN
// ======================================================
// El token firmado y el único camino permitido para hablar con la API.
//
// El backend NO acepta ninguna otra forma de identificarse: la identidad sale
// del token, nunca del email que mande el cuerpo de la petición. Por eso todo
// pasa por api() y nunca por un fetch suelto.

import { API_URL } from './config.js';
import { mostrarAlerta } from './ui.js';

const CLAVE_TOKEN = "loteria_token";
const CLAVE_USUARIO = "loteria_usuario";

export function guardarToken(token) {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
}

export function obtenerToken() {
    return localStorage.getItem(CLAVE_TOKEN);
}

/** Perfil cacheado. Devuelve null si no hay o si quedó corrupto. */
export function usuarioGuardado() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_USUARIO)) || null;
    } catch {
        return null;
    }
}

export function guardarUsuario(usuario) {
    if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

export function borrarSesion() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
}

let avisandoSesionExpirada = false;

export function sesionExpirada() {
    if (avisandoSesionExpirada) return;      // que no se apilen alertas
    avisandoSesionExpirada = true;
    borrarSesion();
    mostrarAlerta("Tu sesión caducó. Vuelve a iniciar sesión.", "Sesión terminada");
    setTimeout(() => location.reload(), 2000);
}

/**
 * fetch contra la API con el token ya puesto. La ruta va sin el prefijo.
 *
 * **Nunca uses fetch directo contra la API**: te saltarías la cabecera de
 * autorización y el manejo del 401.
 */
export async function api(ruta, opciones = {}) {
    const cabeceras = { ...(opciones.headers || {}) };
    const token = obtenerToken();
    if (token) cabeceras["Authorization"] = `Bearer ${token}`;
    if (opciones.body && !cabeceras["Content-Type"]) cabeceras["Content-Type"] = "application/json";

    const res = await fetch(API_URL + ruta, { ...opciones, headers: cabeceras });
    // Basta con que haya sesión guardada: si el servidor nos rechaza, hay que
    // volver a entrar aunque el token ya se hubiera perdido.
    if (res.status === 401 && (token || localStorage.getItem(CLAVE_USUARIO))) sesionExpirada();
    return res;
}
