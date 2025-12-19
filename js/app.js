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
  cartasDisponibles.forEach(id => {
    const img = document.createElement("img");
    img.src = `assets/imagenes/cartas/${id}.jpg`;
    img.classList.add("carta-img");
    img.dataset.id = id;
    img.onclick = () => seleccionarCarta(img);
    contenedorCartas.appendChild(img);
  });
}

function seleccionarCarta(img) {
  const id = img.dataset.id;
   
  if (seleccionadas.includes(id)) {
      seleccionadas = seleccionadas.filter(c => c !== id);
      img.classList.remove("seleccionada");
      socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
      
      if (seleccionadas.length < 2) btnIniciar.style.display = "none";
      return;
  }

  if (img.style.pointerEvents === 'none') return; 
   
  if (seleccionadas.length < 4) {
    img.classList.add("seleccionada");
    seleccionadas.push(id);
    socket.emit("seleccionar-carta", { carta: id, sala: salaActual });
    
    if (seleccionadas.length >= 2) btnIniciar.style.display = "block";
  }
}

btnIniciar.onclick = () => {
  cambiarPantalla("juego");
  juegoCartas.innerHTML = "";
  seleccionadas.forEach(id => {
    const contenedor = document.createElement("div");
    contenedor.classList.add("carta-juego");
    contenedor.dataset.id = id;
    contenedor.innerHTML = `<img src="assets/imagenes/cartas/${id}.jpg" class="carta-img seleccionada">`;
    contenedor.onclick = e => marcarFicha(e, contenedor);
    juegoCartas.appendChild(contenedor);
  });
  
  // Mostrar botón de sonidos al entrar al juego
  renderizarSonidosJuego();
};

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
  ficha.src = "assets/imagenes/ui/ficha.PNG";
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
  const cantidad = Math.max(1, seleccionadas.length || 1);
  socket.emit("apostar", { sala: salaActual, cantidad });
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

// ==================== LÓGICA DE TIENDA DE SONIDOS ====================

// 1. Catálogo Definido (Precios y Archivos)
const catalogoSonidos = [
    { id: 'snd_risa', nombre: 'Risa', emoji: '😂', precio: 0, file: 'assets/audios/tienda/risa.mp3' },
    { id: 'snd_corneta', nombre: 'Corneta', emoji: '📯', precio: 0, file: 'assets/audios/tienda/corneta.mp3' },
    { id: 'snd_tepasas', nombre: 'Te pasas', emoji: '😒', precio: 8, file: 'assets/audios/tienda/tepasas.mp3' },
    { id: 'snd_misahorros', nombre: 'Mis Ahorros', emoji: '😭', precio: 8, file: 'assets/audios/tienda/misahorros.mp3' },
    { id: 'snd_ronquido', nombre: 'Ronquido', emoji: '😴', precio: 8, file: 'assets/audios/tienda/ronquido.mp3' },
    { id: 'snd_cuack', nombre: 'Cuack', emoji: '🦆', precio: 8, file: 'assets/audios/tienda/cuack.mp3' },
    { id: 'snd_disparo', nombre: 'Disparo', emoji: '🔫', precio: 8, file: 'assets/audios/tienda/disparo.mp3' }
];

const audioPlayerTienda = new Audio();

function cargarTienda() {
    const contenedor = document.getElementById('listaSonidosTienda');
    const saldoTxt = document.getElementById('saldoTienda');
    
    if(!usuarioActual) return;

    // Actualizar texto de saldo (con estilo HTML)
    if(saldoTxt) saldoTxt.innerHTML = `Tu saldo: <span style="color:white;">$${usuarioActual.monedas}</span>`;

    if(contenedor) {
        contenedor.innerHTML = ''; 
        const inventario = usuarioActual.inventario || []; 

        catalogoSonidos.forEach(item => {
            const yaLoTiene = inventario.includes(item.id);
            const div = document.createElement('div');
            div.className = `item-sonido ${yaLoTiene ? 'comprado' : ''}`;
            
            let botonHTML = '';
            if (yaLoTiene) {
                botonHTML = `<button class="btn-accion-tienda btn-listo">✔ Listo</button>`;
            } else if (item.precio === 0) {
                botonHTML = `<button class="btn-accion-tienda btn-gratis" onclick="comprarItem('${item.id}', 0)">GRATIS</button>`;
            } else {
                botonHTML = `<button class="btn-accion-tienda btn-comprar" onclick="comprarItem('${item.id}', ${item.precio})">$${item.precio}</button>`;
            }

            div.innerHTML = `
                <div class="info-sonido">
                    <button class="btn-play-preview" onclick="previewSonido('${item.file}')">▶</button>
                    <div>
                        <span class="emoji-icon">${item.emoji}</span>
                        <span class="nombre-sonido">${item.nombre}</span>
                    </div>
                </div>
                ${botonHTML}
            `;
            contenedor.appendChild(div);
        });
    }
}

