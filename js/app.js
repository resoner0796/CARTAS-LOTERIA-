// js/app.js

let jugadoresGlobal = {};
let miId;
// Conexión al socket (sin cambios)
const socket = io("https://loteria-backend-3nde.onrender.com");

let nickname = "";
let soyHost = false;
let seleccionadas = [];
let salaActual = "";
const cartasDisponibles = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));

const pantallas = {
  splash: document.getElementById("pantallaSplash"),
  sala: document.getElementById("pantallaSala"),
  nickname: document.getElementById("pantallaNickname"),
  seleccion: document.getElementById("pantallaSeleccion"),
  juego: document.getElementById("pantallaJuego")
};

const contenedorCartas = document.getElementById("contenedorCartas");
const juegoCartas = document.getElementById("juegoCartas");
const btnIniciar = document.getElementById("btnIniciar");
const historial = document.getElementById("historial");
const jugadoresLista = document.getElementById("jugadoresLista");
 
const btnSalirSala = document.getElementById("btnSalirSala");

const btnApostar = document.getElementById("btnApostar");
const monedasEl = document.getElementById("monedas-valor");
const boteEl = document.getElementById("bote-valor");
let haApostadoLocal = false;

const loteriaModal = document.getElementById("loteriaModal");
const modalLoteriaTitulo = document.getElementById("modalLoteriaTitulo");
const modalLoteriaTexto = document.getElementById("modalLoteriaTexto");
const btnAceptarGanador = document.getElementById("btnAceptarGanador");
const btnRechazarGanador = document.getElementById("btnRechazarGanador");
const modalVerificationArea = document.getElementById("modalVerificationArea");
let ganadorTempId = "";

btnApostar && btnApostar.addEventListener("click", () => {
  if (!salaActual) return alert("Únete a una sala primero.");
  if (haApostadoLocal) return alert("Ya apostaste esta ronda.");
  const cantidad = Math.max(1, seleccionadas.length || 1);
  socket.emit("apostar", { sala: salaActual, cantidad });
  haApostadoLocal = true;
  btnApostar.disabled = true;
});

btnSalirSala && btnSalirSala.addEventListener("click", () => {
  socket.emit("salir-sala", salaActual);
  limpiarFichas();
  seleccionadas = [];
  juegoCartas.innerHTML = "";
  btnIniciar.style.display = "none";
  historial.innerHTML = "";
  haApostadoLocal = false;
  if (btnApostar) btnApostar.disabled = false;
  cambiarPantalla("sala");
});
 
socket.on("error-apuesta", msg => {
  alert(msg || "Error al apostar");
  haApostadoLocal = false;
  if (btnApostar) btnApostar.disabled = false;
});

const audioBarajear = document.getElementById("audioBarajear");
const audioCampana = document.getElementById("audioCampana");
const audioCorre = document.getElementById("audioCorre");
const audioAplausos = document.getElementById("audioAplausos");

const loteriaMensaje = document.getElementById("loteriaMensaje");

window.onload = () => setTimeout(() => cambiarPantalla("sala"), 1000);

function cambiarPantalla(nombre) {
  Object.values(pantallas).forEach(p => p.classList.remove("activa"));
  pantallas[nombre].classList.add("activa");
  if (nombre === "seleccion") pantallas["seleccion"].scrollTo(0, 0);
}

function aplicarFondo(elemento, imageUrl) {
    elemento.style.backgroundImage = `url("${imageUrl}")`;
    elemento.style.backgroundSize = 'cover';
    elemento.style.backgroundPosition = 'center';
}

function irANickname() {
    salaActual = document.getElementById("salaSelect").value;
    // NOTA: Si tienes fondos específicos por familia/oficina, 
    // asegúrate de tenerlos en assets/imagenes/ui/
    // Aquí actualizamos la ruta base para que busque en la carpeta correcta
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
    cambiarPantalla("nickname");
}

function entrarJuego() {
  nickname = document.getElementById("nicknameInput").value.trim();
  if (!nickname) return alert("Escribe tu nombre");
  socket.emit("unirse-sala", { nickname, sala: salaActual });
}

socket.on('connect', () => {
  miId = socket.id;
});

