// ======================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ======================================================
//
// Este archivo es el punto de entrada. En desarrollo el navegador resuelve los
// imports de abajo por su cuenta; en el despliegue, esbuild lo empaqueta todo en
// un solo archivo antes de ofuscarlo (ver scripts/obfuscate.js).

import { STRIPE_CLAVE_PUBLICA, FICHA_POR_DEFECTO } from './modulos/config.js';
import { escaparHtml, actualizarValor } from './modulos/utiles.js';
import { socket } from './modulos/socket.js';
import { sonidos, sonarApuesta } from './modulos/audio.js';
import { emitirLoteria, iniciarValidacion } from './modulos/validacion.js';
import { sesion, partida } from './modulos/estado.js';
import { guardarSetFavorito, cargarSetFavorito } from './modulos/favoritos.js';
import {
    generarCartas, renumerarSeleccion, seleccionarCarta,
    montarMesa, limpiarFichas, cambiarCartas,
    restaurarSeleccionVisual, resetearTablero, limpiarHistorialCantadas
} from './modulos/tablero.js';
import {
    compartirSala, crearSalaPropia, unirseSalaExistente,
    unirseSalaDirecto, salirDeSalaEnJuego
} from './modulos/sala.js';
import { iniciarBotonArrastrable, animarVueloMonedas } from './modulos/animaciones.js';
import { toggleMenuSonidos, renderizarSonidosJuego } from './modulos/efectos.js';
import { cambiarPantalla, pantalla, iniciarModales, mostrarAlerta } from './modulos/ui.js';
import { api, guardarToken, obtenerToken, borrarSesion } from './modulos/sesion.js';
import {
    abrirModalTransferencia, cerrarModalTransferencia, cancelarTransferencia,
    verificarDestinatario, realizarTransferencia,
    abrirHistorial, cerrarModalHistorial
} from './modulos/monedero.js';
import {
    abrirModalRecarga, cerrarTienda, volverAPaquetes, iniciarPagoEmbedded,
    actualizarSaldoUI, abrirCategoriaTienda, cerrarModalTiendaDetalle,
    refrescarCategoria, previewSonido, usarFicha, comprarItem, establecerFicha
} from './modulos/tienda.js';
import {
    verificarSiSoyAdmin, abrirPanelAdmin, cargarUsuariosAdmin,
    prepararRecarga, ejecutarRecargaAdmin
} from './modulos/admin.js';
// La conexión con el servidor vive en modulos/socket.js.

// ==================== POZO ACUMULADO ====================
// Bote aparte que crece $1 por partida y por jugador que se apunte, y que solo
// se lleva quien llene las 4 barajas del centro. Es opcional y solo existe en
// modo Tradicional. Quien no se apunta no puede ganarlo, aunque gane la lotería.

function pozoDisponible() {
    return partida.modo === 'tradicional';
}

function refrescarPozoUI() {
    const caja = document.getElementById("pozoControl");
    if (!caja) return;
    caja.style.display = pozoDisponible() ? "flex" : "none";
    actualizarValor(document.getElementById("pozo-valor"), partida.pozo);
}

socket.on('pozo-actualizado', (monto) => {
    partida.pozo = monto || 0;
    refrescarPozoUI();
});

// ==================== SILENCIO EN LA SALA ====================
// Quién tiene los sonidos cortados. Lo decide el anfitrión y lo manda el
// servidor, que es quien de verdad descarta los efectos: aquí solo se pinta.

window.alternarSilencio = function(email) {
    if (!partida.soyHost) return;
    const callado = partida.silenciados.includes(email);
    socket.emit("silenciar-jugador", { sala: partida.sala, email, silenciar: !callado });
};

socket.on("silenciados-actualizados", (lista) => {
    partida.silenciados = Array.isArray(lista) ? lista : [];
});

socket.on("estas-silenciado", () => {
    mostrarAlerta("El anfitrión silenció tus efectos de sonido en esta sala.", "Sin sonidos 🔇");
});

// El token, el helper api() y el manejo del 401 viven en modulos/sesion.js.

// El estado compartido de la partida vive en modulos/estado.js.

const stripePromise = Stripe(STRIPE_CLAVE_PUBLICA);

// Las referencias a las pantallas viven en modulos/ui.js.

// Referencias DOM - Elementos UI
const jugadoresLista = document.getElementById("jugadoresLista");
const jugadoresListaIngame = document.getElementById("jugadoresListaIngame");
const btnSalirSala = document.getElementById("btnSalirSala");
const btnApostar = document.getElementById("btnApostar");
const monedasEl = document.getElementById("monedas-valor");
const boteEl = document.getElementById("bote-valor");

