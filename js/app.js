// js/app.js

// URL DEL BACKEND (Render)
const API_URL = "https://loteria-backend-3nde.onrender.com/api";

let usuarioActual = null; // {email, nickname, monedas}
let jugadoresGlobal = {};
let miId;
const socket = io("https://loteria-backend-3nde.onrender.com");

let soyHost = false;
let seleccionadas = [];
let salaActual = "";
const cartasDisponibles = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));

// Referencias a pantallas
const pantallas = {
  splash: document.getElementById("pantallaSplash"),
  login: document.getElementById("pantallaLogin"),
  registro: document.getElementById("pantallaRegistro"),
  menu: document.getElementById("pantallaMenu"),
  sala: document.getElementById("pantallaSala"),
  seleccion: document.getElementById("pantallaSeleccion"),
  juego: document.getElementById("pantallaJuego")
};

// Referencias DOM Juego
const contenedorCartas = document.getElementById("contenedorCartas");
const juegoCartas = document.getElementById("juegoCartas");
const btnIniciar = document.getElementById("btnIniciar");
const historial = document.getElementById("historial");
const jugadoresLista = document.getElementById("jugadoresLista");
const jugadoresListaIngame = document.getElementById("jugadoresListaIngame"); // Nueva referencia para ver jugadores en partida

const btnSalirSala = document.getElementById("btnSalirSala");
const btnApostar = document.getElementById("btnApostar");
const monedasEl = document.getElementById("monedas-valor");
const boteEl = document.getElementById("bote-valor");
let haApostadoLocal = false;

// Referencias Modal
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
const loteriaMensaje = document.getElementById("loteriaMensaje");

// ==================== INICIO / AUTH / MENU ====================

window.onload = () => {
    // 1. Revisar si ya hay usuario guardado en el cel
    const sesionGuardada = localStorage.getItem("loteria_usuario");
    
    if (sesionGuardada) {
        usuarioActual = JSON.parse(sesionGuardada);
        configurarMenu();
        
        // Revisar si viene de un link de invitación
        const urlParams = new URLSearchParams(window.location.search);
        const salaInvitacion = urlParams.get('sala');
        
        if(salaInvitacion) {
             unirseSalaDirecto(salaInvitacion);
        } else {
             cambiarPantalla("menu");
        }
        
        // Intentar reconexión de socket ligada al usuario
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

// Lógica de Login
async function login() {
    const email = document.getElementById("loginEmail").value;
    const pass = document.getElementById("loginPass").value;
    
    if(!email || !pass) return alert("Llena todos los campos");

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
            
            // Checar si había invitación pendiente
            const urlParams = new URLSearchParams(window.location.search);
            const salaInvitacion = urlParams.get('sala');
            if(salaInvitacion) unirseSalaDirecto(salaInvitacion);
            else cambiarPantalla("menu");

        } else {
            alert(data.error);
        }
    } catch (e) { console.error(e); alert("Error de conexión con el servidor"); }
}

// Lógica de Registro
async function registro() {
    const nickname = document.getElementById("regNickname").value;
    const email = document.getElementById("regEmail").value;
    const pass = document.getElementById("regPass").value;
    
    if(!nickname || !email || !pass) return alert("Llena todos los campos");

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
            alert(data.error);
        }
    } catch (e) { console.error(e); alert("Error de conexión"); }
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

// ==================== GESTIÓN DE SALAS (NUEVO) ====================

function crearSalaPropia() {
    const nombreSala = document.getElementById("inputCrearSala").value.trim();
    if(!nombreSala) return alert("Ponle nombre a tu sala");
    unirseSalaDirecto(nombreSala);
}

function unirseSalaExistente() {
    const nombreSala = document.getElementById("inputUnirseSala").value.trim();
    if(!nombreSala) return alert("Escribe el nombre de la sala");
    unirseSalaDirecto(nombreSala);
}

function unirseSalaDirecto(nombreSala) {
    salaActual = nombreSala;
    
    // Configurar Fondos según el nombre de la sala (tu lógica original)
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

    // Unirse al socket enviando EMAIL para persistencia
    socket.emit("unirse-sala", { 
        nickname: usuarioActual.nickname, 
        email: usuarioActual.email,
        sala: salaActual 
    });

    document.getElementById("tituloSalaActual").textContent = `Sala: ${salaActual}`;
    cambiarPantalla("sala");
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
        alert("¡Enlace copiado! Mándalo por WhatsApp: " + url);
    }
}

function aplicarFondo(elemento, imageUrl) {
    elemento.style.backgroundImage = `url("${imageUrl}")`;
    elemento.style.backgroundSize = 'cover';
    elemento.style.backgroundPosition = 'center';
}

