// ======================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ======================================================

// URL DEL BACKEND (Render)
const API_URL = "https://loteria-backend-3nde.onrender.com/api";
const socket = io("https://loteria-backend-3nde.onrender.com");

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

// Generamos IDs de cartas (del 01 al 54) - Ajustado a 30 por tu código anterior
const cartasDisponibles = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));

const stripePromise = Stripe("pk_live_51SfOSHHRnABvTmoyGETt893p5wdCWGOmKQOiW4YCkbquy0Vp0mx97dVdfgXlhPszaZ40iXNFW4NveUq4Lilv83wd00gCQpzFmR");

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
(function verificarSSO() {
    const params = new URLSearchParams(window.location.search);
    const tokenSSO = params.get('sso');
    
    if (tokenSSO) {
        try {
            // 1. Decodificar el token (Base64 -> JSON)
            const jsonUsuario = atob(tokenSSO);
            const usuarioHub = JSON.parse(jsonUsuario);
            
            console.log("🔓 Login Automático desde Hub:", usuarioHub.nickname);

            // 2. Guardar en el LocalStorage de la Lotería
            localStorage.setItem("loteria_usuario", JSON.stringify(usuarioHub));
            
            // 3. Limpiar la URL para que no se vea el token feo
            const nuevaUrl = window.location.pathname;
            window.history.replaceState({}, document.title, nuevaUrl);
            
            // 4. (Opcional) Si tu app no recarga sola al tener usuario en localStorage, forzar recarga
            // window.location.reload(); 
            
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

function mostrarAlerta(mensaje, titulo = "Aviso del Sistema") {
    modalTitulo.textContent = titulo;
    modalMensaje.textContent = mensaje;
    btnModalCancelar.style.display = "none";
    btnModalAceptar.textContent = "Entendido";
    
    onModalAceptar = () => cerrarModal();
    
    modalSistema.classList.add("active");
    if(navigator.vibrate) navigator.vibrate(50);
}

function mostrarConfirmacion(mensaje, callbackAceptar) {
    modalTitulo.textContent = "¿Estás seguro?";
    modalMensaje.textContent = mensaje;
    btnModalCancelar.style.display = "inline-block";
    btnModalAceptar.textContent = "Sí";
    
    onModalAceptar = () => {
        callbackAceptar();
        cerrarModal();
    };
    
    modalSistema.classList.add("active");
}

function cerrarModal() {
    modalSistema.classList.remove("active");
    onModalAceptar = null;
}

if(btnModalAceptar) btnModalAceptar.onclick = () => { if (onModalAceptar) onModalAceptar(); else cerrarModal(); };
if(btnModalCancelar) btnModalCancelar.onclick = () => cerrarModal();


// ======================================================
// INICIO Y AUTENTICACIÓN
// ======================================================

window.onload = () => {
    // 1. Revisar sesión guardada
    const sesionGuardada = localStorage.getItem("loteria_usuario");
    
    // Función auxiliar para desvanecer el splash
    const ocultarSplash = (callback) => {
        if(pantallas.splash) {
            pantallas.splash.style.opacity = '0';
            setTimeout(() => {
                pantallas.splash.style.display = 'none';
                if(callback) callback();
            }, 500); // 500ms es lo que tarda la transición CSS
        }
    };

    if (sesionGuardada) {
        // === USUARIO LOGUEADO (CARGA DE DATOS) ===
        usuarioActual = JSON.parse(sesionGuardada);
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
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();
        
        if(data.success) {
            usuarioActual = data;
            localStorage.setItem("loteria_usuario", JSON.stringify(data));
            
            configurarMenu();
            cargarTienda(); // <--- Cargar tienda al entrar
            sincronizarDatosForzoso(); // <--- Asegurar datos frescos
            
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
        const res = await fetch(`${API_URL}/registro`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nickname, email, password: pass })
        });
        const data = await res.json();
        
        if(data.success) {
            usuarioActual = data;
            localStorage.setItem("loteria_usuario", JSON.stringify(data));
            
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
    usuarioActual = null;
    location.reload();
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
  
  let totalCartasAMostrar = 54;
  
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
    
    contenedorCartas.appendChild(img);
  } // <--- AQUÍ ESTABA EL ERROR, TENÍAS UN "});" EXTRA. YA LO QUITÉ.
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
        `Sala: ${salaActual} <br><span style="font-size:0.8rem; color:gold;">${modoJuegoActual.toUpperCase()} ($${costoCartaActual})</span>`;

    // --- LÓGICA DE RUTAS ---
    if (modoJuegoActual === 'pozo') {
        // Si es Pozo, usamos la carpeta especial y solo 20 cartas
        rutaCartasJugador = 'assets/imagenes/cartas/cuatro/'; 
    } else {
        // Si es otro, usamos la carpeta normal
        rutaCartasJugador = 'assets/imagenes/cartas/'; 
    }

    if(btnApostar) {
        btnApostar.innerText = "Selecciona cartas";
        btnApostar.disabled = true;
        btnApostar.style.opacity = "0.5";
    } // <--- AQUÍ FALTABA ESTA LLAVE DE CIERRE '}'
    
    // Regenerar el grid de selección con la ruta correcta
    generarCartas(); 
});

socket.on('estado-sala-restaurado', (estado) => {
    if(estado.cartas && estado.cartas.length > 0) {
        seleccionadas = estado.cartas;
        juegoCartas.innerHTML = "";
        seleccionadas.forEach(id => {
            const contenedor = document.createElement("div");
            contenedor.classList.add("carta-juego");
            contenedor.dataset.id = id;
            contenedor.innerHTML = `<img src="assets/imagenes/cartas/${id}.jpg" class="carta-img seleccionada">`;
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
        if(monedasEl) monedasEl.textContent = estado.monedas;
    }
});

socket.on("jugadores-actualizados", jugadores => {
  jugadoresGlobal = jugadores;
   
  const misDatos = Object.values(jugadores).find(j => j.email === usuarioActual?.email);
  if (misDatos) {
    monedasEl.textContent = misDatos.monedas;
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
      return `<div>${crown} ${j.nickname} ${check}</div>`;
    }).join("");
    
  if(jugadoresLista) jugadoresLista.innerHTML = htmlLista;
  if(jugadoresListaIngame) jugadoresListaIngame.innerHTML = htmlLista;
});

socket.on('bote-actualizado', (bote) => { boteEl.textContent = bote; });

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
   
  const boardState = { cards: seleccionadas, chips: {} };

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
        <div style="font-size:2rem; color: gold; text-shadow: 2px 2px 0 #000;">¡${primerGanador} gritó BUENAS!</div>
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
    loteriaMensaje.innerHTML += `<div style="font-size:1.5rem; color:#ff4081; font-weight:bold; margin-top:10px; animation: pulsate 0.5s infinite;">¡${otroNick} TAMBIÉN GRITÓ!</div>`;
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
    
    const modalHistorialFlex = document.getElementById("modalHistorialFlex");
    modalHistorialFlex.innerHTML = "";
    historialIdsGlobal.forEach(cartaId => {
         const img = document.createElement("img");
         img.src = `assets/imagenes/barajas/${cartaId}.png`;
         modalHistorialFlex.appendChild(img);
    });

    modalVerificationArea.innerHTML = '';
    const bs = candidato.boardState;
    if (bs && bs.cards) {
        bs.cards.forEach(cardId => {
            const cardContainer = document.createElement('div');
            cardContainer.className = 'carta-juego';
            const cardImg = document.createElement('img');
            cardImg.src = `assets/imagenes/cartas/${cardId}.jpg`;
            cardImg.className = 'carta-img seleccionada';
            cardImg.style.pointerEvents = "none";
            cardContainer.appendChild(cardImg);
            
            if (bs.chips && bs.chips[cardId]) {
                bs.chips[cardId].forEach(chipPos => {
                    const ficha = document.createElement("img");
                    ficha.src = "assets/imagenes/ui/ficha.PNG";
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
    
    loteriaModal.classList.add("active");
}

if(btnAceptarGanador) btnAceptarGanador.onclick = () => {
    if (ganadorTempId) {
        socket.emit("veredicto-host", { sala: salaActual, candidatoId: ganadorTempId, esValido: true });
        loteriaModal.classList.remove("active"); 
    }
};

if(btnRechazarGanador) btnRechazarGanador.onclick = () => {
    if (ganadorTempId) {
        socket.emit("veredicto-host", { sala: salaActual, candidatoId: ganadorTempId, esValido: false });
        loteriaModal.classList.remove("active");
    }
};

socket.on("ganadores-multiples", ({ ganadores, premio }) => {
    loteriaMensaje.style.display = "none";
    let msg = "";
    if (ganadores.length > 1) {
        msg = `¡EMPATE! 🤝\nGanadores: ${ganadores.join(", ")}\nSe llevan ${premio} monedas cada uno.`;
    } else {
        msg = `¡TENEMOS GANADOR! 🏆\n${ganadores[0]} se lleva ${premio} monedas.`;
    }
    mostrarAlerta(msg, "¡RESULTADO FINAL!");
    
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
  
  // --- CAMBIO IMPORTANTE PARA EL HISTORIAL ---
  // Enviamos también el email para que el server registre el movimiento
  socket.emit("apostar", { 
      sala: salaActual, 
      cantidad: cantidad,
      email: usuarioActual.email // <--- ESTA LÍNEA ES LA CLAVE
  });
  
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
        const res = await fetch(`${API_URL}/crear-orden`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                cantidad: cantidadMonedas, 
                precio: precio,
                email: usuarioActual.email 
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

function guardarSetFavorito() {
    if(seleccionadas.length === 0) return mostrarAlerta("Selecciona cartas primero.");
    localStorage.setItem("loteria_cartas_fav", JSON.stringify(seleccionadas));
    mostrarAlerta("¡Cartas guardadas! Podrás usarlas en tu próxima partida.", "Guardado");
}

function cargarSetFavorito() {
    const guardadas = localStorage.getItem("loteria_cartas_fav");
    if(!guardadas) return mostrarAlerta("No tienes ningún set guardado.", "Sin datos");
    
    const idsFavoritos = JSON.parse(guardadas);
    
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

const MI_EMAIL_ADMIN = "admin@loteria.com"; 

function verificarSiSoyAdmin() {
    const btnAdmin = document.getElementById("btnPanelAdmin");
    if (usuarioActual && usuarioActual.email === MI_EMAIL_ADMIN) {
        btnAdmin.style.display = "block";
    } else {
        btnAdmin.style.display = "none";
    }
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
        const res = await fetch(`${API_URL}/admin/usuarios`, {
            method: 'GET',
            headers: { 'admin-email': usuarioActual.email }
        });
        
        if (!res.ok) throw new Error("Sin permiso");
        
        const usuarios = await res.json();
        tbody.innerHTML = ""; 

        usuarios.forEach(u => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:8px; font-weight:bold;">${u.nickname}</td>
                <td style="padding:8px; font-size:0.8rem; color:#ccc;">${u.email}</td>
                <td style="padding:8px; color:gold;">${u.monedas}</td>
                <td style="padding:8px;">
                    <button onclick="prepararRecarga('${u.email}')" style="padding:2px 8px; font-size:0.7rem; margin:0;">➕</button>
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
            const res = await fetch(`${API_URL}/admin/recargar-manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

// 1. Catálogo Definido (Sonidos)
const catalogoSonidos = [
    { id: 'snd_risa', nombre: 'Risa', emoji: '😂', precio: 0, file: 'assets/audios/tienda/risa.mp3' },
    { id: 'snd_corneta', nombre: 'Corneta', emoji: '📯', precio: 0, file: 'assets/audios/tienda/corneta.mp3' },
    { id: 'snd_tepasas', nombre: 'Te pasas', emoji: '😒', precio: 8, file: 'assets/audios/tienda/tepasas.mp3' },
    { id: 'snd_misahorros', nombre: 'Mis Ahorros', emoji: '😭', precio: 8, file: 'assets/audios/tienda/misahorros.mp3' },
    { id: 'snd_ronquido', nombre: 'Ronquido', emoji: '😴', precio: 8, file: 'assets/audios/tienda/ronquido.mp3' },
    { id: 'snd_cuack', nombre: 'Cuack', emoji: '🦆', precio: 8, file: 'assets/audios/tienda/cuack.mp3' },
    { id: 'snd_disparo', nombre: 'Disparo', emoji: '🔫', precio: 8, file: 'assets/audios/tienda/disparo.mp3' }
];

// 2. Catálogo de Fichas (Skins)
const catalogoFichas = [
    { id: 'skin_default', nombre: 'Clásica', precio: 0, img: 'assets/imagenes/ui/ficha.PNG' },
    { id: 'skin_bitcoin', nombre: 'Bitcoin', precio: 5, img: 'assets/imagenes/ui/fichasbitcoin.png' },
    { id: 'skin_corazon', nombre: 'Corazones', precio: 5, img: 'assets/imagenes/ui/fichascorazones.png' },
    { id: 'skin_verde',   nombre: 'Verde Neon', precio: 5, img: 'assets/imagenes/ui/fichasverdes.png' },
    { id: 'skin_frijol',  nombre: 'Frijolito', precio: 5, img: 'assets/imagenes/ui/fichasfrijol.png' }
];

// Ficha activa localmente (Persistencia)
let fichaActivaUrl = localStorage.getItem("loteria_ficha_activa") || 'assets/imagenes/ui/ficha.PNG';

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
            btnHtml = `<button class="btn-buy" onclick="comprarItem('${item.id}', ${item.precio})">$${item.precio}</button>`;
        }

        div.innerHTML = `
            <div style="font-size: 2rem; cursor:pointer;" onclick="previewSonido('${item.file}')">${item.emoji}</div>
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
            btnHtml = `<button class="btn-use" onclick="usarFicha('${item.img}')">Usar</button>`;
        } else {
            btnHtml = `<button class="btn-buy" onclick="comprarItem('${item.id}', ${item.precio})">$${item.precio}</button>`;
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

// Función para ACTIVAR una ficha (Guardar preferencia local)
function usarFicha(urlImagen) {
    fichaActivaUrl = urlImagen;
    localStorage.setItem("loteria_ficha_activa", urlImagen);
    
    mostrarAlerta("¡Ficha actualizada!", "Estilo Nuevo 😎");
    
    // Refrescar el modal para que se vea el botón verde "En Uso"
    const grid = document.getElementById("gridTiendaItems");
    grid.innerHTML = "";
    renderizarFichas(grid);
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
    console.log("📥 Datos sincronizados recibidos:", datosFrescos);

    if (usuarioActual) {
        usuarioActual.monedas = datosFrescos.monedas;
        usuarioActual.inventario = datosFrescos.inventario || [];
        localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
    }

    // --- ACTUALIZAR TODAS LAS ETIQUETAS DE LA UI AL MISMO TIEMPO ---

    // 1. Menú Principal (Monedero - SOLO NÚMERO)
    const menuMonedas = document.getElementById("menuMonedas");
    if(menuMonedas) menuMonedas.textContent = datosFrescos.monedas;

    // 2. Tienda
    const saldoTienda = document.getElementById("saldoTienda");
    if(saldoTienda) saldoTienda.innerHTML = `Tu saldo: <span style="color:white;">$${datosFrescos.monedas}</span>`;
    
    // Si la tienda está visible, recargamos la lista
    if(document.querySelector('.tienda-card')) {
        cargarTienda(); 
    }

    // 3. Juego
    const gameMonedas = document.getElementById("monedas-valor");
    if(gameMonedas) gameMonedas.textContent = datosFrescos.monedas;

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
window.verificarDestinatario = async () => {
    const inputDest = document.getElementById("inputDestinatario");
    // .trim() quita espacios al inicio y final, pero respeta los de en medio ("La Gata")
    const nickname = inputDest.value.trim(); 
    
    const btnBuscar = event.target; 
    const textoOriginal = btnBuscar.innerText;

    if (!nickname) return mostrarAlerta("Escribe un nickname", "Dato faltante");
    if (usuarioActual && nickname === usuarioActual.nickname) return mostrarAlerta("No puedes enviarte a ti mismo", "Error");

    btnBuscar.innerText = "🔍 Buscando...";
    btnBuscar.disabled = true;

    try {
        // --- CAMBIO CLAVE: USAMOS POST Y JSON ---
        const res = await fetch(`${API_URL}/buscar-destinatario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
window.realizarTransferencia = async () => {
    // Usamos el ID correcto que tienes en tu HTML: inputMontoTransferir
    const inputMonto = document.getElementById("inputMontoTransferir");
    const monto = parseInt(inputMonto.value);
    
    if(!destinatarioConfirmado) return mostrarAlerta("Error interno: Destinatario perdido. Busca de nuevo.", "Error");
    if(!monto || monto < 2) return mostrarAlerta("La transferencia mínima es de $2 monedas", "Monto inválido");
    if(monto > usuarioActual.monedas) return mostrarAlerta("No tienes suficientes monedas", "Saldo insuficiente");

    // Confirmación final antes de enviar
    mostrarConfirmacion(`¿Seguro que quieres enviar $${monto} monedas a ${destinatarioConfirmado.nickname}?`, async () => {
        
        // Feedback visual en el botón de confirmar
        const btnConfirmar = event.target || document.querySelector("#step-amount button:last-child");
        let textoBtnOriginal = "CONFIRMAR";
        if(btnConfirmar) {
            textoBtnOriginal = btnConfirmar.innerText;
            btnConfirmar.innerText = "Enviando...";
            btnConfirmar.disabled = true;
        }
        
        try {
            const res = await fetch(`${API_URL}/transferir-saldo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

        const res = await fetch(`${API_URL}/historial-usuario?email=${usuarioActual.email}`);
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

// Iniciar al cargar la página
window.addEventListener('load', iniciarFabDraggable);