// Referencias DOM - Modales y Audios

// Audios


// ==================== AUTO-LOGIN DESDE EL HUB (SSO) ====================
// Se marca ANTES de que window.onload pueda ejecutarse. Sin esto había una
// carrera: el arranque miraba el localStorage y, como el perfil todavía no
// había llegado del servidor, daba la sesión por inexistente y sacaba la
// pantalla de acceso. Con el arranque en frío de Render esa petición puede
// tardar bastante, así que el jugador que venía del Hub se quedaba viendo un
// login que no debía existir.

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
        sesion.entrandoDesdeHub = true;
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
                ocultarSplashGlobal();

                try {
                    configurarMenu();
                    actualizarSaldoUI(sesion.usuario);
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
                sesion.entrandoDesdeHub = false;
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

// Los modales y la navegación entre pantallas viven en modulos/ui.js.
iniciarModales();


// ======================================================
// INICIO Y AUTENTICACIÓN
// ======================================================

/** Desvanece el splash. Vive fuera de onload porque el SSO también lo necesita. */
function ocultarSplashGlobal(callback) {
    const splash = pantalla('splash');
    if (!splash) { if (callback) callback(); return; }
    splash.style.opacity = '0';
    setTimeout(() => {
        splash.style.display = 'none';
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
    if (sesion.entrandoDesdeHub) {
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
        sesion.usuario = null;
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
        sesion.usuario = JSON.parse(sesionGuardada);
        
        // 🔥 CARGAR PREFERENCIAS DE LA NUBE 🔥
        if(sesion.usuario.fichaActiva) {
            establecerFicha(sesion.usuario.fichaActiva);
        }
        // Si tiene cartas favoritas en la cuenta, actualizamos el localStorage para que esté sincronizado
        if(sesion.usuario.cartasFavoritas && sesion.usuario.cartasFavoritas.length > 0) {
            localStorage.setItem("loteria_cartas_fav", JSON.stringify(sesion.usuario.cartasFavoritas));
        }
        
        configurarMenu();
        actualizarSaldoUI(sesion.usuario);
        sincronizarDatosForzoso(); 
        
        
        const urlParams = new URLSearchParams(window.location.search);
        const salaInvitacion = urlParams.get('sala');
        const pagoEstado = urlParams.get('pago');

        // Lógica de Pagos Stripe
        if (pagoEstado === 'exito') {
            const cant = urlParams.get('cantidad');
            mostrarAlerta(`¡Has recibido ${cant} monedas! 🎉`, "¡Pago Exitoso!");
            if(sesion.usuario) {
                sesion.usuario.monedas = (parseInt(sesion.usuario.monedas) || 0) + parseInt(cant);
                localStorage.setItem("loteria_usuario", JSON.stringify(sesion.usuario));
                configurarMenu();
                actualizarSaldoUI(sesion.usuario);
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
        if(socket.connected) socket.emit('reconectar', { sala: partida.sala, email: sesion.usuario.email });

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
            sesion.usuario = data;
            guardarToken(data.token);
            localStorage.setItem("loteria_usuario", JSON.stringify(data));

            // Reconectamos para que el handshake del socket lleve ya el token.
            socket.disconnect().connect();

            // 🔥 FIX IMPORTANTE: Actualizar la variable global de la ficha AL INSTANTE
            if (data.fichaActiva) {
                establecerFicha(data.fichaActiva);
            }

            // Sincronizar cartas si existen
            if(data.cartasFavoritas && data.cartasFavoritas.length > 0) {
                localStorage.setItem("loteria_cartas_fav", JSON.stringify(data.cartasFavoritas));
            }
            
            configurarMenu();
            actualizarSaldoUI(sesion.usuario); 
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
            sesion.usuario = data;
            guardarToken(data.token);
            localStorage.setItem("loteria_usuario", JSON.stringify(data));
            socket.disconnect().connect();

            configurarMenu();
            actualizarSaldoUI(sesion.usuario); // <--- Cargar tienda al registrarse
            
            cambiarPantalla("menu");
        } else {
            mostrarAlerta(data.error, "Error de Registro");
        }
    } catch (e) { console.error(e); mostrarAlerta("Error de conexión", "Error de Red"); }
}

function cerrarSesion() {
    borrarSesion();     // token y perfil, en un solo sitio (modulos/sesion.js)
    sesion.usuario = null;
    establecerFicha(FICHA_POR_DEFECTO);
    location.reload();  // recargar limpia todo lo demás
}

function configurarMenu() {
    if(sesion.usuario) {
        document.getElementById("menuBienvenida").textContent = `Hola, ${sesion.usuario.nickname}`;
        // En el menú principal solo mostramos el número (para el monedero)
        document.getElementById("menuMonedas").textContent = sesion.usuario.monedas;
        verificarSiSoyAdmin(sesion.usuario);
    }
}

// ======================================================
// GESTIÓN DE SALAS
// ======================================================
// Crear sala, entrar, invitar y salir viven en modulos/sala.js.
// resetearTablero se queda aquí porque lo que limpia son elementos del tablero.

if (btnSalirSala) btnSalirSala.addEventListener("click", () => salirDeSalaEnJuego(resetearTablero));





// ======================================================
// LÓGICA DE JUEGO (CLIENTE)
// ======================================================

// El tablero vive en modulos/tablero.js: elegir tablas, ponerlas en la mesa,
// marcar fichas y seguir las cartas cantadas.

const btnIniciarJuego = document.getElementById("btnIniciar");
if (btnIniciarJuego) btnIniciarJuego.onclick = () => {
    cambiarPantalla("juego");
    montarMesa();
    renderizarSonidosJuego(sesion.usuario, partida.sala);
};

// ======================================================
// SOCKETS: EVENTOS DEL SERVIDOR
// ======================================================

socket.on('connect', () => {
  partida.miId = socket.id;
  if(sesion.usuario && partida.sala) {
      socket.emit('reconectar', { sala: partida.sala, email: sesion.usuario.email });
  }
});

socket.on("rol-asignado", ({ host }) => {
  partida.soyHost = host;
  generarCartas();
   
  const controlesHost = ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "divVelocidad"]; 
   
  controlesHost.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          if (partida.soyHost) {
              el.style.display = (id === "divVelocidad") ? "flex" : "block"; 
          } else {
              el.style.display = "none";
          }
      }
  });
});

