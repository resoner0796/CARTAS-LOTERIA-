// ======================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ======================================================
//
// Este archivo es el punto de entrada. En desarrollo el navegador resuelve los
// imports de abajo por su cuenta; en el despliegue, esbuild lo empaqueta todo en
// un solo archivo antes de ofuscarlo (ver scripts/obfuscate.js).

import {
    API_URL, SERVIDOR, STRIPE_CLAVE_PUBLICA, FICHA_POR_DEFECTO,
    catalogoSonidos, catalogoFichas
} from './modulos/config.js';
import { escaparHtml, actualizarValor } from './modulos/utiles.js';
// El token va en el handshake. `auth` como función se vuelve a evaluar en cada
// reconexión, así que en cuanto inicias sesión el socket ya viaja identificado.
//
// El guión de Socket.IO se sirve DESDE EL BACKEND. Si ese servidor está dormido
// o caído, el guión no llega y `io` no existe. Sin esta comprobación la línea
// reventaba, y como es de las primeras del archivo, se llevaba por delante TODO
// lo demás: la página se quedaba congelada en el splash sin explicación. Es
// preferible cargar la app y avisar que no hay servidor.
const socket = (typeof io !== "undefined")
    ? io(SERVIDOR, {
          auth: (cb) => cb({ token: localStorage.getItem("loteria_token") || null })
      })
    : (function socketAusente() {
          console.error("No se pudo cargar Socket.IO: el servidor no responde.");
          setTimeout(() => {
              if (typeof mostrarAlerta === "function") {
                  mostrarAlerta(
                      "No pudimos conectar con el servidor del juego. Revisa tu conexión y vuelve a entrar.",
                      "Sin conexión"
                  );
              }
          }, 1500);
          // Objeto mínimo para que el resto del archivo no truene.
          return {
              on() {}, once() {}, emit() {},
              disconnect() { return this; }, connect() { return this; },
              connected: false, id: null
          };
      })();

// ==================== POZO ACUMULADO ====================
// Bote aparte que crece $1 por partida y por jugador que se apunte, y que solo
// se lleva quien llene las 4 barajas del centro. Es opcional y solo existe en
// modo Tradicional. Quien no se apunta no puede ganarlo, aunque gane la lotería.
let pozoAcumulado = 0;

function pozoDisponible() {
    return modoJuegoActual === 'tradicional';
}

function refrescarPozoUI() {
    const caja = document.getElementById("pozoControl");
    if (!caja) return;
    caja.style.display = pozoDisponible() ? "flex" : "none";
    actualizarValor(document.getElementById("pozo-valor"), pozoAcumulado);
}

socket.on('pozo-actualizado', (monto) => {
    pozoAcumulado = monto || 0;
    refrescarPozoUI();
});

// ==================== SILENCIO EN LA SALA ====================
// Quién tiene los sonidos cortados. Lo decide el anfitrión y lo manda el
// servidor, que es quien de verdad descarta los efectos: aquí solo se pinta.
let silenciadosEnSala = [];

window.alternarSilencio = function(email) {
    if (!soyHost) return;
    const callado = silenciadosEnSala.includes(email);
    socket.emit("silenciar-jugador", { sala: salaActual, email, silenciar: !callado });
};

socket.on("silenciados-actualizados", (lista) => {
    silenciadosEnSala = Array.isArray(lista) ? lista : [];
});

socket.on("estas-silenciado", () => {
    mostrarAlerta("El anfitrión silenció tus efectos de sonido en esta sala.", "Sin sonidos 🔇");
});

// ==================== SESIÓN (TOKEN) ====================
// El backend ya no confía en el email que le mandemos en el body: la identidad
// sale de este token firmado. Mientras dure la fase de convivencia el servidor
// sigue aceptando el camino viejo, pero todo lo que sale de aquí ya va firmado.

function guardarToken(token) { if (token) localStorage.setItem("loteria_token", token); }
function obtenerToken() { return localStorage.getItem("loteria_token"); }

let avisandoSesionExpirada = false;
function sesionExpirada() {
    if (avisandoSesionExpirada) return;      // que no se apilen alertas
    avisandoSesionExpirada = true;
    localStorage.removeItem("loteria_token");
    localStorage.removeItem("loteria_usuario");
    mostrarAlerta("Tu sesión caducó. Vuelve a iniciar sesión.", "Sesión terminada");
    setTimeout(() => location.reload(), 2000);
}

/** fetch contra la API con el token ya puesto. La ruta va sin el prefijo. */
async function api(ruta, opciones = {}) {
    const cabeceras = { ...(opciones.headers || {}) };
    const token = obtenerToken();
    if (token) cabeceras["Authorization"] = `Bearer ${token}`;
    if (opciones.body && !cabeceras["Content-Type"]) cabeceras["Content-Type"] = "application/json";

    const res = await fetch(API_URL + ruta, { ...opciones, headers: cabeceras });
    // Basta con que haya sesión guardada: si el servidor nos rechaza, hay que
    // volver a entrar aunque el token ya se hubiera perdido.
    if (res.status === 401 && (token || localStorage.getItem("loteria_usuario"))) sesionExpirada();
    return res;
}

// Variables Globales
let usuarioActual = null; // {email, nickname, monedas, inventario}
let jugadoresGlobal = {};
let miId;
let soyHost = false;
let seleccionadas = [];
let salaActual = "";
let haApostadoLocal = false;
let historialIdsGlobal = [];
let checkoutInstance = null; // Variable global para Stripe
let modoJuegoActual = 'tradicional';
let costoCartaActual = 1;
// Ruta por defecto para Tradicional/Llena
let rutaCartasJugador = 'assets/imagenes/cartas/';

const stripePromise = Stripe(STRIPE_CLAVE_PUBLICA);

// Referencias DOM - Pantallas
const pantallas = {
  splash: document.getElementById("pantallaSplash"),
  login: document.getElementById("pantallaLogin"),
  registro: document.getElementById("pantallaRegistro"),
  menu: document.getElementById("pantallaMenu"),
  sala: document.getElementById("pantallaSala"),
  seleccion: document.getElementById("pantallaSeleccion"),
  juego: document.getElementById("pantallaJuego"),
  pantallaAdmin: document.getElementById("pantallaAdmin")
};

// Referencias DOM - Elementos UI
const contenedorCartas = document.getElementById("contenedorCartas");
const juegoCartas = document.getElementById("juegoCartas");
const btnIniciar = document.getElementById("btnIniciar"); 
const historial = document.getElementById("historial");
const jugadoresLista = document.getElementById("jugadoresLista");
const jugadoresListaIngame = document.getElementById("jugadoresListaIngame");
const btnSalirSala = document.getElementById("btnSalirSala");
const btnApostar = document.getElementById("btnApostar");
const monedasEl = document.getElementById("monedas-valor");
const boteEl = document.getElementById("bote-valor");

// Referencias DOM - Modales y Audios
const loteriaModal = document.getElementById("loteriaModal");
const modalLoteriaTitulo = document.getElementById("modalLoteriaTitulo");
const modalLoteriaTexto = document.getElementById("modalLoteriaTexto");
const btnAceptarGanador = document.getElementById("btnAceptarGanador");
const btnRechazarGanador = document.getElementById("btnRechazarGanador");
const modalVerificationArea = document.getElementById("modalVerificationArea");
let ganadorTempId = "";

// Audios
const audioBarajear = document.getElementById("audioBarajear");
const audioCampana = document.getElementById("audioCampana");
const audioCorre = document.getElementById("audioCorre");
const audioAplausos = document.getElementById("audioAplausos");
const audioKachin = new Audio("assets/audios/kachin.mp3"); // Sonido de apuesta
const loteriaMensaje = document.getElementById("loteriaMensaje");


// ==================== AUTO-LOGIN DESDE EL HUB (SSO) ====================
// Se marca ANTES de que window.onload pueda ejecutarse. Sin esto había una
// carrera: el arranque miraba el localStorage y, como el perfil todavía no
// había llegado del servidor, daba la sesión por inexistente y sacaba la
// pantalla de acceso. Con el arranque en frío de Render esa petición puede
// tardar bastante, así que el jugador que venía del Hub se quedaba viendo un
// login que no debía existir.
let entrandoDesdeHub = false;

(function verificarSSO() {
    const params = new URLSearchParams(window.location.search);
    // `tk` es el formato actual: el token firmado que reparte el Hub.
    const tk = params.get('tk');
    if (tk) localStorage.setItem("loteria_token", tk);

    // `sso` era el formato viejo, JSON en base64 sin firmar. Se sigue aceptando
    // por si queda algún enlace antiguo circulando, pero el Hub ya no lo genera.
    const tokenSSO = params.get('sso') || tk;
    
    if (!tokenSSO) return;

    const limpiarUrl = () => window.history.replaceState({}, document.title, window.location.pathname);

    // --- FORMATO NUEVO: JWT firmado por el backend ---
    // No lo validamos aquí, y no hace falta: no tenemos la llave y el servidor lo
    // verifica en cada petición. Eso es justo lo que le faltaba al formato viejo,
    // que era JSON en base64 sin firma y cualquiera podía fabricarse uno.
    if (tokenSSO.split('.').length === 3) {
        entrandoDesdeHub = true;
        localStorage.setItem("loteria_token", tokenSSO);
        api('/usuario/datos-frescos')
            .then(r => r.json())
            .then(d => {
                if (!d.success) throw new Error("el servidor rechazó el token");
                const perfil = {
                    email: d.email, nickname: d.nickname, monedas: d.monedas,
                    esAdmin: !!d.esAdmin, inventario: d.inventario || [],
                    fichaActiva: d.fichaActiva, cartasFavoritas: d.cartasFavoritas || []
                };
                localStorage.setItem("loteria_usuario", JSON.stringify(perfil));
                limpiarUrl();

                // Se entra en el momento, sin recargar. Recargar significaba
                // esperar dos veces: la petición del perfil y la carga entera
                // de la página otra vez.
                usuarioActual = perfil;
                if (perfil.fichaActiva) fichaActivaUrl = perfil.fichaActiva;
                if (perfil.cartasFavoritas?.length) {
                    localStorage.setItem("loteria_cartas_fav", JSON.stringify(perfil.cartasFavoritas));
                }
                entrandoDesdeHub = false;

                // Primero se entra, y solo después lo accesorio. Si algo de esto
                // fallara —el socket, una imagen, la tienda— no tiene por qué
                // costarle la sesión a alguien que ya se identificó bien.
                cambiarPantalla("menu");
                ocultarSplashGlobal();

                try {
                    configurarMenu();
                    cargarTienda();
                    sincronizarDatosForzoso();
                    if (typeof socket !== "undefined" && socket) socket.disconnect().connect();

                    const invitacion = new URLSearchParams(window.location.search).get('sala');
                    if (invitacion) unirseSalaDirecto(invitacion, null);
                } catch (fallo) {
                    console.warn("Entramos, pero algo del arranque falló:", fallo);
                }
            })
            .catch(e => {
                console.error("SSO:", e);
                localStorage.removeItem("loteria_token");
                limpiarUrl();
                entrandoDesdeHub = false;
                ocultarSplashGlobal(() => {
                    cambiarPantalla("login");
                    mostrarAlerta("No pudimos validar tu sesión del Hub. Entra de nuevo.", "Sesión");
                });
            });
        return;
    }

    // --- FORMATO VIEJO: base64 sin firmar ---
    // Se mantiene mientras el Hub se actualiza al formato nuevo. Es falsificable,
    // así que hay que retirarlo en cuanto el Hub mande JWT.
    {
        try {
            // 1. Decodificar el token (Base64 -> JSON)
            const jsonUsuario = atob(tokenSSO);
            const usuarioHub = JSON.parse(jsonUsuario);
            
            console.log("🔓 Login Automático desde Hub:", usuarioHub.nickname);

            // 2. Recuperar preferencias anteriores SI EXISTEN antes de sobrescribir
            // Esto ayuda a que no haya un "parpadeo" de la skin default si ya estaba guardada
            const prevFicha = localStorage.getItem("loteria_ficha_activa");
            const prevCartas = localStorage.getItem("loteria_cartas_fav");

            if(prevFicha) usuarioHub.fichaActiva = prevFicha;
            if(prevCartas) usuarioHub.cartasFavoritas = JSON.parse(prevCartas);

            // 3. Guardar en el LocalStorage de la Lotería
            localStorage.setItem("loteria_usuario", JSON.stringify(usuarioHub));
            
            // 4. Limpiar la URL para que no se vea el token feo
            const nuevaUrl = window.location.pathname;
            window.history.replaceState({}, document.title, nuevaUrl);
            
            // 5. 🔥 IMPORTANTE: Forzar recarga de ventana si es la primera vez que entra
            // para asegurar que window.onload ejecute toda la lógica de conexión
            if (!sessionStorage.getItem("sso_processed")) {
                sessionStorage.setItem("sso_processed", "true");
                window.location.reload();
            }
            
        } catch (e) {
            console.error("Error procesando SSO:", e);
        }
    }
})();
// ===================================================================