function previewSonido(ruta) {
    audioPlayerTienda.src = ruta;
    audioPlayerTienda.volume = 0.5;
    audioPlayerTienda.play().catch(e => console.log("Error preview:", e));
}

async function comprarItem(itemId, precio) {
    if (!usuarioActual) return;

    if (usuarioActual.monedas < precio) {
        if(confirm("¡No tienes suficientes monedas! ¿Quieres recargar?")) {
            abrirModalRecarga();
        }
        return;
    }

    if (precio > 0) {
        if (!confirm(`¿Comprar este sonido por $${precio} monedas?`)) return;
    }

    // --- OPTIMISTIC UI ---
    usuarioActual.monedas -= precio;
    if (!usuarioActual.inventario) usuarioActual.inventario = [];
    usuarioActual.inventario.push(itemId);
    
    cargarTienda();
    // Actualizar el saldo en el menú principal
    const menuMonedasEl = document.getElementById('menuMonedas');
    if(menuMonedasEl) menuMonedasEl.textContent = usuarioActual.monedas;

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

// ==========================================
// SISTEMA DE TRANSFERENCIAS (PÁSAME UNA FERIA)
// ==========================================

let destinatarioUID = null;
let destinatarioData = null;

function abrirModalTransferencia() {
    // Busca el modal por ID y le agrega la clase 'visible' o cambia el display
    const modal = document.getElementById('modalTransferencia');
    if(modal) {
        modal.classList.add('visible'); // Si usas la clase .visible del CSS nuevo
        modal.style.opacity = "1";      // Refuerzo inline
        modal.style.visibility = "visible"; // Refuerzo inline
        modal.style.pointerEvents = "all"; // Refuerzo inline
        
        // Resetear pasos
        document.getElementById('step-find-user').style.display = 'block';
        document.getElementById('step-amount').style.display = 'none';
        document.getElementById('inputDestinatario').value = '';
        document.getElementById('inputMontoTransferir').value = '';
    } else {
        console.error("No se encontró el modal con ID: modalTransferencia");
    }
}

function cerrarModalTransferencia() {
    const modal = document.getElementById('modalTransferencia');
    if(modal) {
        modal.classList.remove('visible');
        modal.style.opacity = "0";
        modal.style.visibility = "hidden";
        modal.style.pointerEvents = "none";
    }
}

// Lógica para buscar usuario
async function verificarDestinatario() {
    const nicknameInput = document.getElementById('inputDestinatario').value.trim();
    
    // Asumiendo que usas Firebase Auth
    const user = firebase.auth().currentUser;
    if (!user) return showModal('Error', 'Debes iniciar sesión.', 'error');

    if (!nicknameInput) {
        return alert("Escribe un nickname"); // O tu función showModal
    }

    try {
        // Busca en la colección 'users' el campo 'nickname'
        const snapshot = await db.collection('users').where('nickname', '==', nicknameInput).get();

        if (snapshot.empty) {
            alert("Usuario no encontrado");
            return;
        }

        const doc = snapshot.docs[0];
        if (doc.id === user.uid) {
            alert("No te puedes transferir a ti mismo");
            return;
        }

        destinatarioUID = doc.id;
        destinatarioData = doc.data();

        // Muestra siguiente paso
        document.getElementById('step-find-user').style.display = 'none';
        document.getElementById('step-amount').style.display = 'block';
        document.getElementById('userFoundMsg').textContent = `✅ Jugador encontrado: ${destinatarioData.nickname}`;

    } catch (error) {
        console.error("Error al buscar:", error);
    }
}

function cancelarTransferencia() {
    document.getElementById('step-find-user').style.display = 'block';
    document.getElementById('step-amount').style.display = 'none';
    destinatarioUID = null;
}

async function realizarTransferencia() {
    const monto = parseInt(document.getElementById('inputMontoTransferir').value);
    const user = firebase.auth().currentUser;

    if (!monto || monto < 2) return alert("Mínimo 2 monedas");

    try {
        await db.runTransaction(async (transaction) => {
            const senderRef = db.collection('users').doc(user.uid);
            const receiverRef = db.collection('users').doc(destinatarioUID);

            const senderDoc = await transaction.get(senderRef);
            const saldoActual = senderDoc.data().monedas || 0;

            if (saldoActual < monto) throw "Saldo insuficiente";

            transaction.update(senderRef, { monedas: saldoActual - monto });
            transaction.update(receiverRef, { monedas: firebase.firestore.FieldValue.increment(monto) });
        });

        cerrarModalTransferencia();
        alert(`¡Transferencia de ${monto} exitosa!`);
        
    } catch (e) {
        alert("Error: " + e);
    }
}