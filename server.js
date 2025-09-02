const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

let salas = {}; // Objeto para gestionar las salas

app.get("/", (req, res) => {
  res.send("Servidor de Lotería funcionando.");
});

io.on("connection", socket => {
  console.log("Nuevo jugador conectado:", socket.id);

  socket.on("unirse-sala", ({ nickname, sala }) => {
    // Si la sala no existe, la creamos
    if (!salas[sala]) {
      salas[sala] = {
        jugadores: {},
        hostId: socket.id,
        baraja: [],
        historial: [],
        juegoIniciado: false,
      };
      console.log(`Sala ${sala} creada por ${nickname} (Host)`);
    }

    // Unir al jugador a la sala
    socket.join(sala);
    const esHost = (salas[sala].hostId === socket.id);

    // Guardar los datos del jugador
    salas[sala].jugadores[socket.id] = {
      nickname: nickname,
      id: socket.id,
      cartasSeleccionadas: [],
      fichas: [],
    };

    // Notificar al jugador de su rol
    socket.emit("rol-asignado", { host: esHost });

    // Notificar a todos los jugadores de la sala de la lista actualizada
    io.to(sala).emit("jugadores-actualizados", salas[sala].jugadores);
    console.log(`Jugador ${nickname} se unió a la sala ${sala}. Es host: ${esHost}`);
  });

  socket.on("seleccionar-carta", ({ carta, sala }) => {
    if (salas[sala] && salas[sala].jugadores[socket.id]) {
      const jugador = salas[sala].jugadores[socket.id];
      if (!jugador.cartasSeleccionadas.includes(carta)) {
        jugador.cartasSeleccionadas.push(carta);
      }
    }
  });

  socket.on("barajear", (sala) => {
    if (salas[sala] && salas[sala].hostId === socket.id) {
      salas[sala].baraja = mezclarBaraja();
      salas[sala].historial = [];
      io.to(sala).emit("barajear");
      io.to(sala).emit("historial-actualizado", salas[sala].historial);
    }
  });

  socket.on("iniciar-juego", (sala) => {
    if (salas[sala] && salas[sala].hostId === socket.id && !salas[sala].juegoIniciado) {
      salas[sala].juegoIniciado = true;
      io.to(sala).emit("juego-iniciado");
      repartirCartas(sala);
    }
  });

  socket.on("detener-juego", (sala) => {
    if (salas[sala] && salas[sala].hostId === socket.id) {
      salas[sala].juegoIniciado = false;
      io.to(sala).emit("juego-detenido");
    }
  });

  socket.on("reiniciar-partida", (sala) => {
    if (salas[sala] && salas[sala].hostId === socket.id) {
      salas[sala].juegoIniciado = false;
      salas[sala].historial = [];
      salas[sala].baraja = [];
      io.to(sala).emit("partida-reiniciada");
      console.log(`Partida en sala ${sala} reiniciada por el host.`);
    }
  });

  socket.on("loteria", ({ nickname, sala, fichas, cartas }) => {
    const salaObj = salas[sala];
    if (salaObj) {
      const hostSocketId = salaObj.hostId;
      // Guardamos las fichas y cartas en el objeto del jugador en la sala
      salaObj.jugadores[socket.id].fichas = fichas;
      salaObj.jugadores[socket.id].cartasSeleccionadas = cartas;

      // Pausar el juego para todos en la sala
      salaObj.juegoIniciado = false;
      io.to(sala).emit("juego-detenido");

      // Enviar los datos del ganador al host, tomando la información del objeto del jugador
      io.to(hostSocketId).emit("loteria-anunciada", {
        quien: nickname,
        ganadorId: socket.id,
        cartasGanador: salaObj.jugadores[socket.id].cartasSeleccionadas,
        fichasGanador: salaObj.jugadores[socket.id].fichas,
      });

      // Notificar a todos los demás (excepto al que cantó)
      socket.to(sala).emit("mensaje", `🎉 ${nickname} cantó ¡Lotería!`);
    }
  });

  socket.on("confirmar-ganador", ({ sala, ganadorId }) => {
      const salaObj = salas[sala];
      if (salaObj && salaObj.hostId === socket.id) {
          io.to(sala).emit("ganador-confirmado");
          // Aquí iría la lógica para transferir monedas, etc.
      }
  });

  socket.on("rechazar-ganador", ({ sala, perdedorId }) => {
      const salaObj = salas[sala];
      if (salaObj && salaObj.hostId === socket.id) {
          salaObj.juegoIniciado = true; // Continuar el juego
          io.to(sala).emit("ganador-rechazado");
      }
  });

  socket.on("disconnecting", () => {
    const salasDelJugador = Object.keys(socket.rooms);
    salasDelJugador.forEach(sala => {
      if (sala !== socket.id && salas[sala]) { // Evitar la sala de su propio ID
        const salaObj = salas[sala];
        delete salaObj.jugadores[socket.id];

        // Reasignar el host si el actual se desconecta
        if (salaObj.hostId === socket.id) {
          const nuevosJugadores = Object.keys(salaObj.jugadores);
          if (nuevosJugadores.length > 0) {
            const nuevoHostId = nuevosJugadores[0];
            salaObj.hostId = nuevoHostId;
            io.to(nuevoHostId).emit("rol-asignado", { host: true });
            console.log(`Nuevo host asignado a sala ${sala}: ${salaObj.jugadores[nuevoHostId].nickname}`);
          } else {
            // Si no hay más jugadores, borrar la sala
            delete salas[sala];
            console.log(`Sala ${sala} eliminada.`);
          }
        }
        io.to(sala).emit("jugadores-actualizados", Object.values(salaObj.jugadores));
      }
    });
    console.log("Jugador desconectado:", socket.id);
  });
});

function mezclarBaraja() {
  const cartas = Array.from({ length: 54 }, (_, i) => String(i + 1).padStart(2, "0"));
  return cartas.sort(() => Math.random() - 0.5);
}

function repartirCartas(sala) {
  const salaObj = salas[sala];
  if (!salaObj || !salaObj.juegoIniciado || salaObj.baraja.length === 0) return;

  let index = 0;
  const intervalo = setInterval(() => {
    if (!salaObj.juegoIniciado || index >= salaObj.baraja.length) {
      clearInterval(intervalo);
      return;
    }
    const carta = salaObj.baraja[index++];
    salaObj.historial.push(carta);
    io.to(sala).emit("historial-actualizado", salaObj.historial);
    io.to(sala).emit("carta-cantada", carta);
  }, 4000);
}

http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});