// ======================================================
// SISTEMA DE MODALES PRO
// ======================================================

const modalSistema = document.getElementById("modalSistema");
const modalTitulo = document.getElementById("modalSistemaTitulo");
const modalMensaje = document.getElementById("modalSistemaMensaje");
const btnModalAceptar = document.getElementById("btnModalAceptar");
const btnModalCancelar = document.getElementById("btnModalCancelar");

let onModalAceptar = null; 

function mostrarAlerta(mensaje, titulo = "Aviso del Sistema", prueba = null) {
    modalTitulo.textContent = titulo;
    modalMensaje.textContent = mensaje;
    btnModalCancelar.style.display = "none";
    btnModalAceptar.textContent = "Entendido";

    // La tabla que se llenó, con sus fichas encima, si el anfitrión la marcó.
    // Es la prueba de la victoria: cualquiera puede compararla con el historial.
    const zonaCarta = document.getElementById("modalCartaGanadora");
    if (zonaCarta) {
        zonaCarta.innerHTML = "";
        if (prueba && prueba.tabla) {
            const titulo = document.createElement("p");
            titulo.className = "prueba-titulo";
            titulo.textContent = "Tabla ganadora:";

            const marco = document.createElement("div");
            marco.className = "prueba-tabla";

            const img = document.createElement("img");
            img.src = `${rutaCartasJugador}${prueba.tabla}.jpg`;
            img.alt = "";
            marco.appendChild(img);

            (prueba.fichas || []).forEach(pos => {
                const ficha = document.createElement("img");
                ficha.src = prueba.skin || "assets/imagenes/ui/ficha.PNG";
                ficha.className = "ficha";
                ficha.style.left = pos.left;
                ficha.style.top = pos.top;
                marco.appendChild(ficha);
            });

            zonaCarta.appendChild(titulo);
            zonaCarta.appendChild(marco);
            zonaCarta.style.display = "block";
        } else {
            zonaCarta.style.display = "none";
        }
    }
    
    onModalAceptar = () => cerrarModal();
    
    modalSistema.classList.add("active");
    if(navigator.vibrate) navigator.vibrate(50);
}

function mostrarConfirmacion(mensaje, callbackAceptar) {
    modalTitulo.textContent = "¿Estás seguro?";
    modalMensaje.textContent = mensaje;

    // Los dos modales comparten el mismo contenedor, así que hay que borrar la
    // tabla ganadora de la vez anterior. Si no, al pedir confirmación para salir
    // aparecía otra vez la tabla del último que ganó.
    limpiarPruebaVictoria();
    btnModalCancelar.style.display = "inline-block";
    btnModalAceptar.textContent = "Sí";
    
    onModalAceptar = () => {
        callbackAceptar();
        cerrarModal();
    };
    
    modalSistema.classList.add("active");
}

/** Borra la tabla ganadora del modal compartido. */
function limpiarPruebaVictoria() {
    const zona = document.getElementById("modalCartaGanadora");
    if (!zona) return;
    zona.innerHTML = "";
    zona.style.display = "none";
}

function cerrarModal() {
    modalSistema.classList.remove("active");
    onModalAceptar = null;
    limpiarPruebaVictoria();
}

if(btnModalAceptar) btnModalAceptar.onclick = () => { if (onModalAceptar) onModalAceptar(); else cerrarModal(); };
if(btnModalCancelar) btnModalCancelar.onclick = () => cerrarModal();


// ======================================================
// INICIO Y AUTENTICACIÓN
// ======================================================

/** Desvanece el splash. Vive fuera de onload porque el SSO también lo necesita. */
function ocultarSplashGlobal(callback) {
    if (!pantallas.splash) { if (callback) callback(); return; }
    pantallas.splash.style.opacity = '0';
    setTimeout(() => {
        pantallas.splash.style.display = 'none';
        if (callback) callback();
    }, 500); // 500ms es lo que tarda la transición CSS
}

window.onload = () => {
    // 1. Revisar sesión guardada
    let sesionGuardada = localStorage.getItem("loteria_usuario");

    const ocultarSplash = ocultarSplashGlobal;

    // Si venimos del Hub con token, el perfil todavía viene en camino. No hay
    // que decidir nada aquí: el splash se queda y el propio SSO abre el menú
    // cuando llegue la respuesta, o el login si el servidor lo rechaza.
    if (entrandoDesdeHub) {
        const aviso = document.querySelector('#pantallaSplash h1');
        if (aviso) aviso.textContent = 'Entrando...';
        return;
    }

    // --- MIGRACIÓN A SESIONES CON TOKEN ---
    // Las sesiones anteriores al cambio a JWT no tienen token y en localStorage
    // no caducan nunca: se quedarían ahí para siempre. En cuanto el servidor
    // deje de aceptar peticiones sin token, esas sesiones dejarían de funcionar
    // sin ningún aviso, con botones que no responden.
    // Mejor cortar por lo sano ahora y pedir el login una sola vez.
    if (sesionGuardada && !obtenerToken()) {
        localStorage.removeItem("loteria_usuario");
        sesionGuardada = null;
        usuarioActual = null;
        setTimeout(() => {
            ocultarSplash(() => {
                cambiarPantalla("login");
                mostrarAlerta(
                    "Mejoramos la seguridad de las cuentas. Entra otra vez, es solo esta vez.",
                    "Vuelve a iniciar sesión"
                );
            });
        }, 1500);
        return;
    }

    if (sesionGuardada) {
        // === USUARIO LOGUEADO (CARGA DE DATOS) ===
        usuarioActual = JSON.parse(sesionGuardada);
        
        // 🔥 CARGAR PREFERENCIAS DE LA NUBE 🔥
        if(usuarioActual.fichaActiva) {
            fichaActivaUrl = usuarioActual.fichaActiva;
        }
        // Si tiene cartas favoritas en la cuenta, actualizamos el localStorage para que esté sincronizado
        if(usuarioActual.cartasFavoritas && usuarioActual.cartasFavoritas.length > 0) {
            localStorage.setItem("loteria_cartas_fav", JSON.stringify(usuarioActual.cartasFavoritas));
        }
        
        configurarMenu();
        cargarTienda();
        sincronizarDatosForzoso(); 
        
        
        const urlParams = new URLSearchParams(window.location.search);
        const salaInvitacion = urlParams.get('sala');
        const pagoEstado = urlParams.get('pago');

        // Lógica de Pagos Stripe
        if (pagoEstado === 'exito') {
            const cant = urlParams.get('cantidad');
            mostrarAlerta(`¡Has recibido ${cant} monedas! 🎉`, "¡Pago Exitoso!");
            if(usuarioActual) {
                usuarioActual.monedas = (parseInt(usuarioActual.monedas) || 0) + parseInt(cant);
                localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
                configurarMenu();
                cargarTienda();
            }
            window.history.pushState({}, document.title, window.location.pathname);
        } else if (pagoEstado === 'cancelado') {
            mostrarAlerta("La compra fue cancelada.", "Aviso");
            window.history.pushState({}, document.title, window.location.pathname);
        }

        // Navegación (Detrás del Splash)
        if(salaInvitacion) {
             unirseSalaDirecto(salaInvitacion, null);
        } else {
             cambiarPantalla("menu");
        }
        
        // Reconexión socket
        if(socket.connected) socket.emit('reconectar', { sala: salaActual, email: usuarioActual.email });

        // === ¡CORRECCIÓN AQUÍ! ===
        // Quitamos el splash después de 2.5 segundos para usuarios ya logueados
        setTimeout(() => {
            ocultarSplash();
        }, 3500);

    } else {
        // === USUARIO NUEVO / SIN SESIÓN ===
        // Aquí dejamos los 5 segundos para que luzca la marca
        setTimeout(() => {
            ocultarSplash(() => {
                // Solo si no hay sesión y el splash ya se fue, mostramos login
                if (!sesionGuardada) cambiarPantalla("login");
            });
        }, 5000); 
    }
};

function cambiarPantalla(nombre) {
  Object.values(pantallas).forEach(p => p.classList.remove("activa"));
  if(pantallas[nombre]) {
      pantallas[nombre].classList.add("activa");
      if (nombre === "seleccion") pantallas["seleccion"].scrollTo(0, 0);
  }
}