// Botón "Salir" en la pantalla de sala de espera
btnSalirSala && btnSalirSala.addEventListener("click", () => {
  socket.emit("salir-sala", salaActual);
  resetearUI();
  cambiarPantalla("menu"); // Regresa al menú, no al splash
});

function salirDeSalaEnJuego() {
    if(confirm("¿Seguro que quieres salir?")) {
        socket.emit("salir-sala", salaActual);
        resetearUI();
        cambiarPantalla("menu");
    }
}

function resetearUI() {
  limpiarFichas();
  seleccionadas = [];
  juegoCartas.innerHTML = "";
  btnIniciar.style.display = "none";
  historial.innerHTML = "";
  haApostadoLocal = false;
  if (btnApostar) btnApostar.disabled = false;
  
  // Limpiar URL param para que no te vuelva a meter si recargas
  window.history.pushState({}, document.title, window.location.pathname);
}

// ==================== LÓGICA DEL JUEGO (SOCKETS) ====================

socket.on('connect', () => {
  miId = socket.id;
  // Intento de reconexión si se cayó el internet y volvió
  if(usuarioActual && salaActual) {
      socket.emit('reconectar', { sala: salaActual, email: usuarioActual.email });
  }
});

socket.on("rol-asignado", ({ host }) => {
  soyHost = host;
  // NOTA: Ya no cambiamos pantalla aquí automáticamente a selección.
  // El usuario decide cuándo dar clic en "Elegir Cartas" en la sala de espera.
  generarCartas();
  
  if (!soyHost) {
    ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "btnReiniciar"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  } else {
    // Si soy host, mostrar controles
    ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "btnReiniciar"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "block"; // o inline-block
    });
  }
});

// Evento nuevo: RECUPERAR ESTADO (cuando recargas o vuelves de whatsapp)
socket.on('estado-sala-restaurado', (estado) => {
    // Restaurar cartas seleccionadas
    if(estado.cartas && estado.cartas.length > 0) {
        seleccionadas = estado.cartas;
        // Regenerar tablero de juego
        juegoCartas.innerHTML = "";
        seleccionadas.forEach(id => {
            const contenedor = document.createElement("div");
            contenedor.classList.add("carta-juego");
            contenedor.dataset.id = id;
            contenedor.innerHTML = `<img src="assets/imagenes/cartas/${id}.jpg" class="carta-img seleccionada">`;
            contenedor.onclick = e => marcarFicha(e, contenedor);
            juegoCartas.appendChild(contenedor);
        });
        
        // Si el juego ya había empezado, mandarlo directo a la pantalla de juego
        if(estado.enJuego) {
            cambiarPantalla("juego");
        } else {
            // Si no ha empezado, dejarlo en sala o selección
             cambiarPantalla("sala"); 
        }
    }
    
    // Restaurar estado de apuesta
    haApostadoLocal = estado.apostado;
    if(btnApostar) btnApostar.disabled = haApostadoLocal;
    
    // Actualizar monedas visuales
    if(estado.monedas !== undefined) {
        usuarioActual.monedas = estado.monedas;
        configurarMenu();
        if(monedasEl) monedasEl.textContent = estado.monedas;
    }
});

socket.on("jugadores-actualizados", jugadores => {
  jugadoresGlobal = jugadores;
  
  // Buscar mis datos actualizados
  const misDatos = Object.values(jugadores).find(j => j.email === usuarioActual?.email);
  if (misDatos) {
    monedasEl.textContent = misDatos.monedas;
    haApostadoLocal = misDatos.apostado; 
    
    // Actualizar mi objeto local también para consistencia
    usuarioActual.monedas = misDatos.monedas;
    localStorage.setItem("loteria_usuario", JSON.stringify(usuarioActual));
    configurarMenu();
  }
  
  if (btnApostar) {
    btnApostar.disabled = haApostadoLocal;
  }
  
  const htmlLista = "<h3>Jugadores en sala:</h3>" +
    Object.values(jugadores).map(j => {
      const check = j.apostado ? "💸" : "";
      return `<div>${j.nickname} ${check}</div>`;
    }).join("");
    
  if(jugadoresLista) jugadoresLista.innerHTML = htmlLista;
  if(jugadoresListaIngame) jugadoresListaIngame.innerHTML = htmlLista;
});

socket.on('bote-actualizado', (bote) => {
  boteEl.textContent = bote;
});

