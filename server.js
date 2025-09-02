const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 3000;

// Estado del juego por sala
const salas = {};

app.get('/', (req, res) => {
  res.send('Servidor de Lotería funcionando.');
});

io.on('connection', (socket) => {
  console.log('Nuevo jugador conectado:', socket.id);

  socket.on('unirse-sala', ({ nickname, sala }) => {
    socket.join(sala);
    if (!salas[sala]) {
      salas[sala] = {
        jugadores: {},
        baraja: [],
        historial: [],
        juegoIniciado: false,
        bote: 0,
        hostId: socket.id,
      };
      console.log(`Sala '${sala}' creada por ${nickname} (${socket.id})`);
      socket.emit('rol-asignado', { host: true });
    } else {
      socket.emit('rol-asignado', { host: false });
    }
    salas[sala].jugadores[socket.id] = { nickname, monedas: 30, apostado: false, cartas: [], id: socket.id };
    console.log(`${nickname} se ha unido a la sala '${sala}'`);

    io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
    io.to(sala).emit('bote-actualizado', salas[sala].bote);
    io.to(sala).emit('historial-actualizado', salas[sala].historial);
  });

  socket.on('seleccionar-carta', ({ carta, sala }) => {
    if (salas[sala] && salas[sala].jugadores[socket.id]) {
      const jugador = salas[sala].jugadores[socket.id];
      if (jugador.cartas.length < 4) {
        jugador.cartas.push(carta);
      }
    }
  });

  socket.on('apostar', ({ sala, cantidad }) => {
    if (salas[sala] && salas[sala].jugadores[socket.id] && !salas[sala].jugadores[socket.id].apostado) {
      const jugador = salas[sala].jugadores[socket.id];
      if (jugador.monedas >= cantidad) {
        jugador.monedas -= cantidad;
        salas[sala].bote += cantidad;
        jugador.apostado = true;
        io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
        io.to(sala).emit('monedas-actualizado', jugador.monedas);
        io.to(sala).emit('bote-actualizado', salas[sala].bote);
      } else {
        socket.emit('error-apuesta', 'No tienes suficientes monedas.');
      }
    }
  });

  socket.on('iniciar-juego', (sala) => {
    if (salas[sala] && socket.id === salas[sala].hostId) {
      if (!salas[sala].juegoIniciado) {
        salas[sala].baraja = mezclarBaraja();
        salas[sala].historial = [];
        salas[sala].juegoIniciado = true;
        io.to(sala).emit('juego-iniciado');
        repartirCartas(sala);
      }
    }
  });

  socket.on('detener-juego', (sala) => {
    if (salas[sala] && socket.id === salas[sala].hostId) {
      salas[sala].juegoIniciado = false;
      io.to(sala).emit('juego-detenido');
    }
  });

  socket.on('barajear', (sala) => {
    if (salas[sala] && socket.id === salas[sala].hostId) {
      salas[sala].baraja = mezclarBaraja();
      salas[sala].historial = [];
      io.to(sala).emit('barajear');
    }
  });

  socket.on('reiniciar-partida', (sala) => {
    if (salas[sala] && socket.id === salas[sala].hostId) {
      salas[sala].juegoIniciado = false;
      salas[sala].historial = [];
      salas[sala].bote = 0;
      for (const id in salas[sala].jugadores) {
        salas[sala].jugadores[id].apostado = false;
        salas[sala].jugadores[id].cartas = [];
      }
      io.to(sala).emit('partida-reiniciada');
      io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
      io.to(sala).emit('bote-actualizado', 0);
    }
  });

  socket.on('loteria', ({ nickname, sala }) => {
    if (salas[sala] && salas[sala].juegoIniciado) {
      salas[sala].juegoIniciado = false;
      io.to(salas[sala].hostId).emit('loteria-anunciada', nickname, socket.id);
    }
  });

  // Lógica corregida para la confirmación del ganador
  socket.on('confirmar-ganador', ({ sala, ganadorId, esValido }) => {
    if (salas[sala] && socket.id === salas[sala].hostId) {
      if (esValido) {
        const ganador = salas[sala].jugadores[ganadorId];
        if (ganador) {
          ganador.monedas += salas[sala].bote;
          salas[sala].bote = 0;
          io.to(sala).emit('ganador-confirmado', ganadorId);
          io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
          io.to(sala).emit('bote-actualizado', 0);
        }
      } else {
        io.to(sala).emit('ganador-rechazado', ganadorId);
        // El juego continúa si se rechaza
        salas[sala].juegoIniciado = true; 
        repartirCartas(sala); // Reanuda el juego
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Jugador desconectado:', socket.id);
    for (const sala in salas) {
      if (salas[sala].jugadores[socket.id]) {
        const nickname = salas[sala].jugadores[socket.id].nickname;
        delete salas[sala].jugadores[socket.id];
        console.log(`${nickname} ha dejado la sala '${sala}'`);
        io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
        if (Object.keys(salas[sala].jugadores).length === 0) {
          delete salas[sala];
          console.log(`Sala '${sala}' eliminada.`);
        }
      }
    }
  });
});

function mezclarBaraja() {
  const cartas = Array.from({ length: 54 }, (_, i) => String(i + 1).padStart(2, '0'));
  return cartas.sort(() => Math.random() - 0.5);
}

function repartirCartas(sala) {
  let index = 0;
  const salaInfo = salas[sala];
  if (!salaInfo || !salaInfo.juegoIniciado) return;

  const intervalo = setInterval(() => {
    if (!salaInfo.juegoIniciado || index >= salaInfo.baraja.length) {
      clearInterval(intervalo);
      return;
    }
    const carta = salaInfo.baraja[index++];
    salaInfo.historial.push(carta);
    io.to(sala).emit('carta-cantada', carta);
    io.to(sala).emit('historial-actualizado', salaInfo.historial);
  }, 4000);
}

http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});