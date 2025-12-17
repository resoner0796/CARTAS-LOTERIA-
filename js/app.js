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

// Generamos IDs de cartas (del 01 al 54, asumiendo baraja estándar completa)
// Nota: Ajusta el length si usas menos cartas (ej. 30 o 54)
const cartasDisponibles = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));

// Referencias DOM - Pantallas
const pantallas = {
  splash: document.getElementById("pantallaSplash"),
  login: document.getElementById("pantallaLogin"),
  registro: document.getElementById("pantallaRegistro"),
  menu: document.getElementById("pantallaMenu"),
  sala: document.getElementById("pantallaSala"),
  seleccion: document.getElementById("pantallaSeleccion"),
  juego: document.getElementById("pantallaJuego")
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
    // Revisar sesión guardada
    const sesionGuardada = localStorage.getItem("loteria_usuario");
    
    if (sesionGuardada) {
        usuarioActual = JSON.parse(sesionGuardada);
        configurarMenu();
        
        // Revisar invitación por URL
        const urlParams = new URLSearchParams(window.location.search);
        const salaInvitacion = urlParams.get('sala');
        
        if(salaInvitacion) {
             unirseSalaDirecto(salaInvitacion);
        } else {
             cambiarPantalla("menu");
        }
        
        // Reconexión socket
        if(socket.connected) socket.emit('reconectar', { sala: salaActual, email: usuarioActual.email });

    } else {
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
            
            const urlParams = new URLSearchParams(window.location.search);
            const salaInvitacion = urlParams.get('sala');
            if(salaInvitacion) unirseSalaDirecto(salaInvitacion);
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
    }
}

// ======================================================
// GESTIÓN DE SALAS
// ======================================================

function crearSalaPropia() {
    const nombreSala = document.getElementById("inputCrearSala").value.trim();
    if(!nombreSala) return mostrarAlerta("Ponle nombre a tu sala");
    unirseSalaDirecto(nombreSala);
}

function unirseSalaExistente() {
    const nombreSala = document.getElementById("inputUnirseSala").value.trim();
    if(!nombreSala) return mostrarAlerta("Escribe el nombre de la sala");
    unirseSalaDirecto(nombreSala);
}

