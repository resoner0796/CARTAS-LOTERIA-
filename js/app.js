
// ======================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ======================================================

// URL DEL BACKEND (Render)
const API_URL = "https://loteria-backend-3nde.onrender.com/api";
const socket = io("https://loteria-backend-3nde.onrender.com");

// Variables Globales
let usuarioActual = null; // {email, nickname, monedas}
let jugadoresGlobal = {};
let miId;
let soyHost = false;
let seleccionadas = [];
let salaActual = "";
let haApostadoLocal = false;
let historialIdsGlobal = [];

// Generamos IDs de cartas (del 01 al 54)
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
const btnIniciar = document.getElementById("btnIniciar"); // Botón flotante en selección
const historial = document.getElementById("historial");
const jugadoresLista = document.getElementById("jugadoresLista");
const jugadoresListaIngame = document.getElementById("jugadoresListaIngame");
const btnSalirSala = document.getElementById("btnSalirSala");
const btnApostar = document.getElementById("btnApostar");
const monedasEl = document.getElementById("monedas-valor");
const boteEl = document.getElementById("bote-valor");

// Referencias DOM - Modales y Audios
const loteriaModal = document.getElementById("loteriaModal"); // Modal de verificar cartas
const modalLoteriaTitulo = document.getElementById("modalLoteriaTitulo");
const modalLoteriaTexto = document.getElementById("modalLoteriaTexto");
const btnAceptarGanador = document.getElementById("btnAceptarGanador");
const btnRechazarGanador = document.getElementById("btnRechazarGanador");
const modalVerificationArea = document.getElementById("modalVerificationArea");
let ganadorTempId = "";

const audioBarajear = document.getElementById("audioBarajear");
const audioCampana = document.getElementById("audioCampana");
const audioCorre = document.getElementById("audioCorre");
const audioAplausos = document.getElementById("audioAplausos");
const loteriaMensaje = document.getElementById("loteriaMensaje"); // Overlay "LOTERÍA"

// ======================================================
// SISTEMA DE MODALES PRO (Reemplazo de Alert/Confirm)
// ======================================================

const modalSistema = document.getElementById("modalSistema");
const modalTitulo = document.getElementById("modalSistemaTitulo");
const modalMensaje = document.getElementById("modalSistemaMensaje");
const btnModalAceptar = document.getElementById("btnModalAceptar");
const btnModalCancelar = document.getElementById("btnModalCancelar");

let onModalAceptar = null; // Callback para la acción "Sí"

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

// Listeners del Modal Sistema
if(btnModalAceptar) btnModalAceptar.onclick = () => { if (onModalAceptar) onModalAceptar(); else cerrarModal(); };
if(btnModalCancelar) btnModalCancelar.onclick = () => cerrarModal();


// ======================================================
// INICIO Y AUTENTICACIÓN
// ======================================================

window.onload = () => {
    // 1. Revisar sesión guardada
    const sesionGuardada = localStorage.getItem("loteria_usuario");
    
    if (sesionGuardada) {
        usuarioActual = JSON.parse(sesionGuardada);
        configurarMenu();
        cargarTienda();
        
        // Obtenemos los parámetros de la URL una sola vez
        const urlParams = new URLSearchParams(window.location.search);
        const salaInvitacion = urlParams.get('sala');
        const pagoEstado = urlParams.get('pago');

        // 2. DETECTAR RETORNO DE PAGOS (STRIPE)
        if (pagoEstado === 'exito') {
            const cant = urlParams.get('cantidad');
            mostrarAlerta(`¡Has recibido ${cant} monedas! 🎉`, "¡Pago Exitoso!");
            
            // Actualización visual inmediata y guardado local
            if(usuarioActual) {
                // Aseguramos que sean números para sumar bien
                usuarioActual.monedas = (parseInt(usuarioActual.monedas) || 0) + parseInt(cant);
                localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
                configurarMenu();
                cargarTienda();
            }
            
            // Limpiamos la URL para borrar ?pago=exito
            window.history.pushState({}, document.title, window.location.pathname);
        
        } else if (pagoEstado === 'cancelado') {
            mostrarAlerta("La compra fue cancelada. No se te cobró nada.", "Aviso");
            window.history.pushState({}, document.title, window.location.pathname);
        }

        // 3. DETECTAR INVITACIÓN O NAVEGACIÓN NORMAL
        if(salaInvitacion) {
             unirseSalaDirecto(salaInvitacion, null); // Invitados no eligen modo
        } else {
             // Si no hay invitación, mandamos al menú
             cambiarPantalla("menu");
        }
        
        // 4. Reconexión socket
        if(socket.connected) socket.emit('reconectar', { sala: salaActual, email: usuarioActual.email });

    } else {
        // Si no hay sesión, mandamos al login
        setTimeout(() => cambiarPantalla("login"), 1000);
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
            cargarTienda();
            
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
            cargarTienda();
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
        document.getElementById("menuMonedas").textContent = `💰 ${usuarioActual.monedas}`;
        verificarSiSoyAdmin();
    }
}