async function login() {
    const email = document.getElementById("loginEmail").value;
    const pass = document.getElementById("loginPass").value;
    
    if(!email || !pass) return mostrarAlerta("Llena todos los campos", "Faltan datos");

    try {
        const res = await api(`/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();
        
        if(data.success) {
            usuarioActual = data;
            guardarToken(data.token);
            localStorage.setItem("loteria_usuario", JSON.stringify(data));

            // Reconectamos para que el handshake del socket lleve ya el token.
            socket.disconnect().connect();

            // 🔥 FIX IMPORTANTE: Actualizar la variable global de la ficha AL INSTANTE
            if (data.fichaActiva) {
                fichaActivaUrl = data.fichaActiva;
            }

            // Sincronizar cartas si existen
            if(data.cartasFavoritas && data.cartasFavoritas.length > 0) {
                localStorage.setItem("loteria_cartas_fav", JSON.stringify(data.cartasFavoritas));
            }
            
            configurarMenu();
            cargarTienda(); 
            sincronizarDatosForzoso(); 
            
            const urlParams = new URLSearchParams(window.location.search);
            const salaInvitacion = urlParams.get('sala');
            if(salaInvitacion) unirseSalaDirecto(salaInvitacion, null);
            else cambiarPantalla("menu");

        } else {
            mostrarAlerta(data.error, "Error de Login");
        }
    } catch (e) { console.error(e); mostrarAlerta("No se pudo conectar con el servidor", "Error de Red"); }
}

async function registro() {
    const nickname = document.getElementById("regNickname").value;
    const email = document.getElementById("regEmail").value;
    const pass = document.getElementById("regPass").value;
    
    if(!nickname || !email || !pass) return mostrarAlerta("Llena todos los campos", "Registro incompleto");

    try {
        const res = await api(`/registro`, {
            method: 'POST',
            body: JSON.stringify({ nickname, email, password: pass })
        });
        const data = await res.json();
        
        if(data.success) {
            usuarioActual = data;
            guardarToken(data.token);
            localStorage.setItem("loteria_usuario", JSON.stringify(data));
            socket.disconnect().connect();

            configurarMenu();
            cargarTienda(); // <--- Cargar tienda al registrarse
            
            cambiarPantalla("menu");
        } else {
            mostrarAlerta(data.error, "Error de Registro");
        }
    } catch (e) { console.error(e); mostrarAlerta("Error de conexión", "Error de Red"); }
}

function cerrarSesion() {
    localStorage.removeItem("loteria_usuario");
    localStorage.removeItem("loteria_token");
    // Opcional: También limpiar favoritos locales si quieres seguridad total
    // localStorage.removeItem("loteria_cartas_fav"); 
    
    usuarioActual = null;
    
    // 🔥 FIX: Resetear la ficha a la default al salir
    fichaActivaUrl = 'assets/imagenes/ui/ficha.PNG';
    
    location.reload(); // Recargar limpia todo lo demás
}

function configurarMenu() {
    if(usuarioActual) {
        document.getElementById("menuBienvenida").textContent = `Hola, ${usuarioActual.nickname}`;
        // En el menú principal solo mostramos el número (para el monedero)
        document.getElementById("menuMonedas").textContent = usuarioActual.monedas;
        verificarSiSoyAdmin();
    }
}

// ======================================================
// GESTIÓN DE SALAS
// ======================================================
// ==================== COMPARTIR SALA (FIX GLOBAL) ====================

window.compartirSala = function() {
    if (!salaActual) return mostrarAlerta("Primero debes entrar a una sala.", "Error");

    const urlBase = window.location.origin + window.location.pathname;
    const linkInvitacion = `${urlBase}?sala=${encodeURIComponent(salaActual)}`;
    
    const datosShare = {
        title: '¡Juguemos Lotería! 🎰',
        text: `Únete a mi sala "${salaActual}" en Juegos en la Nube. ¡Entra ya!`,
        url: linkInvitacion
    };

    // 1. Detectamos si estamos dentro del HUB (Iframe)
    if (window.self !== window.top) {
        console.log("📡 Enviando señal al HUB para compartir...");
        // Le mandamos el mensaje al Padre (HUB)
        window.parent.postMessage({
            action: 'COMPARTIR_NATIVO',
            datos: datosShare
        }, '*');
        return; // El HUB se encarga, nosotros terminamos aquí.
    }

    // 2. Si NO estamos en el Hub (estamos directo en la página), intentamos normal
    if (navigator.share) {
        navigator.share(datosShare).catch(console.error);
    } else {
        // Fallback PC
        navigator.clipboard.writeText(linkInvitacion)
            .then(() => mostrarAlerta("Link copiado 📋", "Listo"));
    }
};



function crearSalaPropia() {
    const nombreSala = document.getElementById("inputCrearSala").value.trim();
    const selectModo = document.getElementById("inputModoJuego");
    const modoJuego = selectModo ? selectModo.value : "clasico"; 
    
    if(!nombreSala) return mostrarAlerta("Ponle nombre a tu sala");
    unirseSalaDirecto(nombreSala, modoJuego);
}

function unirseSalaExistente() {
    const nombreSala = document.getElementById("inputUnirseSala").value.trim();
    if(!nombreSala) return mostrarAlerta("Escribe el nombre de la sala");
    unirseSalaDirecto(nombreSala, null);
}

function unirseSalaDirecto(nombreSala, modo) {
    salaActual = nombreSala;
    
    // Configurar Fondos
    const basePath = "assets/imagenes/ui/";
    let fondoSel = "fondo-seleccion.PNG";
    let fondoJuego = "fondo-juego.PNG";

    if(salaActual === "Familia") { fondoSel = "fondo-seleccion-familia.PNG"; fondoJuego = "fondo-juego-familia.PNG"; }
    if(salaActual === "Oficina") { fondoSel = "fondo-seleccion-oficina.PNG"; fondoJuego = "fondo-juego-oficina.PNG"; }
    if(salaActual === "Amigos") { fondoSel = "fondo-seleccion-amigos.PNG"; fondoJuego = "fondo-juego-amigos.PNG"; }

    aplicarFondo(pantallas.seleccion, basePath + fondoSel);
    aplicarFondo(pantallas.juego, basePath + fondoJuego);

    socket.emit("unirse-sala", { 
        nickname: usuarioActual.nickname, 
        email: usuarioActual.email,
        sala: salaActual,
        modo: modo
    });

    document.getElementById("tituloSalaActual").textContent = `Sala: ${salaActual}`;
    cambiarPantalla("sala");
}

function aplicarFondo(elemento, imageUrl) {
    elemento.style.backgroundImage = `url("${imageUrl}")`;
    elemento.style.backgroundSize = 'cover';
    elemento.style.backgroundPosition = 'center';
}

// Funcionalidad Botón Salir
if(btnSalirSala) btnSalirSala.addEventListener("click", () => salirDeSalaEnJuego());

function salirDeSalaEnJuego() {
    mostrarConfirmacion("¿Seguro que quieres salir de la sala?", () => {
        socket.emit("salir-sala", salaActual);
        resetearUI();
        cambiarPantalla("menu");
    });
}

function resetearUI() {
  silenciadosEnSala = [];
  pozoAcumulado = 0;
  const chkPozoSalida = document.getElementById("chkPozo");
  if (chkPozoSalida) { chkPozoSalida.checked = false; chkPozoSalida.disabled = false; }
  limpiarFichas();
  seleccionadas = [];
  juegoCartas.innerHTML = "";
  btnIniciar.style.display = "none";
  historial.innerHTML = "";
  haApostadoLocal = false;
  if (btnApostar) btnApostar.disabled = false;
  window.history.pushState({}, document.title, window.location.pathname);
}



// ======================================================
// LÓGICA DE JUEGO (CLIENTE)
// ======================================================

function generarCartas() {
  contenedorCartas.innerHTML = "";
  
  let totalCartasAMostrar = 53;
  
  // Si es Pozo, son 20 cartas
  if (modoJuegoActual === 'pozo') {
      totalCartasAMostrar = 20;
  }

  // Generamos el array de números (1 al total)
  for (let i = 1; i <= totalCartasAMostrar; i++) {
    const img = document.createElement("img");
    
    let nombreArchivo = "";
    let dataId = "";

    if (modoJuegoActual === 'pozo') {
        // CORRECCIÓN POZO: Usamos el número directo (1, 2, 3... 20) SIN CEROS
        nombreArchivo = `${i}.jpg`;
        dataId = String(i); 
    } else {
        // TRADICIONAL: Usamos formato con ceros (01, 02... 54)
        const numeroConCero = String(i).padStart(2, '0');
        nombreArchivo = `${numeroConCero}.jpg`;
        dataId = numeroConCero;
    }

    img.src = `${rutaCartasJugador}${nombreArchivo}`;
    img.classList.add("carta-img");
    img.dataset.id = dataId; // Guardamos el ID limpio

    // Al dar click, seleccionamos y ACTUALIZAMOS EL BOTÓN
    img.onclick = () => {
        seleccionarCarta(img);
        actualizarTextoBotonApuesta();
    };

    // La tabla va envuelta para poder colgarle encima el número de orden.
    // Un <img> no admite ::before ni ::after, por eso hace falta el contenedor.
    const envoltura = document.createElement("div");
    envoltura.className = "carta-seleccion";

    const insignia = document.createElement("span");
    insignia.className = "orden-carta";

    envoltura.appendChild(img);
    envoltura.appendChild(insignia);
    contenedorCartas.appendChild(envoltura);
  } // <--- AQUÍ ESTABA EL ERROR, TENÍAS UN "});" EXTRA. YA LO QUITÉ.
}

/**
 * Pinta sobre cada tabla elegida el lugar que ocupa (1 a 4).
 *
 * Ese orden es el mismo con el que se acomodan en la mesa, así que el jugador
 * decide dónde le queda cada una. Hay que repintarlo entero en cada cambio: si
 * sueltas la segunda, la tercera pasa a ser segunda.
 */
function renumerarSeleccion() {
    document.querySelectorAll("#contenedorCartas .carta-seleccion").forEach(env => {
        const img = env.querySelector(".carta-img");
        const insignia = env.querySelector(".orden-carta");
        if (!img || !insignia) return;
        const lugar = seleccionadas.indexOf(img.dataset.id);
        if (lugar === -1) {
            env.classList.remove("elegida");
            insignia.textContent = "";
        } else {
            env.classList.add("elegida");
            insignia.textContent = lugar + 1;
        }
    });
}

function seleccionarCarta(img) {
  const id = img.dataset.id;
   
  // CASO 1: YA ESTABA SELECCIONADA (DESMARCAR)
  if (seleccionadas.includes(id)) {
      seleccionadas = seleccionadas.filter(c => c !== id);
      img.classList.remove("seleccionada");
      socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
      
      // Lógica del Host (Botón Iniciar)
      if (seleccionadas.length < 2) btnIniciar.style.display = "none";
      
      // ACTUALIZAR PRECIO DEL BOTÓN APOSTAR
      actualizarTextoBotonApuesta();
      renumerarSeleccion();
      return;
  }

  // Verificar si la carta está ocupada por otro (bloqueada)
  if (img.style.pointerEvents === 'none') return; 
   
  // CASO 2: SELECCIONAR NUEVA (MÁXIMO 4)
  if (seleccionadas.length < 4) {
    img.classList.add("seleccionada");
    seleccionadas.push(id);
    socket.emit("seleccionar-carta", { carta: id, sala: salaActual });
    
    // Lógica del Host (Botón Iniciar)
    if (seleccionadas.length >= 2) btnIniciar.style.display = "block";
    
    // ACTUALIZAR PRECIO DEL BOTÓN APOSTAR
    actualizarTextoBotonApuesta();
    renumerarSeleccion();
  }
}

btnIniciar.onclick = () => {
  cambiarPantalla("juego");
  juegoCartas.innerHTML = "";
  
  seleccionadas.forEach(id => {
    const contenedor = document.createElement("div");
    contenedor.classList.add("carta-juego");
    contenedor.dataset.id = id;
    
    // USAMOS LA RUTA DINÁMICA AQUÍ TAMBIÉN
    contenedor.innerHTML = `<img src="${rutaCartasJugador}${id}.jpg" class="carta-img seleccionada">`;
    
    contenedor.onclick = e => marcarFicha(e, contenedor);
    juegoCartas.appendChild(contenedor);
  });
  
  renderizarSonidosJuego();
};

function actualizarTextoBotonApuesta() {
    const btn = document.getElementById("btnApostar");
    if (!btn) return;

    // Contamos cuántas cartas visuales tienen la clase "seleccionada"
    const seleccionadasVisuales = document.querySelectorAll("#contenedorCartas .carta-img.seleccionada").length;
    
    // Calculamos el total
    const totalPagar = seleccionadasVisuales * costoCartaActual;

    if (seleccionadasVisuales > 0) {
        btn.innerText = `Apostar $${totalPagar}`;
        btn.disabled = false;
        btn.style.opacity = "1";
    } else {
        btn.innerText = "Selecciona cartas";
        btn.disabled = true;
        btn.style.opacity = "0.5";
    }
}

function marcarFicha(e, contenedor) {
  const elementoClickeado = e.target;

  if (elementoClickeado.classList.contains("ficha")) {
      if(navigator.vibrate) navigator.vibrate(10);
      elementoClickeado.remove();
      return; 
  }

  const img = contenedor.querySelector("img.carta-img"); 
  if (!img) return;

  const bounds = img.getBoundingClientRect();
  const x = e.clientX - bounds.left;
  const y = e.clientY - bounds.top;
   
  const px = (x / bounds.width) * 100;
  const py = (y / bounds.height) * 100;
   
  if(navigator.vibrate) navigator.vibrate(30);

  const ficha = document.createElement("img");
  
  // CORRECCIÓN: Usamos la skin seleccionada (Bitcoin, Frijol, etc.)
  // Si no ha elegido ninguna, usará la default automáticamente.
  ficha.src = fichaActivaUrl; 
  
  ficha.classList.add("ficha");
  ficha.style.left = `${px}%`;
  ficha.style.top = `${py}%`;
   
  contenedor.appendChild(ficha);
}

function limpiarFichas() {
  document.querySelectorAll(".ficha").forEach(f => f.remove());
}

function cambiarCartas() {
    const ejecutarCambio = () => {
        seleccionadas.forEach(id => {
            socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
        });

        seleccionadas = [];
        limpiarFichas();
        juegoCartas.innerHTML = "";
        btnIniciar.style.display = "none";
        
        document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
            img.classList.remove("seleccionada");
            img.style.opacity = 1;
            img.style.pointerEvents = "auto";
        });
        renumerarSeleccion();

        cambiarPantalla("seleccion");
    };

    const btnDetener = document.getElementById("btnDetenerJuego");
    if(btnDetener && btnDetener.style.display !== "none" && soyHost) {
        mostrarConfirmacion("El juego está corriendo. ¿Pausar para cambiar cartas?", () => {
            socket.emit("detener-juego", salaActual);
            ejecutarCambio();
        });
    } else {
        ejecutarCambio();
    }
}

// ======================================================
// SOCKETS: EVENTOS DEL SERVIDOR
// ======================================================

socket.on('connect', () => {
  miId = socket.id;
  if(usuarioActual && salaActual) {
      socket.emit('reconectar', { sala: salaActual, email: usuarioActual.email });
  }
});

socket.on("rol-asignado", ({ host }) => {
  soyHost = host;
  generarCartas();
   
  const controlesHost = ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "divVelocidad"]; 
   
  controlesHost.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          if (soyHost) {
              el.style.display = (id === "divVelocidad") ? "flex" : "block"; 
          } else {
              el.style.display = "none";
          }
      }
  });
});

socket.on('info-sala', (data) => {
    modoJuegoActual = data.modo;
    costoCartaActual = data.costo;

    // Actualizar Título
    document.getElementById("tituloSalaActual").innerHTML = 
        `Sala: ${escaparHtml(salaActual)} <br><span style="font-size:0.8rem; color:gold;">${escaparHtml(modoJuegoActual).toUpperCase()} ($${costoCartaActual})</span>`;

    // --- LÓGICA DE RUTAS ---
    if (modoJuegoActual === 'pozo') {
        // Si es Pozo, usamos la carpeta especial y solo 20 cartas
        rutaCartasJugador = 'assets/imagenes/cartas/cuatro/'; 
    } else {
        // Si es otro, usamos la carpeta normal
        rutaCartasJugador = 'assets/imagenes/cartas/'; 
    }

    if(btnApostar && seleccionadas.length === 0) {
        btnApostar.innerText = "Selecciona cartas";
        btnApostar.disabled = true;
        btnApostar.style.opacity = "0.5";
    }

    // El pozo solo existe en Tradicional
    const chkP = document.getElementById("chkPozo");
    if (chkP) chkP.disabled = false;
    refrescarPozoUI(); // <--- AQUÍ FALTABA ESTA LLAVE DE CIERRE '}'
    
    // Regenerar el grid de selección con la ruta correcta
    generarCartas();

    // generarCartas() reconstruye el grid desde cero, así que hay que volver a
    // marcar lo que ya estaba elegido. Si no, la pantalla contradice al estado:
    // el jugador tiene sus tablas apartadas en el servidor pero las ve libres.
    restaurarSeleccionVisual();
});

/** Vuelve a marcar en el grid las tablas que ya estaban elegidas. */
function restaurarSeleccionVisual() {
    seleccionadas.forEach(id => {
        const img = document.querySelector(`#contenedorCartas .carta-img[data-id="${id}"]`);
        if (img) img.classList.add("seleccionada");
    });
    renumerarSeleccion();
    actualizarTextoBotonApuesta();
    if (btnApostar && haApostadoLocal) btnApostar.disabled = true;
}