function unirseSalaDirecto(nombreSala) {
    salaActual = nombreSala;
    
    // Configurar Fondos
    const basePath = "assets/imagenes/ui/";
    const temaElegido = document.getElementById("temaVisual") ? document.getElementById("temaVisual").value : "default";

    // Puedes usar switch por nombre de sala o por el selector de tema
    // Aquí priorizamos el selector si existe, si no, lógica simple
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

    // Unirse al socket
    socket.emit("unirse-sala", { 
        nickname: usuarioActual.nickname, 
        email: usuarioActual.email,
        sala: salaActual 
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
  
  // Mostrar/Ocultar controles de Host
  const controles = ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "btnReiniciar"]; // btnReiniciar ya no existe en HTML nuevo pero por si acaso
  controles.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = soyHost ? "block" : "none";
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
      return `<div>${j.nickname} ${check}</div>`;
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
// LOTERÍA (GANADORES)
// ======================================================

function emitirLoteria() {
  audioCorre.pause();
  audioCampana.pause();
  audioBarajear.pause();
  mostrarLoteriaMensaje();
  
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

function mostrarLoteriaMensaje() {
  loteriaMensaje.style.display = "block";
  if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
  
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
  setTimeout(() => { loteriaMensaje.style.display = "none"; }, 4000);
}

// Reemplaza toda la función socket.on("loteria-anunciada"...) por esta:

socket.on("loteria-anunciada", (nicknameGanador, idGanador, boardState) => {
    if (soyHost) {
        ganadorTempId = idGanador;
        modalLoteriaTitulo.textContent = "¡Validar Lotería!";
        modalLoteriaTexto.textContent = `${nicknameGanador} grita ¡LOTERÍA! Revisa su tabla contra el historial.`;
        
        // --- NUEVO: LLENAR EL HISTORIAL DEL MODAL ---
        const modalHistorialFlex = document.getElementById("modalHistorialFlex");
        modalHistorialFlex.innerHTML = ""; // Limpiamos basura vieja
        
        // Llenamos con las cartas que tenemos en memoria global
        historialIdsGlobal.forEach(cartaId => {
             const img = document.createElement("img");
             // Usamos las imágenes de la BARAJA (las que salen cantadas)
             img.src = `assets/imagenes/barajas/${cartaId}.png`;
             modalHistorialFlex.appendChild(img);
        });
        // --------------------------------------------

        modalVerificationArea.innerHTML = ''; 

        if (boardState && boardState.cards) {
            boardState.cards.forEach(cardId => {
                const cardContainer = document.createElement('div');
                cardContainer.className = 'carta-juego';

                const cardImg = document.createElement('img');
                cardImg.src = `assets/imagenes/cartas/${cardId}.jpg`;
                cardImg.className = 'carta-img seleccionada';
                // Importante: quitar pointer-events en el modal para que no se puedan mover fichas ahí
                cardImg.style.pointerEvents = "none"; 
                cardContainer.appendChild(cardImg);

                if (boardState.chips && boardState.chips[cardId]) {
                    boardState.chips[cardId].forEach(chipPos => {
                        const ficha = document.createElement("img");
                        ficha.src = "assets/imagenes/ui/ficha.PNG";
                        ficha.className = "ficha";
                        ficha.style.left = chipPos.left;
                        ficha.style.top = chipPos.top;
                        ficha.style.pointerEvents = "none"; // Fichas estáticas en el modal
                        cardContainer.appendChild(ficha);
                    });
                }
                modalVerificationArea.appendChild(cardContainer);
            });
        }
        loteriaModal.classList.add("active");
    }
});

if(btnAceptarGanador) btnAceptarGanador.addEventListener("click", () => {
    if (ganadorTempId) {
        socket.emit("confirmar-ganador", { sala: salaActual, ganadorId: ganadorTempId, esValido: true });
        loteriaModal.classList.remove("active");
        modalVerificationArea.innerHTML = '';
        ganadorTempId = "";
    }
});

if(btnRechazarGanador) btnRechazarGanador.addEventListener("click", () => {
    if (ganadorTempId) {
        socket.emit("confirmar-ganador", { sala: salaActual, ganadorId: ganadorTempId, esValido: false });
        loteriaModal.classList.remove("active");
        modalVerificationArea.innerHTML = '';
        ganadorTempId = "";
    }
});

socket.on("ganador-confirmado", (ganadorId) => {
    if (jugadoresGlobal[ganadorId]) {
        mostrarAlerta(`🎉 ${jugadoresGlobal[ganadorId].nickname} ganó el bote!`, "¡GANADOR!");
        audioAplausos.play().catch(() => {});
        if(navigator.vibrate) navigator.vibrate([100,50,100,50,500]);
    }
    loteriaMensaje.style.display = "none";
});

socket.on("ganador-rechazado", (ganadorId) => {
    mostrarAlerta(`${jugadoresGlobal[ganadorId]?.nickname || "Jugador"} fue rechazado.`, "Falsa Alarma");
    loteriaMensaje.style.display = "none";
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
        if(navigator.vibrate) navigator.vibrate(50);
    }
}

function iniciarPagoStripe(cantidadMonedas) {
    // AQUÍ VA LA MAGIA DE STRIPE (Próximamente)
    // Por ahora, solo simulamos para que veas el flujo
    cerrarModal(); // Cerramos tienda
    document.getElementById('modalTienda').classList.remove('active');
    
    mostrarConfirmacion(`¿Ir a pagar el paquete de ${cantidadMonedas} monedas?`, () => {
        // Aquí redirigiremos a Stripe Checkout
        mostrarAlerta("Próximamente: Redirección segura a Stripe...", "En construcción 🚧");
    });
}