// ======================================================
// PANEL DE ADMINISTRADOR
// ======================================================
// Listado de usuarios y recarga manual de monedas.
//
// ⚠️ Nada de lo que hay aquí autoriza nada. El email del admin NO vive en el
// frontend —este archivo es público y lo serviría de bandeja a cualquiera—; el
// servidor manda un flag `esAdmin` al iniciar sesión y esto solo decide si se
// pinta el botón. Quien autoriza de verdad es el backend, en cada endpoint.

import { api } from './sesion.js';
import { mostrarAlerta, mostrarConfirmacion, cambiarPantalla } from './ui.js';
import { escaparHtml } from './utiles.js';

/** Enseña u oculta el botón del panel. Solo cosmético, ver el aviso de arriba. */
export function verificarSiSoyAdmin(usuario) {
    const btnAdmin = document.getElementById("btnPanelAdmin");
    if (!btnAdmin) return;
    btnAdmin.style.display = (usuario && usuario.esAdmin) ? "block" : "none";
}

export function abrirPanelAdmin(usuario) {
    cambiarPantalla("pantallaAdmin");
    cargarUsuariosAdmin(usuario);
}

export async function cargarUsuariosAdmin(usuario) {
    const tbody = document.getElementById("tablaUsuariosAdmin");
    if (!tbody) return;
    if (!usuario || !usuario.email) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sin sesión.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';

    try {
        const res = await api(`/admin/usuarios`, {
            method: 'GET',
            headers: { 'admin-email': usuario.email }
        });
        if (!res.ok) throw new Error("Sin permiso");

        const usuarios = await res.json();
        // Si el servidor devuelve algo que no es una lista —un error con forma
        // de objeto, por ejemplo— el forEach de abajo revienta y la tabla se
        // queda en "Cargando..." para siempre.
        if (!Array.isArray(usuarios)) throw new Error("respuesta inesperada del servidor");
        tbody.innerHTML = "";

        usuarios.forEach(u => {
            const tr = document.createElement("tr");
            // Nickname y email los escribe gente: van escapados aunque esto solo
            // lo vea el administrador.
            tr.innerHTML = `
                <td style="padding:8px; font-weight:bold;">${escaparHtml(u.nickname)}</td>
                <td style="padding:8px; font-size:0.8rem; color:#ccc;">${escaparHtml(u.email)}</td>
                <td style="padding:8px; color:gold;">${Number(u.monedas) || 0}</td>
                <td style="padding:8px;">
                    <button data-accion="preparar-recarga" data-email="${escaparHtml(u.email)}" style="padding:2px 8px; font-size:0.7rem; margin:0;">➕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error cargando usuarios.", "Error Admin");
    }
}

/** Rellena el formulario de recarga con el usuario elegido de la tabla. */
export function prepararRecarga(email) {
    const inputEmail = document.getElementById("adminInputEmail");
    const inputMonedas = document.getElementById("adminInputMonedas");
    if (inputEmail) inputEmail.value = email;
    if (inputMonedas) inputMonedas.focus();
}

export async function ejecutarRecargaAdmin(usuario) {
    const destino = document.getElementById("adminInputEmail").value;
    const cantidad = document.getElementById("adminInputMonedas").value;

    if (!destino || !cantidad) return mostrarAlerta("Faltan datos");

    mostrarConfirmacion(`¿Dar ${cantidad} monedas a ${destino}?`, async () => {
        try {
            const res = await api(`/admin/recargar-manual`, {
                method: 'POST',
                body: JSON.stringify({
                    adminEmail: usuario.email,
                    targetEmail: destino,
                    cantidad: parseInt(cantidad, 10)
                })
            });

            const data = await res.json();
            if (data.success) {
                mostrarAlerta("Recarga exitosa", "Hecho");
                cargarUsuariosAdmin(usuario);
                document.getElementById("adminInputMonedas").value = "";
            } else {
                mostrarAlerta("Error: " + data.error);
            }
        } catch (e) {
            mostrarAlerta("Error de conexión", "Fallo");
        }
    });
}