socket.on('info-sala', (data) => {
    partida.modo = data.modo;
    partida.costoCarta = data.costo;

    // Actualizar Título
    document.getElementById("tituloSalaActual").innerHTML = 
        `Sala: ${escaparHtml(partida.sala)} <br><span style="font-size:0.8rem; color:gold;">${escaparHtml(partida.modo).toUpperCase()} ($${partida.costoCarta})</span>`;

    // --- LÓGICA DE RUTAS ---
    if (partida.modo === 'pozo') {
        // Si es Pozo, usamos la carpeta especial y solo 20 cartas
        partida.rutaCartas = 'assets/imagenes/cartas/cuatro/'; 
    } else {
        // Si es otro, usamos la carpeta normal
        partida.rutaCartas = 'assets/imagenes/cartas/'; 
    }

    if(btnApostar && partida.seleccionadas.length === 0) {
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


socket.on('estado-sala-restaurado', (estado) => {
    if(estado.cartas && estado.cartas.length > 0) {
        partida.seleccionadas = estado.cartas;
        montarMesa();   // misma mesa que al empezar, sin duplicar la lógica
        
        if(estado.enJuego) cambiarPantalla("juego");
        else cambiarPantalla("sala"); 
    }
    
    partida.haApostado = estado.apostado;
    if(btnApostar) btnApostar.disabled = partida.haApostado;
    
    if(estado.monedas !== undefined) {
        sesion.usuario.monedas = estado.monedas;
        configurarMenu();
        actualizarValor(monedasEl, estado.monedas);
    }
});

socket.on("jugadores-actualizados", jugadores => {
  partida.jugadores = jugadores;
   
  const misDatos = Object.values(jugadores).find(j => j.email === sesion.usuario?.email);
  if (misDatos) {
    actualizarValor(monedasEl, misDatos.monedas);
    partida.haApostado = misDatos.apostado; 
    sesion.usuario.monedas = misDatos.monedas;
    localStorage.setItem("loteria_usuario", JSON.stringify(sesion.usuario));
    configurarMenu();
  }
   
  if (btnApostar) btnApostar.disabled = partida.haApostado;
   
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
      if (partida.soyHost && j.email && j.email !== sesion.usuario?.email) {
          const callado = partida.silenciados.includes(j.email);
          botonMute = `<button class="btn-mute ${callado ? 'callado' : ''}"
                        data-accion="silenciar" data-email="${escaparHtml(j.email)}"
                        title="${callado ? 'Devolverle los sonidos' : 'Silenciar sus sonidos'}"
                        >${callado ? '🔇' : '🔊'}</button>`;
      }
      const iconoCallado = (!partida.soyHost && partida.silenciados.includes(j.email)) ? ' 🔇' : '';

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
  partida.haApostado = false;
  if (btnApostar) btnApostar.disabled = false;
});

// SONIDO DE APUESTA (NUEVO)
socket.on("reproducir-sonido-apuesta", () => sonarApuesta());

// Eventos de Juego
socket.on("barajear", () => {
  sonidos.barajear();
  limpiarHistorialCantadas();
});

socket.on("campana", () => sonidos.campana());
socket.on("corre", () => sonidos.corre());







socket.on("juego-detenido", () => {
    if (partida.soyHost) sonidos.pararCorre();
});

// ======================================================
// LOTERÍA (GANADORES)
// ======================================================

// Gritar lotería y la validación del anfitrión viven en modulos/validacion.js.
iniciarValidacion();

// APUESTAS
if(btnApostar) btnApostar.addEventListener("click", () => {
  if (!partida.sala) return mostrarAlerta("Únete a una sala primero.");
  if (partida.haApostado) return mostrarAlerta("Ya apostaste esta ronda.");
  
  // Calculamos la cantidad (por defecto 1 o el número de cartas)
  const cantidad = Math.max(1, partida.seleccionadas.length || 1);
  
  const chk = document.getElementById("chkPozo");
  const conPozo = !!(chk && chk.checked && pozoDisponible());

  animarVueloMonedas();
  if (conPozo) animarVueloMonedas("pozo-valor");

  socket.emit("apostar", {
      sala: partida.sala,
      cantidad: cantidad,
      email: sesion.usuario.email, // <--- ESTA LÍNEA ES LA CLAVE
      conPozo: conPozo
  });

  // Ya no se puede cambiar de opinión en esta ronda.
  if (chk) chk.disabled = true;
  
  partida.haApostado = true;
  btnApostar.disabled = true;
});

// La recarga con tarjeta y la tienda de artículos viven en
// modulos/tienda.js. Reciben el usuario como argumento.

// El set de tablas favorito vive en modulos/favoritos.js.

function iniciarJuegoConVelocidad() {
    const selector = document.getElementById("velocidadJuego");
    const velocidad = selector ? parseInt(selector.value) : 3000;
    socket.emit('iniciar-juego', { sala: partida.sala, velocidad: velocidad });
}

// El panel de administrador vive en modulos/admin.js.

// El soundboard vive en modulos/efectos.js.

// ==================== SINCRONIZACIÓN EN TIEMPO REAL (MASTER LISTENER) ====================

socket.on('usuario-actualizado', (datosFrescos) => {
    // Se registra solo el saldo, no el objeto entero: volcarlo completo dejaba a
    // la vista en la consola todo lo que trajera el perfil.
    console.log("📥 Datos sincronizados. Saldo:", datosFrescos.monedas);

    if (sesion.usuario) {
        // 1. Actualizar datos base
        sesion.usuario.monedas = datosFrescos.monedas;
        sesion.usuario.inventario = datosFrescos.inventario || [];
        
        // 2. 🔥 RESTAURAR PREFERENCIAS (FIX HUB SSO) 🔥
        // Si la BD trae una ficha activa, la forzamos en la sesión local
        if (datosFrescos.fichaActiva) {
            sesion.usuario.fichaActiva = datosFrescos.fichaActiva;
            establecerFicha(datosFrescos.fichaActiva);
            localStorage.setItem("loteria_ficha_activa", datosFrescos.fichaActiva); // Persistir
        }

        // Si la BD trae cartas favoritas, las guardamos en localStorage
        if (datosFrescos.cartasFavoritas && datosFrescos.cartasFavoritas.length > 0) {
            sesion.usuario.cartasFavoritas = datosFrescos.cartasFavoritas;
            localStorage.setItem("loteria_cartas_fav", JSON.stringify(datosFrescos.cartasFavoritas));
        }

        // Guardamos el objeto completo actualizado
        localStorage.setItem("loteria_usuario", JSON.stringify(sesion.usuario));
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
             refrescarCategoria(sesion.usuario);
        }
    }

    // 3. Juego
    const gameMonedas = document.getElementById("monedas-valor");
    actualizarValor(gameMonedas, datosFrescos.monedas);

    // 4. Soundboard
    const menuSonidos = document.getElementById("menuSonidosDesplegable");
    if(menuSonidos && menuSonidos.classList.contains("mostrar")) {
        renderizarSonidosJuego(sesion.usuario, partida.sala);
    }
});

function sincronizarDatosForzoso() {
    if(sesion.usuario && sesion.usuario.email) {
        console.log("🔄 Pidiendo datos frescos al servidor...");
        socket.emit('solicitar-info-usuario', sesion.usuario.email);
    }
}

/**
 * Le pide al servidor que cobre un artículo. Se le pasa a la tienda para que el
 * módulo no tenga que conocer el socket.
 *
 * Solo viaja el ID: el precio lo pone el servidor con su propio catálogo. Antes
 * se mandaba también el precio y se restaba tal cual, así que uno negativo
 * sumaba monedas en vez de cobrarlas.
 */
function emitirCompraItem(itemId) {
    if (!sesion.usuario) return;
    socket.emit('comprar-item', { email: sesion.usuario.email, itemId });
}

// Las transferencias y el historial de movimientos viven en
// modulos/monedero.js. Reciben el usuario como argumento.

// ======================================================
// El arrastre del botón flotante vive en modulos/animaciones.js.

// ======================================================
// NUEVAS FUNCIONES 21-02-2025
// ======================================================

// El vuelo de monedas vive en modulos/animaciones.js.

// Iniciar al cargar la página
window.addEventListener('load', iniciarBotonArrastrable);

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
    'salir-sala':             () => salirDeSalaEnJuego(resetearTablero),
    'silenciar':              (el) => alternarSilencio(el.dataset.email),

    // --- Selección de tablas ---
    // Se le pasan las dos funciones de selección para no crear un ciclo:
    // favoritos.js las necesita, pero el juego ya importa de favoritos.
    'cargar-favoritas':       () => cargarSetFavorito(seleccionarCarta, renumerarSeleccion),
    'guardar-favoritas':      (el) => guardarSetFavorito(el),

    // --- Mesa de juego ---
    'limpiar-fichas':         () => limpiarFichas(),
    'barajear':               () => socket.emit('barajear', partida.sala),
    'iniciar-juego':          () => iniciarJuegoConVelocidad(),
    'detener-juego':          () => socket.emit('detener-juego', partida.sala),
    'cambiar-cartas':         () => cambiarCartas(),
    'gritar-loteria':         () => emitirLoteria(),
    'alternar-sonidos':       () => toggleMenuSonidos(sesion.usuario, partida.sala),

    // --- Monedero ---
    // El monedero no lee el estado del juego: se le pasa el usuario aquí.
    'abrir-historial':        () => abrirHistorial(sesion.usuario),
    'cerrar-historial':       () => cerrarModalHistorial(),
    'abrir-recarga':          () => abrirModalRecarga(),
    'cerrar-tienda':          () => cerrarTienda(),
    'volver-paquetes':        () => volverAPaquetes(),
    'pagar':                  (el) => iniciarPagoEmbedded(Number(el.dataset.monedas), sesion.usuario, stripePromise),

    // --- Transferencias ---
    'abrir-transferencia':    () => abrirModalTransferencia(),
    'cerrar-transferencia':   () => cerrarModalTransferencia(),
    'buscar-destinatario':    (el) => verificarDestinatario(el, sesion.usuario),
    'cancelar-transferencia': () => cancelarTransferencia(),
    'transferir':             (el) => realizarTransferencia(el, sesion.usuario, sincronizarDatosForzoso),

    // --- Tienda ---
    'tienda-categoria':       (el) => abrirCategoriaTienda(el.dataset.categoria, sesion.usuario),
    'cerrar-tienda-detalle':  () => cerrarModalTiendaDetalle(),
    'comprar-item':           (el) => comprarItem(el.dataset.item, Number(el.dataset.precio), sesion.usuario, emitirCompraItem),
    'usar-ficha':             (el) => usarFicha(el.dataset.img, sesion.usuario),
    'oir-sonido':             (el) => previewSonido(el.dataset.archivo),

    // --- Administración ---
    'abrir-admin':            () => abrirPanelAdmin(sesion.usuario),
    'cargar-usuarios-admin':  () => cargarUsuariosAdmin(sesion.usuario),
    'recarga-admin':          () => ejecutarRecargaAdmin(sesion.usuario),
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