// APUESTAS
btnApostar && btnApostar.addEventListener("click", () => {
  if (!salaActual) return alert("Únete a una sala primero.");
  if (haApostadoLocal) return alert("Ya apostaste esta ronda.");
  const cantidad = Math.max(1, seleccionadas.length || 1);
  socket.emit("apostar", { sala: salaActual, cantidad });
  haApostadoLocal = true;
  btnApostar.disabled = true;
});

socket.on("error-apuesta", msg => {
  alert(msg || "Error al apostar");
  haApostadoLocal = false;
  if (btnApostar) btnApostar.disabled = false;
});

// CARTAS Y JUEGO
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
  
  // 1. CASO: DESELECCIONAR (Si ya la tengo, la quito)
  if (seleccionadas.includes(id)) {
      // La borramos del array local
      seleccionadas = seleccionadas.filter(c => c !== id);
      // Le quitamos el borde verde visual
      img.classList.remove("seleccionada");
      // Le avisamos al servidor que la solté
      socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
      
      // Si bajo de 2 cartas, escondo el botón de iniciar
      if (seleccionadas.length < 2) btnIniciar.style.display = "none";
      return;
  }

  // 2. VALIDACIONES (Si la carta está ocupada por otro o bloqueada)
  if (img.style.pointerEvents === 'none') return; 
  
  // 3. CASO: SELECCIONAR (Si tengo espacio, la agrego)
  if (seleccionadas.length < 4) {
    img.classList.add("seleccionada");
    seleccionadas.push(id);
    socket.emit("seleccionar-carta", { carta: id, sala: salaActual });
    
    // Si ya tengo al menos 2, muestro el botón para arrancar
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
};