// ======================================================
// GESTIÓN DE SALAS (ACTUALIZADO: MODOS DE JUEGO)
// ======================================================

function crearSalaPropia() {
    const nombreSala = document.getElementById("inputCrearSala").value.trim();
    // Leemos el modo del select que agregaste al HTML
    const selectModo = document.getElementById("inputModoJuego");
    const modoJuego = selectModo ? selectModo.value : "clasico"; 
    
    if(!nombreSala) return mostrarAlerta("Ponle nombre a tu sala");
    unirseSalaDirecto(nombreSala, modoJuego);
}

function unirseSalaExistente() {
    const nombreSala = document.getElementById("inputUnirseSala").value.trim();
    if(!nombreSala) return mostrarAlerta("Escribe el nombre de la sala");
    // Al unirse como invitado, el modo no importa (lo define la sala), mandamos null
    unirseSalaDirecto(nombreSala, null);
}

function unirseSalaDirecto(nombreSala, modo) {
    salaActual = nombreSala;
    
    // Configurar Fondos
    const basePath = "assets/imagenes/ui/";
    switch(salaActual) { 
      case "Familia":
        aplicarFondo(pantallas.seleccion, basePath + "fondo-seleccion-familia.PNG");
        aplicarFondo(pantallas.juego, basePath + "fondo-juego-familia.PNG");
        break;
      case "Oficina":
        aplicarFondo(pantallas.seleccion, basePath + "fondo-seleccion-oficina.PNG");
        aplicarFondo(pantallas.juego, basePath + "fondo-juego-oficina.PNG");
        break;
      case "Amigos":
        aplicarFondo(pantallas.seleccion, basePath + "fondo-seleccion-amigos.PNG");
        aplicarFondo(pantallas.juego, basePath + "fondo-juego-amigos.PNG");
        break;
      default:
        aplicarFondo(pantallas.seleccion, basePath + "fondo-seleccion.PNG");
        aplicarFondo(pantallas.juego, basePath + "fondo-juego.PNG");
    }

    // Unirse al socket enviando el modo (si existe)
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

function compartirSala() {
    const url = `${window.location.origin}${window.location.pathname}?sala=${encodeURIComponent(salaActual)}`;
    
    if (navigator.share) {
        navigator.share({
            title: '¡Vamos a jugar Lotería!',
            text: `Únete a la sala "${salaActual}"`,
            url: url
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(url);
        mostrarAlerta("Enlace copiado al portapapeles", "¡Listo!");
    }
}

// Funcionalidad Botón Salir (Lobby)
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
   
  // 1. DESELECCIONAR
  if (seleccionadas.includes(id)) {
      seleccionadas = seleccionadas.filter(c => c !== id);
      img.classList.remove("seleccionada");
      socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
      
      if (seleccionadas.length < 2) btnIniciar.style.display = "none";
      return;
  }

  // 2. VALIDAR
  if (img.style.pointerEvents === 'none') return; 
   
  // 3. SELECCIONAR
  if (seleccionadas.length < 4) {
    img.classList.add("seleccionada");
    seleccionadas.push(id);
    socket.emit("seleccionar-carta", { carta: id, sala: salaActual });
    
    if (seleccionadas.length >= 2) btnIniciar.style.display = "block";
  }
}

// Al dar click en "Elegir Cartas" (o el botón flotante Iniciar)
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
};

function marcarFicha(e, contenedor) {
  const elementoClickeado = e.target;

  // CASO BORRAR
  if (elementoClickeado.classList.contains("ficha")) {
      if(navigator.vibrate) navigator.vibrate(10);
      elementoClickeado.remove();
      return; 
  }

  // CASO PONER
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
    // Función interna para ejecutar el cambio
    const ejecutarCambio = () => {
        seleccionadas.forEach(id => {
            socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
        });

        seleccionadas = [];
        limpiarFichas();
        juegoCartas.innerHTML = "";
        btnIniciar.style.display = "none";
        
        // Reset visual selección
        document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
            img.classList.remove("seleccionada");
            img.style.opacity = 1; 
            img.style.pointerEvents = "auto";
        });

        cambiarPantalla("seleccion");
    };

    const btnDetener = document.getElementById("btnDetenerJuego");
    // Si soy Host y el juego corre, pregunto primero
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
   
  // Lista de controles exclusivos del Host
  const controlesHost = ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "divVelocidad"]; 
   
  controlesHost.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          // Si soy host lo muestro (flex para el div de velocidad, block para botones)
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
// LOTERÍA (GANADORES) - NUEVA LÓGICA DE EMPATES
// ======================================================