socket.on("rol-asignado", ({ host }) => {
  soyHost = host;
  cambiarPantalla("seleccion");
  generarCartas();
  if (!soyHost) {
    ["btnBarajear", "btnIniciarJuego", "btnDetenerJuego", "btnReiniciar"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }
});

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
  seleccionadas = [];
  juegoCartas.innerHTML = "";
  btnIniciar.style.display = "none";
  cambiarPantalla("seleccion");
  generarCartas();
  limpiarFichas();
  historial.innerHTML = "";
});

function generarCartas() {
  contenedorCartas.innerHTML = "";
  cartasDisponibles.forEach(id => {
    const img = document.createElement("img");
    // RUTA ACTUALIZADA: Carpeta de Cartas
    img.src = `assets/imagenes/cartas/${id}.jpg`;
    img.classList.add("carta-img");
    img.dataset.id = id;
    img.onclick = () => seleccionarCarta(img);
    contenedorCartas.appendChild(img);
  });
}

function seleccionarCarta(img) {
  const id = img.dataset.id;
  if (seleccionadas.includes(id)) return;
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
    // RUTA ACTUALIZADA: Carpeta de Cartas
    contenedor.innerHTML = `<img src="assets/imagenes/cartas/${id}.jpg" class="carta-img seleccionada">`;
    contenedor.onclick = e => marcarFicha(e, contenedor);
    juegoCartas.appendChild(contenedor);
  });
};

function marcarFicha(e, contenedor) {
  const img = contenedor.querySelector("img");
  const bounds = img.getBoundingClientRect();
  const x = e.clientX - bounds.left;
  const y = e.clientY - bounds.top;
  const px = (x / bounds.width) * 100;
  const py = (y / bounds.height) * 100;
  const ficha = document.createElement("img");
  
  // RUTA ACTUALIZADA: Carpeta UI
  ficha.src = "assets/imagenes/ui/ficha.PNG";
  
  ficha.classList.add("ficha");
  ficha.style.left = `${px}%`;
  ficha.style.top = `${py}%`;
  contenedor.appendChild(ficha);
}

function limpiarFichas() {
  document.querySelectorAll(".ficha").forEach(f => f.remove());
}

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

  socket.emit("loteria", { nickname, sala: salaActual, boardState });
}

function mostrarLoteriaMensaje() {
  loteriaMensaje.style.display = "block";
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

socket.on("jugadores-actualizados", jugadores => {
  jugadoresGlobal = jugadores;
  if (jugadores[miId]) {
    monedasEl.textContent = jugadores[miId].monedas;
    haApostadoLocal = jugadores[miId].apostado; 
  }
  if (btnApostar) {
    btnApostar.disabled = haApostadoLocal;
  }
  jugadoresLista.innerHTML = "<h3>Jugadores conectados:</h3>" +
    Object.values(jugadores).map(j => {
      const check = j.apostado ? "💸" : "";
      return `<div>${j.nickname} ${check}</div>`;
    }).join("");
});
 
socket.on('monedas-actualizado', (monedas) => {
    if (monedasEl) {
        monedasEl.textContent = monedas;
    }
});    
 
socket.on('bote-actualizado', (bote) => {
  boteEl.textContent = bote;
});

socket.on("carta-cantada", (cartaId) => {
  const img = document.createElement("img");
  const formattedId = String(cartaId).padStart(2, '0');
  img.src = `assets/imagenes/barajas/${formattedId}.png`;
  historial.prepend(img);
  historial.scrollLeft = 0;
  
  // RUTA ACTUALIZADA: Carpeta Audios
  const audioVoz = new Audio(`assets/audios/${formattedId}.mp3`);
  audioVoz.play();
});

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
                // RUTA ACTUALIZADA: Carpeta Cartas
                cardImg.src = `assets/imagenes/cartas/${cardId}.jpg`;
                cardImg.className = 'carta-img seleccionada';
                cardContainer.appendChild(cardImg);

                if (boardState.chips && boardState.chips[cardId]) {
                    boardState.chips[cardId].forEach(chipPos => {
                        const ficha = document.createElement("img");
                        // RUTA ACTUALIZADA: Carpeta UI
                        ficha.src = "assets/imagenes/ui/ficha.PNG";
                        ficha.className = "ficha";
                        ficha.style.left = chipPos.left;
                        ficha.style.top = chipPos.top;
                        cardContainer.appendChild(ficha);
                    });
                }
                modalVerificationArea.appendChild(cardContainer);
            });
        } else {
            modalVerificationArea.textContent = 'No se pudo cargar la tabla del jugador.';
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