socket.on('estado-sala-restaurado', (estado) => {
    if(estado.cartas && estado.cartas.length > 0) {
        seleccionadas = estado.cartas;
        juegoCartas.innerHTML = "";
        seleccionadas.forEach(id => {
            const contenedor = document.createElement("div");
            contenedor.classList.add("carta-juego");
            contenedor.dataset.id = id;
            contenedor.innerHTML = `<img src="${rutaCartasJugador}${id}.jpg" class="carta-img seleccionada">`;
            contenedor.onclick = e => marcarFicha(e, contenedor);
            juegoCartas.appendChild(contenedor);
        });
        
        if(estado.enJuego) cambiarPantalla("juego");
        else cambiarPantalla("sala"); 
    }
    
    haApostadoLocal = estado.apostado;
    if(btnApostar) btnApostar.disabled = haApostadoLocal;
    
    if(estado.monedas !== undefined) {
        usuarioActual.monedas = estado.monedas;
        configurarMenu();
        actualizarValor(monedasEl, estado.monedas);
    }
});

socket.on("jugadores-actualizados", jugadores => {
  jugadoresGlobal = jugadores;
   
  const misDatos = Object.values(jugadores).find(j => j.email === usuarioActual?.email);
  if (misDatos) {
    actualizarValor(monedasEl, misDatos.monedas);
    haApostadoLocal = misDatos.apostado; 
    usuarioActual.monedas = misDatos.monedas;
    localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
    configurarMenu();
  }
   
  if (btnApostar) btnApostar.disabled = haApostadoLocal;
   
  const htmlLista = "<h3>Jugadores en sala:</h3>" +
    Object.values(jugadores).map(j => {
      const check = j.apostado ? "💸" : "";
      const crown = j.host ? "👑" : ""; 
      
      // LÓGICA DE LA FLAMA 🔥
      let fuego = "";
      if (j.racha > 0) {
          fuego = "🔥";
          if (j.racha > 1) fuego += `<small style="color:orange; font-weight:bold;">x${j.racha}</small>`;
      }

      // Botón de silencio: solo lo ve el anfitrión, y no sobre sí mismo.
      let botonMute = "";
      if (soyHost && j.email && j.email !== usuarioActual?.email) {
          const callado = silenciadosEnSala.includes(j.email);
          botonMute = `<button class="btn-mute ${callado ? 'callado' : ''}"
                        data-accion="silenciar" data-email="${escaparHtml(j.email)}"
                        title="${callado ? 'Devolverle los sonidos' : 'Silenciar sus sonidos'}"
                        >${callado ? '🔇' : '🔊'}</button>`;
      }
      const iconoCallado = (!soyHost && silenciadosEnSala.includes(j.email)) ? ' 🔇' : '';

      // Le damos un estilo "flex" para que se vea alineado
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <span>${crown} ${escaparHtml(j.nickname)} ${fuego}${iconoCallado}</span>
            <span style="display:flex; align-items:center; gap:6px;">${check}${botonMute}</span>
        </div>`;
    }).join("");
    
  if(jugadoresLista) jugadoresLista.innerHTML = htmlLista;
  if(jugadoresListaIngame) jugadoresListaIngame.innerHTML = htmlLista;
});

socket.on('bote-actualizado', (bote) => { actualizarValor(boteEl, bote); });

socket.on("error-apuesta", msg => {
  mostrarAlerta(msg || "Error al apostar", "Ups");
  haApostadoLocal = false;
  if (btnApostar) btnApostar.disabled = false;
});

// SONIDO DE APUESTA (NUEVO)
socket.on("reproducir-sonido-apuesta", () => {
    audioKachin.currentTime = 0; 
    audioKachin.volume = 0.6; 
    audioKachin.play().catch(e => console.log("Audio play error:", e));
    if(navigator.vibrate) navigator.vibrate(50); 
});

// Eventos de Juego
socket.on("barajear", () => {
  audioBarajear.currentTime = 0;
  audioBarajear.play().catch(e => console.warn("Audio:", e));
  historial.innerHTML = "";
  historialIdsGlobal = [];
});

socket.on("campana", () => { audioCampana.currentTime = 0; audioCampana.play().catch(()=>{}); });
socket.on("corre", () => { audioCorre.currentTime = 0; audioCorre.play().catch(()=>{}); });

socket.on("partida-reiniciada", () => {
  limpiarFichas();
  historial.innerHTML = "";
  historialIdsGlobal = [];
});

socket.on("carta-cantada", (cartaId) => {
  const img = document.createElement("img");
  const formattedId = String(cartaId).padStart(2, '0');
  img.src = `assets/imagenes/barajas/${formattedId}.png`; 
  historial.prepend(img);
  historial.scrollLeft = 0;
  historialIdsGlobal.unshift(formattedId);
   
  const audioVoz = new Audio(`assets/audios/${formattedId}.mp3`);
  audioVoz.play();
});

socket.on("cartas-desactivadas", ids => {
  document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
    if (ids.includes(img.dataset.id) && !seleccionadas.includes(img.dataset.id)) {
      img.style.opacity = 0.3;
      img.style.pointerEvents = "none";
    } else {
      img.style.opacity = 1;
      img.style.pointerEvents = "auto";
    }
  });
});

socket.on("juego-detenido", () => {
    if (soyHost) audioCorre.pause();
});

// ======================================================
// LOTERÍA (GANADORES)
// ======================================================

function emitirLoteria() {
  audioCorre.pause();
  audioCampana.pause();
  audioBarajear.pause();
   
  // AQUI AGREGAMOS "skin: fichaActivaUrl" PARA QUE SEPAN CUÁL USAMOS
  const boardState = { 
      cards: seleccionadas, 
      chips: {}, 
      skin: fichaActivaUrl 
  };

  document.querySelectorAll('#juegoCartas .carta-juego').forEach(cardContainer => {
    const cardId = cardContainer.dataset.id;
    const cardChips = [];
    cardContainer.querySelectorAll('.ficha').forEach(ficha => {
      cardChips.push({ left: ficha.style.left, top: ficha.style.top });
    });
    if (cardChips.length > 0) boardState.chips[cardId] = cardChips;
  });

  socket.emit("loteria", { nickname: usuarioActual.nickname, sala: salaActual, boardState });
}

socket.on("pausa-empate", ({ primerGanador, tiempo }) => {
    loteriaMensaje.style.display = "block";
    loteriaMensaje.innerHTML = `
        <div style="font-size:2rem; color: gold; text-shadow: 2px 2px 0 #000;">¡${escaparHtml(primerGanador)} gritó BUENAS!</div>
        <div style="font-size:1.2rem; margin-top:20px; color: white;">Esperando empates... <span id="contadorEmpate" style="font-weight:bold; font-size:1.5rem;">${tiempo}</span>s</div>
    `;
    
    let timeLeft = tiempo;
    const timer = setInterval(() => {
        timeLeft--;
        const el = document.getElementById("contadorEmpate");
        if(el) el.textContent = timeLeft;
        if(timeLeft <= 0) clearInterval(timer);
    }, 1000);
});

socket.on("notificar-otro-ganador", (otroNick) => {
    loteriaMensaje.innerHTML += `<div style="font-size:1.5rem; color:#ff4081; font-weight:bold; margin-top:10px; animation: pulsate 0.5s infinite;">¡${escaparHtml(otroNick)} TAMBIÉN GRITÓ!</div>`;
    if(navigator.vibrate) navigator.vibrate([100, 100]);
});

socket.on("iniciar-validacion-secuencial", (listaReclamantes) => {
    loteriaMensaje.style.display = "none"; 
    procesarSiguienteValidacion(listaReclamantes);
});

socket.on("continuar-validacion", (listaReclamantes) => {
    procesarSiguienteValidacion(listaReclamantes);
});

function procesarSiguienteValidacion(lista) {
    const siguiente = lista.find(r => r.status === 'pendiente');
    if (siguiente) {
        const total = lista.length;
        const index = lista.filter(r => r.status !== 'pendiente').length + 1;
        abrirModalValidacionHost(siguiente, index, total);
    }
}

function abrirModalValidacionHost(candidato, index, total) {
    ganadorTempId = candidato.id;
    
    modalLoteriaTitulo.textContent = `Validando Ganador (${index} de ${total})`;
    modalLoteriaTexto.textContent = `${candidato.nickname} reclama victoria. Revisa su tabla.`;
    
    // Historial (Cartas cantadas - Estas siempre son de la baraja normal)
    const modalHistorialFlex = document.getElementById("modalHistorialFlex");
    modalHistorialFlex.innerHTML = "";
    tablaGanadoraElegida = null;

    const aviso = document.getElementById("avisoCartaGanadora");
    if (aviso) aviso.textContent = "Toca la tabla que se llenó (opcional)";

    historialIdsGlobal.forEach(cartaId => {
         const img = document.createElement("img");
         img.src = `assets/imagenes/barajas/${cartaId}.png`;
         modalHistorialFlex.appendChild(img);
    });

    // Tabla del Jugador (AQUÍ ESTABA EL ERROR)
    modalVerificationArea.innerHTML = '';
    const bs = candidato.boardState;
    
    // Recuperamos la skin del jugador o usamos la default si no viene
    const skinJugador = bs.skin || "assets/imagenes/ui/ficha.PNG";

    if (bs && bs.cards) {
        bs.cards.forEach(cardId => {
            const cardContainer = document.createElement('div');
            cardContainer.className = 'carta-juego';
            
            const cardImg = document.createElement('img');
            
            // --- CORRECCIÓN 1: USAR LA RUTA DINÁMICA ---
            // Ya no usamos "assets/imagenes/cartas/...", usamos la variable
            cardImg.src = `${rutaCartasJugador}${cardId}.jpg`;
            
            cardImg.className = 'carta-img seleccionada';
            cardImg.style.pointerEvents = "none";
            cardContainer.appendChild(cardImg);

            // El anfitrión marca CUÁL de las tablas se llenó. Esa es la prueba
            // que se le enseña a la sala: la tabla completa con sus fichas.
            cardContainer.dataset.tabla = cardId;
            cardContainer.classList.add("tabla-validable");
            cardContainer.onclick = () => elegirTablaGanadora(cardId);
            
            if (bs.chips && bs.chips[cardId]) {
                bs.chips[cardId].forEach(chipPos => {
                    const ficha = document.createElement("img");
                    
                    // --- CORRECCIÓN 2: USAR LA SKIN DEL JUGADOR ---
                    ficha.src = skinJugador;
                    
                    ficha.className = "ficha";
                    ficha.style.left = chipPos.left;
                    ficha.style.top = chipPos.top;
                    ficha.style.pointerEvents = "none";
                    cardContainer.appendChild(ficha);
                });
            }
            modalVerificationArea.appendChild(cardContainer);
        });
    }
    
    // La casilla del pozo solo tiene sentido si hay algo acumulado.
    const vered = document.getElementById("pozoVeredicto");
    const chkPozoWin = document.getElementById("chkGanoPozo");
    if (vered) {
        const aplica = pozoDisponible() && pozoAcumulado > 0;
        vered.style.display = aplica ? "flex" : "none";
        if (chkPozoWin) chkPozoWin.checked = false;
        if (aplica) {
            vered.querySelector("span").textContent =
                `🎰 También se llevó el POZO de $${pozoAcumulado} (llenó las 4 del centro)`;
        }
    }

    loteriaModal.classList.add("active");
}

// Cuál de las tablas del reclamante fue la que se llenó. La marca el anfitrión.
let tablaGanadoraElegida = null;

function elegirTablaGanadora(tablaId) {
    tablaGanadoraElegida = (tablaGanadoraElegida === tablaId) ? null : tablaId;
    document.querySelectorAll("#modalVerificationArea .tabla-validable").forEach(cont => {
        cont.classList.toggle("elegida-ganadora", cont.dataset.tabla === tablaGanadoraElegida);
    });
    const aviso = document.getElementById("avisoCartaGanadora");
    if (aviso) {
        aviso.textContent = tablaGanadoraElegida
            ? "Marcada la tabla ganadora ✓"
            : "Toca la tabla que se llenó (opcional)";
    }
}

if(btnAceptarGanador) btnAceptarGanador.onclick = () => {
    if (ganadorTempId) {
        const chkPozoWin = document.getElementById("chkGanoPozo");
        socket.emit("veredicto-host", {
            sala: salaActual, candidatoId: ganadorTempId, esValido: true,
            tablaGanadora: tablaGanadoraElegida,
            ganoPozo: !!(chkPozoWin && chkPozoWin.checked)
        });
        if (chkPozoWin) chkPozoWin.checked = false;
        loteriaModal.classList.remove("active"); 
    }
};

if(btnRechazarGanador) btnRechazarGanador.onclick = () => {
    if (ganadorTempId) {
        socket.emit("veredicto-host", { sala: salaActual, candidatoId: ganadorTempId, esValido: false });
        loteriaModal.classList.remove("active");
    }
};

socket.on("ganadores-multiples", ({ ganadores, premio, prueba, pozoGanado, ganadorPozo }) => {
    loteriaMensaje.style.display = "none";
    // Se vuelve a habilitar pero NO se desmarca: entrar al pozo es una decisión
    // que dura mientras estés en la sala, no una casilla que haya que picar cada
    // partida. Se suelta al salir de la sala.
    const chkP = document.getElementById("chkPozo");
    if (chkP) chkP.disabled = false;
    let msg = "";
    if (ganadores.length > 1) {
        msg = `¡EMPATE! 🤝\nGanadores: ${ganadores.join(", ")}\nSe llevan ${premio} monedas cada uno.`;
    } else {
        msg = `¡TENEMOS GANADOR! 🏆\n${ganadores[0]} se lleva ${premio} monedas.`;
    }
    if (pozoGanado > 0 && ganadorPozo) {
        msg += `\n\n🎰 ¡Y SE LLEVÓ EL POZO!\n${ganadorPozo} suma ${pozoGanado} monedas más.`;
    }
    mostrarAlerta(msg, "¡RESULTADO FINAL!", prueba);
    
    audioAplausos.currentTime = 0;
    audioAplausos.play().catch(()=>{});
    if(navigator.vibrate) navigator.vibrate([100,50,100,50,500]);

    for (let i = 0; i < 100; i++) {
        const confeti = document.createElement("div");
        confeti.classList.add("confeti");
        confeti.style.left = Math.random() * 100 + "vw";
        confeti.style.top = "-10px";
        confeti.style.backgroundColor = `hsl(${Math.random()*360}, 100%, 50%)`;
        confeti.style.animationDelay = (Math.random() * 2) + "s";
        document.body.appendChild(confeti);
        confeti.addEventListener("animationend", () => confeti.remove());
    }
});

socket.on("falsa-alarma-masiva", () => {
    loteriaMensaje.style.display = "none";
    mostrarAlerta("Todos los reclamos fueron rechazados. ¡Sigue el juego!", "Falsa Alarma 🤡");
    audioCorre.play().catch(()=>{});
});


// APUESTAS
if(btnApostar) btnApostar.addEventListener("click", () => {
  if (!salaActual) return mostrarAlerta("Únete a una sala primero.");
  if (haApostadoLocal) return mostrarAlerta("Ya apostaste esta ronda.");
  
  // Calculamos la cantidad (por defecto 1 o el número de cartas)
  const cantidad = Math.max(1, seleccionadas.length || 1);
  
  const chk = document.getElementById("chkPozo");
  const conPozo = !!(chk && chk.checked && pozoDisponible());

  animarVueloMonedas();
  if (conPozo) animarVueloMonedas("pozo-valor");

  socket.emit("apostar", {
      sala: salaActual,
      cantidad: cantidad,
      email: usuarioActual.email, // <--- ESTA LÍNEA ES LA CLAVE
      conPozo: conPozo
  });

  // Ya no se puede cambiar de opinión en esta ronda.
  if (chk) chk.disabled = true;
  
  haApostadoLocal = true;
  btnApostar.disabled = true;
});

// ==================== TIENDA / PAGOS ====================

function abrirModalRecarga() {
    const modal = document.getElementById('modalTienda');
    if(modal) {
        modal.classList.add('active');
        volverAPaquetes(); 
        if(navigator.vibrate) navigator.vibrate(50);
    }
}

function cerrarTienda() {
    const modal = document.getElementById('modalTienda');
    if(modal) modal.classList.remove('active');
    if(checkoutInstance) {
        checkoutInstance.destroy();
        checkoutInstance = null;
    }
}

function volverAPaquetes() {
    document.getElementById("seccionPaquetes").style.display = "block";
    document.getElementById("checkout").style.display = "none";
    document.getElementById("btnVolverPaquetes").style.display = "none";
    document.getElementById("tituloTienda").textContent = "Tienda de Monedas";
    if(checkoutInstance) {
        checkoutInstance.destroy();
        checkoutInstance = null;
    }
}

async function iniciarPagoEmbedded(cantidadMonedas) {
    if(!usuarioActual || !usuarioActual.email) return mostrarAlerta("Necesitas iniciar sesión.");

    let precio = 0;
    if(cantidadMonedas === 50) precio = 29.99;
    if(cantidadMonedas === 150) precio = 79.99;
    if(cantidadMonedas === 500) precio = 199.99;

    document.getElementById("seccionPaquetes").style.display = "none";
    const checkoutDiv = document.getElementById("checkout");
    checkoutDiv.style.display = "block";
    checkoutDiv.innerHTML = '<p style="text-align:center; padding:20px;">Cargando pago seguro...</p>';
    document.getElementById("tituloTienda").textContent = "Completar Compra";
    document.getElementById("btnVolverPaquetes").style.display = "block";

    try {
        const res = await api(`/crear-orden`, {
            method: 'POST',
            body: JSON.stringify({
                cantidad: cantidadMonedas,
                precio: precio,
                email: usuarioActual.email,
                // Se declara explícitamente para que Stripe devuelva AQUÍ y no al
                // Hub si el pago se cancela. El servidor lo asume por defecto,
                // pero conviene no depender de un valor implícito cuando de eso
                // depende dónde acaba el jugador.
                origen: 'loteria'
            })
        });
        
        const { clientSecret } = await res.json();
        
        if(!clientSecret) throw new Error("No se recibió clave de pago");

        checkoutDiv.innerHTML = ""; 
        
        checkoutInstance = await stripePromise.initEmbeddedCheckout({ clientSecret });
        checkoutInstance.mount('#checkout');

    } catch (error) {
        console.error(error);
        mostrarAlerta("Error al cargar el pago. Intenta de nuevo.", "Error");
        volverAPaquetes();
    }
}

// ==================== PRESETS DE CARTAS ====================

async function guardarSetFavorito(boton) {
    if(seleccionadas.length === 0) return mostrarAlerta("Selecciona cartas primero.");
    
    // 1. Guardado Local
    localStorage.setItem("loteria_cartas_fav", JSON.stringify(seleccionadas));
    
    // 2. Guardado en Nube (BD)
    if(usuarioActual && usuarioActual.email) {
        try {
            const btn = boton; // el botón llega desde el despachador de acciones
            if (!btn) throw new Error('sin botón');
            const textoOriginal = btn.innerText;
            btn.innerText = "Guardando...";
            
            await api(`/usuario/guardar-preferencias`, {
                method: 'POST',
                body: JSON.stringify({ 
                    email: usuarioActual.email, 
                    cartasFavoritas: seleccionadas 
                })
            });
            
            // Actualizamos el objeto local
            usuarioActual.cartasFavoritas = seleccionadas;
            localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
            
            btn.innerText = textoOriginal;
            mostrarAlerta("¡Cartas guardadas en tu cuenta! ☁️", "Guardado");
        } catch (e) {
            console.error(e);
            mostrarAlerta("Se guardó localmente, pero falló la nube.", "Aviso");
        }
    } else {
        mostrarAlerta("Inicia sesión para guardar en la nube.", "Guardado Local");
    }
}

function cargarSetFavorito() {
    let idsFavoritos = [];

    // 1. Intentar leer del usuario logueado (Nube)
    if (usuarioActual && usuarioActual.cartasFavoritas && usuarioActual.cartasFavoritas.length > 0) {
        idsFavoritos = usuarioActual.cartasFavoritas;
    } 
    // 2. Si no, intentar leer del localStorage (Local)
    else {
        const guardadas = localStorage.getItem("loteria_cartas_fav");
        if (guardadas) idsFavoritos = JSON.parse(guardadas);
    }

    if(idsFavoritos.length === 0) return mostrarAlerta("No tienes ningún set guardado.", "Sin datos");
    
    // Lógica de selección visual
    seleccionadas.forEach(id => {
        socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
    });
    seleccionadas = [];
    
    document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
        img.classList.remove("seleccionada");
    });

    idsFavoritos.forEach((id, index) => {
        setTimeout(() => {
            const img = document.querySelector(`.carta-img[data-id="${id}"]`);
            if(img) seleccionarCarta(img);
            renumerarSeleccion();
        }, index * 50);
    });
    
    mostrarAlerta("Tus cartas favoritas han sido cargadas.", "Listo");
}

function iniciarJuegoConVelocidad() {
    const selector = document.getElementById("velocidadJuego");
    const velocidad = selector ? parseInt(selector.value) : 3000;
    socket.emit('iniciar-juego', { sala: salaActual, velocidad: velocidad });
}

// ==================== PANEL DE ADMINISTRADOR ====================

// El email del admin ya NO vive aquí: este archivo es público y lo servía de bandeja
// a cualquiera que abriera el sitio. Ahora el servidor manda el flag 'esAdmin' en la
// respuesta del login, y él es quien autoriza de verdad en cada endpoint.
// Esto solo decide si se pinta el botón.
function verificarSiSoyAdmin() {
    const btnAdmin = document.getElementById("btnPanelAdmin");
    if (!btnAdmin) return;
    btnAdmin.style.display = (usuarioActual && usuarioActual.esAdmin) ? "block" : "none";
}

function abrirPanelAdmin() {
    cambiarPantalla("pantallaAdmin");
    cargarUsuariosAdmin();
}

async function cargarUsuariosAdmin() {
    const tbody = document.getElementById("tablaUsuariosAdmin");
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';

    try {
        const res = await api(`/admin/usuarios`, {
            method: 'GET',
            headers: { 'admin-email': usuarioActual.email }
        });
        
        if (!res.ok) throw new Error("Sin permiso");
        
        const usuarios = await res.json();
        tbody.innerHTML = ""; 

        usuarios.forEach(u => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:8px; font-weight:bold;">${escaparHtml(u.nickname)}</td>
                <td style="padding:8px; font-size:0.8rem; color:#ccc;">${escaparHtml(u.email)}</td>
                <td style="padding:8px; color:gold;">${u.monedas}</td>
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

function prepararRecarga(email) {
    const inputEmail = document.getElementById("adminInputEmail");
    const inputMonedas = document.getElementById("adminInputMonedas");
    
    if(inputEmail) inputEmail.value = email;
    if(inputMonedas) inputMonedas.focus();
}

async function ejecutarRecargaAdmin() {
    const targetEmail = document.getElementById("adminInputEmail").value;
    const cantidad = document.getElementById("adminInputMonedas").value;

    if (!targetEmail || !cantidad) return mostrarAlerta("Faltan datos");

    mostrarConfirmacion(`¿Dar ${cantidad} monedas a ${targetEmail}?`, async () => {
        try {
            const res = await api(`/admin/recargar-manual`, {
                method: 'POST',
                body: JSON.stringify({
                    adminEmail: usuarioActual.email,
                    targetEmail: targetEmail,
                    cantidad: parseInt(cantidad)
                })
            });

            const data = await res.json();
            if (data.success) {
                mostrarAlerta("Recarga exitosa", "Hecho");
                cargarUsuariosAdmin(); 
                document.getElementById("adminInputMonedas").value = "";
            } else {
                mostrarAlerta("Error: " + data.error);
            }
        } catch (e) {
            mostrarAlerta("Error de conexión", "Fallo");
        }
    });
}

// ==================== LÓGICA DE TIENDA (MEJORADA) ====================

// Los catálogos de sonidos y fichas viven en modulos/config.js.

// Ficha activa localmente (Persistencia)
let fichaActivaUrl = FICHA_POR_DEFECTO;

const audioPlayerTienda = new Audio();

// Función auxiliar para actualizar saldo en el menú principal
function actualizarSaldoUI() {
    if(!usuarioActual) return;
    const menuMonedasEl = document.getElementById('menuMonedas');
    const saldoTiendaEl = document.getElementById('saldoTienda');
    
    if(menuMonedasEl) menuMonedasEl.textContent = usuarioActual.monedas;
    if(saldoTiendaEl) saldoTiendaEl.innerHTML = `Tu saldo: <span style="color:white;">$${usuarioActual.monedas}</span>`;
}

// Recargar saldo al iniciar (Llama a esto en window.onload y login)
function cargarTienda() {
    actualizarSaldoUI();
}

// --- ABRIR CATEGORÍA ---
let categoriaActual = '';

function abrirCategoriaTienda(categoria) {
    categoriaActual = categoria;
    const modal = document.getElementById("modalTiendaDetalle");
    const titulo = document.getElementById("tituloCategoriaTienda");
    const grid = document.getElementById("gridTiendaItems");
    
    modal.classList.add("active");
    grid.innerHTML = ""; // Limpiar

    if (categoria === 'sonidos') {
        titulo.textContent = "Efectos de Sonido 🔊";
        renderizarSonidos(grid);
    } else if (categoria === 'fichas') {
        titulo.textContent = "Skins de Fichas 🟣";
        renderizarFichas(grid);
    }
}

function cerrarModalTiendaDetalle() {
    document.getElementById("modalTiendaDetalle").classList.remove("active");
}

// --- RENDERIZADO DE ITEMS ---

function renderizarSonidos(contenedor) {
    if (!usuarioActual) return;
    const inventario = usuarioActual.inventario || [];

    catalogoSonidos.forEach(item => {
        const yaLoTiene = inventario.includes(item.id) || item.precio === 0;
        
        const div = document.createElement('div');
        div.className = "item-tienda-card";
        
        // Botón de acción
        let btnHtml = '';
        if (yaLoTiene) {
            btnHtml = `<button class="btn-owned">✔ Listo</button>`;
        } else {
            btnHtml = `<button class="btn-buy" data-accion="comprar-item" data-item="${item.id}" data-precio="${item.precio}">$${item.precio}</button>`;
        }

        div.innerHTML = `
            <div style="font-size: 2rem; cursor:pointer;" data-accion="oir-sonido" data-archivo="${item.file}">${item.emoji}</div>
            <span class="item-nombre">${item.nombre}</span>
            ${btnHtml}
        `;
        contenedor.appendChild(div);
    });
}

function renderizarFichas(contenedor) {
    if (!usuarioActual) return;
    const inventario = usuarioActual.inventario || [];

    catalogoFichas.forEach(item => {
        // La default siempre la tiene (precio 0 o ID default)
        const yaLoTiene = inventario.includes(item.id) || item.precio === 0;
        const esLaActiva = (item.img === fichaActivaUrl);

        const div = document.createElement('div');
        div.className = "item-tienda-card";
        
        let btnHtml = '';
        if (esLaActiva) {
            btnHtml = `<button class="btn-use btn-active">En Uso</button>`;
        } else if (yaLoTiene) {
            btnHtml = `<button class="btn-use" data-accion="usar-ficha" data-img="${item.img}">Usar</button>`;
        } else {
            btnHtml = `<button class="btn-buy" data-accion="comprar-item" data-item="${item.id}" data-precio="${item.precio}">$${item.precio}</button>`;
        }

        div.innerHTML = `
            <img src="${item.img}" class="preview-img-tienda">
            <span class="item-nombre">${item.nombre}</span>
            ${btnHtml}
        `;
        contenedor.appendChild(div);
    });
}

// --- ACCIONES ---

function previewSonido(ruta) {
    audioPlayerTienda.src = ruta;
    audioPlayerTienda.volume = 0.5;
    audioPlayerTienda.play().catch(e => console.log("Error preview:", e));
}

// Función para ACTIVAR una ficha (Guardar en la Nube)
async function usarFicha(urlImagen) {
    // CORRECCIÓN: Aquí decía 'usuarioHub', debe ser 'usuarioActual'
    if(!usuarioActual) return; 

    // 1. Actualización Local (Rápida / Optimistic UI)
    fichaActivaUrl = urlImagen;
    usuarioActual.fichaActiva = urlImagen; // Guardamos en el objeto en memoria
    localStorage.setItem("loteria_ficha_activa", urlImagen); // Backup local
    localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual)); // Actualizar sesión local completa

    // Refrescar modal visualmente para que aparezca el botón verde "En Uso"
    const grid = document.getElementById("gridTiendaItems");
    if(grid) {
        grid.innerHTML = "";
        renderizarFichas(grid);
    }
    
    // Feedback visual inmediato
    mostrarAlerta("¡Ficha actualizada!", "Estilo Nuevo 😎");

    // 2. GUARDAR EN BASE DE DATOS (PERSISTENCIA REAL)
    try {
        await api(`/usuario/guardar-preferencias`, {
            method: 'POST',
            body: JSON.stringify({ 
                email: usuarioActual.email, // <--- Aquí también corregido
                fichaActiva: urlImagen 
            })
        });
        console.log("Skin guardada en la nube");
    } catch (e) {
        console.error("No se pudo guardar en la nube", e);
        // No mostramos alerta de error para no interrumpir, ya que localmente sí funcionó
    }
}

// Comprar (Genérico para sonidos y fichas)
async function comprarItem(itemId, precio) {
    if (!usuarioActual) return;

    if (usuarioActual.monedas < precio) {
        if(confirm("¡No tienes suficientes monedas! ¿Quieres recargar?")) {
            cerrarModalTiendaDetalle(); // Cerrar detalle para abrir recarga
            abrirModalRecarga();
        }
        return;
    }

    if (precio > 0) {
        if (!confirm(`¿Comprar por $${precio} monedas?`)) return;
    }

    // --- OPTIMISTIC UI ---
    usuarioActual.monedas -= precio;
    if (!usuarioActual.inventario) usuarioActual.inventario = [];
    usuarioActual.inventario.push(itemId);
    
    actualizarSaldoUI();
    
    // Refrescar modal actual
    const grid = document.getElementById("gridTiendaItems");
    grid.innerHTML = "";
    if(categoriaActual === 'sonidos') renderizarSonidos(grid);
    if(categoriaActual === 'fichas') renderizarFichas(grid);

    // --- ENVIAR AL SERVIDOR ---
    socket.emit('comprar-item', { 
        email: usuarioActual.email, 
        itemId: itemId, 
        precio: precio 
    });
}

// ==================== SISTEMA DE SONIDOS EN JUEGO (SOUNDBOARD) ====================

let spamCooldown = false; 

// 1. Alternar visibilidad del menú
function toggleMenuSonidos() {
    const menu = document.getElementById("menuSonidosDesplegable");
    if(menu) {
        menu.classList.toggle("mostrar");
        if (menu.classList.contains("mostrar")) {
            renderizarSonidosJuego();
        }
    }
}

// 2. Renderizar burbujas de emojis
function renderizarSonidosJuego() {
    const contenedor = document.getElementById("menuSonidosDesplegable");
    if(!contenedor) return;
    contenedor.innerHTML = "";
    
    if (!usuarioActual) return;
    
    const inventario = usuarioActual.inventario || [];
    
    // Filtramos del catálogo los que el usuario TIENE (o son gratis)
    const misSonidos = catalogoSonidos.filter(item => {
        return inventario.includes(item.id) || item.precio === 0;
    });

    if (misSonidos.length === 0) {
        contenedor.innerHTML = "<span style='font-size:0.7rem; color:white;'>Sin sonidos</span>";
        return;
    }

    misSonidos.forEach(sound => {
        const btn = document.createElement("button");
        btn.className = "btn-emoji-sonido";
        btn.innerHTML = sound.emoji;
        btn.onclick = () => enviarEfectoSonido(sound.id);
        contenedor.appendChild(btn);
    });
}

// 3. Enviar evento al servidor (YO presiono el botón)
function enviarEfectoSonido(soundId) {
    if (spamCooldown) return; 
    
    spamCooldown = true;
    setTimeout(() => { spamCooldown = false }, 1000);

    socket.emit("enviar-efecto-sonido", { 
        sala: salaActual, 
        soundId: soundId,
        emisor: usuarioActual.nickname 
    });
}

// 4. Recibir evento del servidor (ALGUIEN presionó el botón)
socket.on("reproducir-efecto-sonido", ({ soundId, emisor }) => {
    const sonidoData = catalogoSonidos.find(s => s.id === soundId);
    
    if (sonidoData) {
        const audio = new Audio(sonidoData.file);
        audio.volume = 0.8; 
        audio.play().catch(e => console.log("Error playing effect:", e));
        
        mostrarNotificacionFlotante(`${emisor}: ${sonidoData.emoji}`);
    }
});

function mostrarNotificacionFlotante(texto) {
    const notif = document.createElement("div");
    notif.innerText = texto;
    notif.style.position = "fixed";
    notif.style.bottom = "90px"; 
    notif.style.left = "20px";
    notif.style.background = "rgba(0,0,0,0.7)";
    notif.style.color = "gold";
    notif.style.padding = "5px 10px";
    notif.style.borderRadius = "10px";
    notif.style.zIndex = "2001";
    notif.style.fontSize = "0.9rem";
    notif.style.animation = "flotarDesvanecer 2s forwards";
    
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
}

// ==================== SINCRONIZACIÓN EN TIEMPO REAL (MASTER LISTENER) ====================

socket.on('usuario-actualizado', (datosFrescos) => {
    // Se registra solo el saldo, no el objeto entero: volcarlo completo dejaba a
    // la vista en la consola todo lo que trajera el perfil.
    console.log("📥 Datos sincronizados. Saldo:", datosFrescos.monedas);

    if (usuarioActual) {
        // 1. Actualizar datos base
        usuarioActual.monedas = datosFrescos.monedas;
        usuarioActual.inventario = datosFrescos.inventario || [];
        
        // 2. 🔥 RESTAURAR PREFERENCIAS (FIX HUB SSO) 🔥
        // Si la BD trae una ficha activa, la forzamos en la sesión local
        if (datosFrescos.fichaActiva) {
            usuarioActual.fichaActiva = datosFrescos.fichaActiva;
            fichaActivaUrl = datosFrescos.fichaActiva; // Actualizar variable global del juego
            localStorage.setItem("loteria_ficha_activa", datosFrescos.fichaActiva); // Persistir
        }

        // Si la BD trae cartas favoritas, las guardamos en localStorage
        if (datosFrescos.cartasFavoritas && datosFrescos.cartasFavoritas.length > 0) {
            usuarioActual.cartasFavoritas = datosFrescos.cartasFavoritas;
            localStorage.setItem("loteria_cartas_fav", JSON.stringify(datosFrescos.cartasFavoritas));
        }

        // Guardamos el objeto completo actualizado
        localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
    }

    // --- ACTUALIZAR TODAS LAS ETIQUETAS DE LA UI AL MISMO TIEMPO ---

    // 1. Menú Principal (Monedero - SOLO NÚMERO)
    const menuMonedas = document.getElementById("menuMonedas");
    if(menuMonedas) menuMonedas.textContent = datosFrescos.monedas;

    // 2. Tienda
    const saldoTienda = document.getElementById("saldoTienda");
    if(saldoTienda) saldoTienda.innerHTML = `Tu saldo: <span style="color:white;">$${datosFrescos.monedas}</span>`;
    
    // Si la tienda está visible, recargamos la lista para que se marquen los items comprados
    if(document.querySelector('.tienda-card') || document.getElementById('modalTiendaDetalle').classList.contains('active')) {
        // Si el modal de detalles está abierto, refrescamos para ver el botón "En Uso"
        const grid = document.getElementById("gridTiendaItems");
        if(grid && grid.innerHTML !== "") {
             if(categoriaActual === 'fichas') renderizarFichas(grid);
        }
    }

    // 3. Juego
    const gameMonedas = document.getElementById("monedas-valor");
    actualizarValor(gameMonedas, datosFrescos.monedas);

    // 4. Soundboard
    const menuSonidos = document.getElementById("menuSonidosDesplegable");
    if(menuSonidos && menuSonidos.classList.contains("mostrar")) {
        renderizarSonidosJuego();
    }
});

function sincronizarDatosForzoso() {
    if(usuarioActual && usuarioActual.email) {
        console.log("🔄 Pidiendo datos frescos al servidor...");
        socket.emit('solicitar-info-usuario', usuarioActual.email);
    }
}

// ==================== SISTEMA DE TRANSFERENCIAS (FINAL Y CORREGIDO) ====================

let destinatarioConfirmado = null; // Guardamos aquí los datos del usuario encontrado

// 1. ABRIR EL MODAL
window.abrirModalTransferencia = function() {
    const modal = document.getElementById("modalTransferencia");
    if(modal) {
        modal.classList.add("visible"); // Usamos la clase .visible que pusimos en el CSS
        modal.style.opacity = "1";
        modal.style.visibility = "visible";
        modal.style.pointerEvents = "all";
        
        // Resetear formulario visualmente
        const inputDest = document.getElementById("inputDestinatario");
        const inputMonto = document.getElementById("inputMontoTransferir");
        
        if(inputDest) inputDest.value = "";
        if(inputMonto) inputMonto.value = "";
        
        // Volver al Paso 1 (Buscar) y ocultar el Paso 2 (Monto)
        const step1 = document.getElementById("step-find-user");
        const step2 = document.getElementById("step-amount");
        
        if(step1) step1.style.display = "block";
        if(step2) step2.style.display = "none";
        
        destinatarioConfirmado = null;
    } else {
        console.error("No se encontró el modal #modalTransferencia");
    }
}

// 2. CERRAR EL MODAL
window.cerrarModalTransferencia = function() {
    const modal = document.getElementById("modalTransferencia");
    if(modal) {
        modal.classList.remove("visible");
        modal.style.opacity = "0";
        modal.style.visibility = "hidden";
        modal.style.pointerEvents = "none";
    }
}

// 3. CANCELAR (Botón Rojo dentro del modal)
window.cancelarTransferencia = function() {
    document.getElementById("step-find-user").style.display = "block";
    document.getElementById("step-amount").style.display = "none";
    destinatarioConfirmado = null;
}

// 4. LÓGICA DE BÚSQUEDA (CORREGIDO PARA ESPACIOS)
window.verificarDestinatario = async (boton) => {
    const inputDest = document.getElementById("inputDestinatario");
    // .trim() quita espacios al inicio y final, pero respeta los de en medio ("La Gata")
    const nickname = inputDest.value.trim(); 
    
    const btnBuscar = boton;

    const textoOriginal = btnBuscar.innerText;

    if (!nickname) return mostrarAlerta("Escribe un nickname", "Dato faltante");
    if (usuarioActual && nickname === usuarioActual.nickname) return mostrarAlerta("No puedes enviarte a ti mismo", "Error");

    btnBuscar.innerText = "🔍 Buscando...";
    btnBuscar.disabled = true;

    try {
        // --- CAMBIO CLAVE: USAMOS POST Y JSON ---
        const res = await api(`/buscar-destinatario`, {
            method: 'POST',
            body: JSON.stringify({ nickname: nickname })
        });
        
        const data = await res.json();

        if (data.success) {
            destinatarioConfirmado = data.destinatario; 
            
            document.getElementById("step-find-user").style.display = "none";
            document.getElementById("step-amount").style.display = "block";
            
            const msg = document.getElementById("userFoundMsg");
            if(msg) msg.textContent = `✅ Enviar a: ${destinatarioConfirmado.nickname}`;
            
            const inputMonto = document.getElementById("inputMontoTransferir");
            if(inputMonto) inputMonto.focus();

        } else {
            mostrarAlerta("❌ Jugador no encontrado. Verifica mayúsculas y espacios.", "No existe");
            destinatarioConfirmado = null;
        }

    } catch (e) {
        console.error(e);
        mostrarAlerta("Error de conexión con el servidor.", "Error de Red");
    } finally {
        btnBuscar.innerText = textoOriginal;
        btnBuscar.disabled = false;
    }
};

// 5. LÓGICA DE ENVÍO (Botón "ENVIAR")
window.realizarTransferencia = async (boton) => {
    // Usamos el ID correcto que tienes en tu HTML: inputMontoTransferir
    const inputMonto = document.getElementById("inputMontoTransferir");
    const monto = parseInt(inputMonto.value);
    
    if(!destinatarioConfirmado) return mostrarAlerta("Error interno: Destinatario perdido. Busca de nuevo.", "Error");
    if(!monto || monto < 2) return mostrarAlerta("La transferencia mínima es de $2 monedas", "Monto inválido");
    if(monto > usuarioActual.monedas) return mostrarAlerta("No tienes suficientes monedas", "Saldo insuficiente");

    // Confirmación final antes de enviar
    mostrarConfirmacion(`¿Seguro que quieres enviar $${monto} monedas a ${destinatarioConfirmado.nickname}?`, async () => {
        
        // Feedback visual en el botón de confirmar
        const btnConfirmar = boton || document.querySelector("#step-amount button:last-child");
        let textoBtnOriginal = "CONFIRMAR";
        if(btnConfirmar) {
            textoBtnOriginal = btnConfirmar.innerText;
            btnConfirmar.innerText = "Enviando...";
            btnConfirmar.disabled = true;
        }
        
        try {
            const res = await api(`/transferir-saldo`, {
                method: 'POST',
                body: JSON.stringify({
                    origenEmail: usuarioActual.email,
                    destinoEmail: destinatarioConfirmado.email,
                    cantidad: monto
                })
            });

            const data = await res.json();
            
            if (data.success) {
                // 1. Actualizar saldo local inmediatamente (Optimistic UI)
                usuarioActual.monedas -= monto;
                localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
                
                // 2. Actualizar etiquetas de texto en el menú
                const menuMonedas = document.getElementById("menuMonedas");
                if(menuMonedas) menuMonedas.textContent = usuarioActual.monedas;
                
                // 3. Cerrar todo
                cerrarModalTransferencia();
                mostrarAlerta(`🎉 ¡Enviaste $${monto} a ${destinatarioConfirmado.nickname}!`, "¡Transferencia Exitosa!");
                
                // 4. Sincronizar sockets para asegurar
                if(typeof sincronizarDatosForzoso === "function") sincronizarDatosForzoso();

            } else {
                mostrarAlerta(data.error || "Falló la transferencia", "Error");
            }
            
        } catch (e) {
            console.error(e);
            mostrarAlerta("Error de red al intentar transferir", "Fallo");
        } finally {
            if(btnConfirmar) {
                btnConfirmar.innerText = textoBtnOriginal;
                btnConfirmar.disabled = false;
            }
        }
    });
};

// ==================== HISTORIAL DE MOVIMIENTOS ====================

function abrirHistorial() {
    const modal = document.getElementById("modalHistorial");
    if(!modal) return;
    
    modal.classList.add("active");
    cargarMovimientos();
}

function cerrarModalHistorial() {
    document.getElementById("modalHistorial").classList.remove("active");
}

async function cargarMovimientos() {
    const contenedor = document.getElementById("listaHistorial");
    contenedor.innerHTML = '<div style="padding:20px; text-align:center;">Cargando... ⏳</div>';

    try {
        if(!usuarioActual || !usuarioActual.email) return;

        const res = await api(`/historial-usuario?email=${usuarioActual.email}`);
        const data = await res.json();

        if (data.success) {
            renderizarHistorial(data.movimientos);
        } else {
            contenedor.innerHTML = '<p>No se pudo cargar el historial.</p>';
        }

    } catch (e) {
        console.error(e);
        contenedor.innerHTML = '<p>Error de conexión.</p>';
    }
}

function renderizarHistorial(movimientos) {
    const contenedor = document.getElementById("listaHistorial");
    contenedor.innerHTML = "";

    if (!movimientos || movimientos.length === 0) {
        contenedor.innerHTML = '<div style="padding:20px; color:#777;">Aún no tienes movimientos.</div>';
        return;
    }

    movimientos.forEach(mov => {
        // Icono y color según tipo
        let icono = '📄';
        if (mov.tipo === 'recarga') icono = '💳';
        if (mov.tipo === 'compra') icono = '🛒';
        if (mov.tipo === 'apuesta') icono = '🎲';
        if (mov.tipo === 'victoria') icono = '🏆'; // Agregué copa para victorias
        if (mov.tipo === 'premio') icono = '🎁';   // Agregué regalo
        if (mov.tipo === 'transferencia') icono = mov.esIngreso ? '↙️' : '↗️';

        const signo = mov.esIngreso ? '+' : '-';
        const claseColor = mov.esIngreso ? 'hist-positivo' : 'hist-negativo';
        
        // CORRECCIÓN: Usamos la fecha directa del servidor (ya viene formateada)
        // Si por alguna razón viniera vacía, ponemos "---"
        const fechaStr = mov.fecha || "---";

        const item = document.createElement("div");
        item.className = "item-historial";
        item.innerHTML = `
            <div class="hist-info">
                <div class="hist-icon">${icono}</div>
                <div>
                    <div class="hist-desc">${mov.descripcion}</div>
                    <div class="hist-fecha">${fechaStr}</div>
                </div>
            </div>
            <div class="hist-monto ${claseColor}">
                ${signo}$${mov.monto}
            </div>
        `;
        contenedor.appendChild(item);
    });
}

// ======================================================
// FUNCIONALIDAD: BOTÓN FLOTANTE ARRASTRABLE (DRAGGABLE)
// ======================================================

function iniciarFabDraggable() {
    const fab = document.getElementById("fabSonidosContainer");
    const btn = document.getElementById("btnToggleSonidos");
    
    if (!fab || !btn) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    let moved = false; // Para diferenciar entre click y arrastre

    // --- TOUCH EVENTS (Móvil) ---
    btn.addEventListener('touchstart', (e) => {
        isDragging = true;
        moved = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        
        const rect = fab.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        
        // Quitamos transición para que el movimiento sea instantáneo
        fab.style.transition = 'none';
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        // Si se movió más de 5px, lo consideramos un arrastre, no un click
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) moved = true;

        if (moved) {
            e.preventDefault(); // Evitar scroll de pantalla
            fab.style.left = `${initialLeft + deltaX}px`;
            fab.style.top = `${initialTop + deltaY}px`;
            fab.style.bottom = 'auto'; // Desactivar bottom para usar top
            fab.style.right = 'auto';
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        isDragging = false;
        fab.style.transition = 'transform 0.2s'; // Restaurar animación suave
    });

    // --- MOUSE EVENTS (PC) ---
    btn.addEventListener('mousedown', (e) => {
        isDragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = fab.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        fab.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) moved = true;

        if (moved) {
            e.preventDefault();
            fab.style.left = `${initialLeft + deltaX}px`;
            fab.style.top = `${initialTop + deltaY}px`;
            fab.style.bottom = 'auto';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Modificar la función toggle para que NO se abra si se arrastró
    const originalToggle = window.toggleMenuSonidos;
    window.toggleMenuSonidos = function() {
        if (!moved) {
            // Solo abrimos si fue un click limpio, no un arrastre
            const menu = document.getElementById("menuSonidosDesplegable");
            if(menu) {
                menu.classList.toggle("mostrar");
                if (menu.classList.contains("mostrar")) {
                    renderizarSonidosJuego();
                }
            }
        }
    };
}

// ======================================================
// NUEVAS FUNCIONES 21-02-2025
// ======================================================

// --- FUNCIÓN DE ANIMACIÓN DE MONEDAS ---
function animarVueloMonedas(destinoId = "bote-valor") {
    const origen = document.getElementById("monedas-valor");
    const destino = document.getElementById(destinoId);
    
    if(!origen || !destino) return;

    // Obtener coordenadas
    const rectOrigen = origen.getBoundingClientRect();
    const rectDestino = destino.getBoundingClientRect();

    // Lanzar 5 monedas
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const moneda = document.createElement("img");
            moneda.src = "assets/imagenes/ui/peso.png"; // Asegúrate que esta ruta exista
            moneda.className = "flying-coin";
            
            // Posición inicial (Saldo)
            // Agregamos un pequeño random para que no salgan todas del mismo pixel exacto
            const randomX = (Math.random() * 20) - 10; 
            const randomY = (Math.random() * 20) - 10;

            moneda.style.left = (rectOrigen.left + 10 + randomX) + "px";
            moneda.style.top = (rectOrigen.top + randomY) + "px";
            
            document.body.appendChild(moneda);

            // Forzar reflow (para que el navegador detecte el cambio de posición)
            setTimeout(() => {
                moneda.style.left = (rectDestino.left + 10) + "px";
                moneda.style.top = (rectDestino.top) + "px";
                moneda.style.transform = "scale(0.5) rotate(360deg)"; // Se hacen chicas y giran
                moneda.style.opacity = "0"; // Desaparecen al llegar
            }, 50);

            // Borrar elemento del DOM al terminar
            setTimeout(() => {
                moneda.remove();
            }, 900); // 0.8s de transición + margen

        }, i * 100); // Salen cada 100ms
    }
}


// Iniciar al cargar la página
window.addEventListener('load', iniciarFabDraggable);

// ======================================================
// SERVICE WORKER (PWA)
// ======================================================
// El archivo existía desde hace tiempo pero nunca se registraba, así que la app
// no funcionaba sin conexión ni se comportaba como PWA instalada.
//
// Ahora sí se registra, después de que cargue todo, para no competir por ancho
// de banda con las cartas y los audios durante el arranque.
window.addEventListener('load', () => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('Service worker activo:', reg.scope))
        .catch(err => console.warn('No se pudo registrar el service worker:', err));
});


// ======================================================
// DESPACHADOR DE ACCIONES
// ======================================================
// Antes cada botón del HTML llamaba a una función global por su nombre
// (onclick="login()"). Eso ataba el marcado a que esos nombres existieran en el
// ámbito global, y era lo que impedía pasar el archivo a módulos: en cuanto las
// funciones dejan de ser globales, los botones dejan de responder SIN dar ningún
// error, hasta que alguien los pica.
//
// Ahora el marcado solo declara QUÉ hace cada elemento:
//
//     <button data-accion="login">Entrar</button>
//     <button data-accion="pagar" data-monedas="150">...</button>
//
// y aquí se dice CÓMO. Un único escucha en el documento resuelve el clic, así
// que también funciona con el HTML que se genera en caliente —la tienda, la
// lista de jugadores, la tabla de administración— sin tener que enganchar nada
// a mano cada vez que se repinta.

const ACCIONES = {
    // --- Acceso ---
    'login':                  () => login(),
    'registro':               () => registro(),
    'cerrar-sesion':          () => cerrarSesion(),
    'ir':                     (el) => cambiarPantalla(el.dataset.pantalla),

    // --- Salas ---
    'crear-sala':             () => crearSalaPropia(),
    'unirse-sala':            () => unirseSalaExistente(),
    'compartir-sala':         () => compartirSala(),
    'salir-sala':             () => salirDeSalaEnJuego(),
    'silenciar':              (el) => alternarSilencio(el.dataset.email),

    // --- Selección de tablas ---
    'cargar-favoritas':       () => cargarSetFavorito(),
    'guardar-favoritas':      (el) => guardarSetFavorito(el),

    // --- Mesa de juego ---
    'limpiar-fichas':         () => limpiarFichas(),
    'barajear':               () => socket.emit('barajear', salaActual),
    'iniciar-juego':          () => iniciarJuegoConVelocidad(),
    'detener-juego':          () => socket.emit('detener-juego', salaActual),
    'cambiar-cartas':         () => cambiarCartas(),
    'gritar-loteria':         () => emitirLoteria(),
    'alternar-sonidos':       () => toggleMenuSonidos(),

    // --- Monedero ---
    'abrir-historial':        () => abrirHistorial(),
    'cerrar-historial':       () => cerrarModalHistorial(),
    'abrir-recarga':          () => abrirModalRecarga(),
    'cerrar-tienda':          () => cerrarTienda(),
    'volver-paquetes':        () => volverAPaquetes(),
    'pagar':                  (el) => iniciarPagoEmbedded(Number(el.dataset.monedas)),

    // --- Transferencias ---
    'abrir-transferencia':    () => abrirModalTransferencia(),
    'cerrar-transferencia':   () => cerrarModalTransferencia(),
    'buscar-destinatario':    (el) => verificarDestinatario(el),
    'cancelar-transferencia': () => cancelarTransferencia(),
    'transferir':             (el) => realizarTransferencia(el),

    // --- Tienda ---
    'tienda-categoria':       (el) => abrirCategoriaTienda(el.dataset.categoria),
    'cerrar-tienda-detalle':  () => cerrarModalTiendaDetalle(),
    'comprar-item':           (el) => comprarItem(el.dataset.item, Number(el.dataset.precio)),
    'usar-ficha':             (el) => usarFicha(el.dataset.img),
    'oir-sonido':             (el) => previewSonido(el.dataset.archivo),

    // --- Administración ---
    'abrir-admin':            () => abrirPanelAdmin(),
    'cargar-usuarios-admin':  () => cargarUsuariosAdmin(),
    'recarga-admin':          () => ejecutarRecargaAdmin(),
    'preparar-recarga':       (el) => prepararRecarga(el.dataset.email)
};

document.addEventListener('click', (evento) => {
    // closest() para que también funcione al picar un icono o un texto dentro
    // del botón, no solo el botón exacto.
    const elemento = evento.target.closest('[data-accion]');
    if (!elemento) return;

    const accion = ACCIONES[elemento.dataset.accion];
    if (!accion) {
        console.warn(`Acción sin definir: "${elemento.dataset.accion}"`);
        return;
    }

    try {
        accion(elemento, evento);
    } catch (fallo) {
        console.error(`Falló la acción "${elemento.dataset.accion}":`, fallo);
    }
});