function emitirLoteria() {
  audioCorre.pause();
  audioCampana.pause();
  audioBarajear.pause();
  // El mensaje ya no lo mostramos aquí, lo dispara el server con 'pausa-empate'
   
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

// 1. INICIO DE LA VENTANA DE EMPATE (Cuenta regresiva)
socket.on("pausa-empate", ({ primerGanador, tiempo }) => {
    loteriaMensaje.style.display = "block";
    loteriaMensaje.innerHTML = `
        <div style="font-size:2rem; color: gold; text-shadow: 2px 2px 0 #000;">¡${primerGanador} gritó BUENAS!</div>
        <div style="font-size:1.2rem; margin-top:20px; color: white;">Esperando empates... <span id="contadorEmpate" style="font-weight:bold; font-size:1.5rem;">${tiempo}</span>s</div>
    `;
    
    // Animación visual de cuenta regresiva
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

// 2. HOST: INICIAR VALIDACIÓN SECUENCIAL
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
    
    // Llenar historial visual
    const modalHistorialFlex = document.getElementById("modalHistorialFlex");
    modalHistorialFlex.innerHTML = "";
    historialIdsGlobal.forEach(cartaId => {
         const img = document.createElement("img");
         img.src = `assets/imagenes/barajas/${cartaId}.png`;
         modalHistorialFlex.appendChild(img);
    });

    // Llenar tabla del jugador
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

// BOTONES DEL MODAL
if(btnAceptarGanador) btnAceptarGanador.onclick = () => {
    if (ganadorTempId) {
        // Emitimos el nuevo evento 'veredicto-host'
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

// 3. RESULTADOS FINALES
socket.on("ganadores-multiples", ({ ganadores, premio }) => {
    loteriaMensaje.style.display = "none";
    let msg = "";
    if (ganadores.length > 1) {
        msg = `¡EMPATE! 🤝\nGanadores: ${ganadores.join(", ")}\nSe llevan ${premio} monedas cada uno.`;
    } else {
        msg = `¡TENEMOS GANADOR! 🏆\n${ganadores[0]} se lleva ${premio} monedas.`;
    }
    mostrarAlerta(msg, "¡RESULTADO FINAL!");
    
    // Confeti y audio final
    audioAplausos.currentTime = 0;
    audioAplausos.play().catch(()=>{});
    if(navigator.vibrate) navigator.vibrate([100,50,100,50,500]);

    // Efecto visual confeti (mismo que antes)
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

// PON AQUÍ EL MISMO CORREO QUE PUSISTE EN EL SERVER
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
    
    // CORRECCIÓN: Usamos 'usuarioActual' en lugar de 'currentUser'
    if(!usuarioActual) return;

    // Actualizar texto de saldo
    saldoTxt.innerHTML = `Tu saldo: <span style="color:white;">$${usuarioActual.monedas}</span>`;

    contenedor.innerHTML = ''; 

    // CORRECCIÓN: Usamos 'usuarioActual'
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

function previewSonido(ruta) {
    audioPlayerTienda.src = ruta;
    audioPlayerTienda.volume = 0.5;
    audioPlayerTienda.play().catch(e => console.log("Error preview:", e));
}

async function comprarItem(itemId, precio) {
    // CORRECCIÓN: Usamos 'usuarioActual'
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
    // (Asegúrate de que el ID 'menuMonedas' exista en tu HTML, si no, comenta esta línea)
    const menuMonedasEl = document.getElementById('menuMonedas');
    if(menuMonedasEl) menuMonedasEl.innerText = `💰 ${usuarioActual.monedas}`;

    // --- ENVIAR AL SERVIDOR ---
    socket.emit('comprar-item', { 
        email: usuarioActual.email, 
        itemId: itemId, 
        precio: precio 
    });
}

// CORRECCIÓN TAMBIÉN EN EL SOCKET LISTENER
socket.on('usuario-actualizado', (data) => {
    if (usuarioActual && data.email === usuarioActual.email) {
        usuarioActual.monedas = data.monedas;
        usuarioActual.inventario = data.inventario || [];
        
        // Si estamos en el menú, recargar tienda
        if(document.getElementById('pantallaMenu').classList.contains('activa')) {
            cargarTienda();
            const menuMonedasEl = document.getElementById('menuMonedas');
            if(menuMonedasEl) menuMonedasEl.innerText = `💰 ${data.monedas}`;
        }
    }
});