function marcarFicha(e, contenedor) {
  // 1. INTELIGENCIA: ¿A qué le dimos clic exactamenete?
  const elementoClickeado = e.target;

  // 2. CASO BORRAR: Si lo que tocamos YA TIENE la clase "ficha", lo borramos
  if (elementoClickeado.classList.contains("ficha")) {
      // Vibración de borrado
      if(navigator.vibrate) navigator.vibrate(10);
      elementoClickeado.remove();
      return; // ¡IMPORTANTE! Nos salimos aquí para que NO ponga otra ficha
  }

  // 3. CASO PONER: Si no era ficha, calculamos dónde poner la nueva
  const img = contenedor.querySelector("img.carta-img"); // Buscamos la imagen base de la carta
  
  // Protección por si algo falla al buscar la imagen
  if (!img) return;

  const bounds = img.getBoundingClientRect();
  const x = e.clientX - bounds.left;
  const y = e.clientY - bounds.top;
  
  // Convertimos a porcentajes para que se adapte a cualquier pantalla
  const px = (x / bounds.width) * 100;
  const py = (y / bounds.height) * 100;
  
  // Vibración de poner
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

// EVENTOS DE JUEGO (Host)
socket.on("barajear", () => {
  audioBarajear.currentTime = 0;
  audioBarajear.play().catch(e => console.warn("Audio bloqueado:", e));
  historial.innerHTML = "";
});

socket.on("campana", () => {
  audioCampana.currentTime = 0;
  audioCampana.play().catch(() => {});
});

socket.on("corre", () => {
  audioCorre.currentTime = 0;
  audioCorre.play().catch(() => {});
});

socket.on("partida-reiniciada", () => {
  // Solo reseteamos visuales de juego, no sacamos de la sala
  // seleccionadas = []; // Opcional: ¿Quieres que vuelvan a elegir cartas o se queden con las mismas?
  // Si quieres mantener las cartas, comenta la línea de arriba y la de abajo
  // juegoCartas.innerHTML = ""; 
  limpiarFichas();
  historial.innerHTML = "";
  // No cambiamos pantalla forzosamente, depende de la lógica deseada
});

socket.on("carta-cantada", (cartaId) => {
  const img = document.createElement("img");
  const formattedId = String(cartaId).padStart(2, '0');
  // Asegúrate que en assets/imagenes/barajas sean .png como en tu código original
  img.src = `assets/imagenes/barajas/${formattedId}.png`; 
  historial.prepend(img);
  historial.scrollLeft = 0;
  
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

// LOTERÍA Y MODAL
function emitirLoteria() {
  audioCorre.pause();
  audioCampana.pause();
  audioBarajear.pause();
  mostrarLoteriaMensaje();
  
  const boardState = {
    cards: seleccionadas,
    chips: {}
  };

  document.querySelectorAll('#juegoCartas .carta-juego').forEach(cardContainer => {
    const cardId = cardContainer.dataset.id;
    const cardChips = [];
    cardContainer.querySelectorAll('.ficha').forEach(ficha => {
      cardChips.push({
        left: ficha.style.left,
        top: ficha.style.top
      });
    });
    if (cardChips.length > 0) {
      boardState.chips[cardId] = cardChips;
    }
  });

  socket.emit("loteria", { nickname: usuarioActual.nickname, sala: salaActual, boardState });
}

function mostrarLoteriaMensaje() {
  loteriaMensaje.style.display = "block";
  if(navigator.vibrate) navigator.vibrate([200, 100, 200]); // Vibración de emoción
  
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
  setTimeout(() => {
    loteriaMensaje.style.display = "none";
  }, 4000);
}

socket.on("loteria-anunciada", (nicknameGanador, idGanador, boardState) => {
    if (soyHost) {
        ganadorTempId = idGanador;
        modalLoteriaTitulo.textContent = "¡Lotería anunciada!";
        modalLoteriaTexto.textContent = `${nicknameGanador} dice ¡LOTERÍA! Revisa su tabla:`;
        
        modalVerificationArea.innerHTML = ''; 

        if (boardState && boardState.cards) {
            boardState.cards.forEach(cardId => {
                const cardContainer = document.createElement('div');
                cardContainer.className = 'carta-juego';

                const cardImg = document.createElement('img');
                cardImg.src = `assets/imagenes/cartas/${cardId}.jpg`;
                cardImg.className = 'carta-img seleccionada';
                cardContainer.appendChild(cardImg);

                if (boardState.chips && boardState.chips[cardId]) {
                    boardState.chips[cardId].forEach(chipPos => {
                        const ficha = document.createElement("img");
                        ficha.src = "assets/imagenes/ui/ficha.PNG";
                        ficha.className = "ficha";
                        ficha.style.left = chipPos.left;
                        ficha.style.top = chipPos.top;
                        cardContainer.appendChild(ficha);
                    });
                }
                modalVerificationArea.appendChild(cardContainer);
            });
        }
        loteriaModal.classList.add("active");
    }
});

btnAceptarGanador.addEventListener("click", () => {
    if (ganadorTempId) {
        socket.emit("confirmar-ganador", { sala: salaActual, ganadorId: ganadorTempId, esValido: true });
        loteriaModal.classList.remove("active");
        modalVerificationArea.innerHTML = '';
        ganadorTempId = "";
    }
});

btnRechazarGanador.addEventListener("click", () => {
    if (ganadorTempId) {
        socket.emit("confirmar-ganador", { sala: salaActual, ganadorId: ganadorTempId, esValido: false });
        loteriaModal.classList.remove("active");
        modalVerificationArea.innerHTML = '';
        ganadorTempId = "";
    }
});

socket.on("ganador-confirmado", (ganadorId) => {
    if (jugadoresGlobal[ganadorId]) {
        alert(`🎉 ${jugadoresGlobal[ganadorId].nickname} ganó el bote!`);
        audioAplausos.play().catch(() => {});
        if(navigator.vibrate) navigator.vibrate([100,50,100,50,500]);
    }
    loteriaMensaje.style.display = "none";
});

socket.on("ganador-rechazado", (ganadorId) => {
    alert(`${jugadoresGlobal[ganadorId]?.nickname || "Jugador"} fue rechazado. ¡Sigue el juego!`);
    loteriaMensaje.style.display = "none";
});

socket.on("juego-detenido", () => {
    if (soyHost) {
        audioCorre.pause();
    }
});

function cambiarCartas() {
    // 1. Validar que no estemos a medio juego (para no arruinar la partida)
    // Usaremos una variable global o checamos si el botón 'btnDetenerJuego' está visible (significa que está corriendo)
    const btnDetener = document.getElementById("btnDetenerJuego");
    if(btnDetener && btnDetener.style.display !== "none" && soyHost) {
        if(!confirm("El juego está corriendo. ¿Seguro que quieres pausar y cambiar cartas?")) return;
        socket.emit("detener-juego", salaActual);
    }

    // 2. Liberar las cartas actuales en el servidor
    seleccionadas.forEach(id => {
        socket.emit("deseleccionar-carta", { carta: id, sala: salaActual });
    });

    // 3. Limpiar localmente
    seleccionadas = [];
    limpiarFichas();
    juegoCartas.innerHTML = "";
    
    // 4. Regresar a pantalla de selección
    btnIniciar.style.display = "none";
    
    // Forzamos actualización visual de cartas disponibles
    document.querySelectorAll("#contenedorCartas .carta-img").forEach(img => {
        img.classList.remove("seleccionada");
        // Quitamos opacidad temporalmente hasta que el server nos actualice
        img.style.opacity = 1; 
        img.style.pointerEvents = "auto";
    });

    cambiarPantalla("seleccion");
}