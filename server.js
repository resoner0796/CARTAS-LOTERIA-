// server.js COMPLETO Y CORREGIDO

// ==================== CONFIG FIREBASE ====================
const admin = require('firebase-admin');
// Asegúrate de que tu variable de entorno 'nicknames' tenga el JSON correcto en Render
const serviceAccount = JSON.parse(process.env.nicknames); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ==================== CONFIG EXPRESS + SOCKET ====================
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' }
});

// --- LIBRERÍAS DE SEGURIDAD ---
const bcrypt = require('bcryptjs'); 
const cors = require('cors');

app.use(cors());
app.use(express.json()); 

const PORT = process.env.PORT || 3000;

// Estado del juego por sala
const salas = {};

// ==================== RUTAS DE API ====================

app.get('/', (req, res) => {
  res.send('Servidor de Lotería Pro Live ✅');
});

// 1. REGISTRO
app.post('/api/registro', async (req, res) => {
    const { email, password, nickname } = req.body;
    
    try {
        const userRef = db.collection('usuarios').doc(email);
        const doc = await userRef.get();

        if (doc.exists) {
            return res.status(400).json({ error: 'El correo ya está registrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await userRef.set({
            email,
            password: hashedPassword,
            nickname,
            monedas: 20, // Ajustado a 20 monedas iniciales
            creado: new Date()
        });

        res.json({ success: true, nickname, monedas: 20, email });
    } catch (error) {
        console.error("Error registro:", error);
        res.status(500).json({ error: 'Error en el servidor.' });
    }
});

// 2. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRef = db.collection('usuarios').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(400).json({ error: 'Usuario no encontrado.' });
        }

        const userData = doc.data();

        const validPassword = await bcrypt.compare(password, userData.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Contraseña incorrecta.' });
        }

        res.json({ 
            success: true, 
            nickname: userData.nickname, 
            monedas: userData.monedas, 
            email: userData.email 
        });

    } catch (error) {
        console.error("Error login:", error);
        res.status(500).json({ error: 'Error en el servidor.' });
    }
});

// ==================== FUNCIONES DE JUEGO ====================

function mezclarBaraja() {
  const cartas = Array.from({ length: 54 }, (_, i) => String(i + 1).padStart(2, '0'));
  return cartas.sort(() => Math.random() - 0.5);
}

function repartirCartas(sala) {
  const salaInfo = salas[sala];
  if (!salaInfo || !salaInfo.juegoIniciado) return;

  if (salaInfo.intervaloCartas) clearInterval(salaInfo.intervaloCartas);

  salaInfo.intervaloCartas = setInterval(() => {
    if (!salaInfo.juegoIniciado || salaInfo.baraja.length === 0) {
      clearInterval(salaInfo.intervaloCartas);
      salaInfo.intervaloCartas = null;
      return;
    }
    const carta = salaInfo.baraja.shift();
    salaInfo.historial.push(carta);
    io.to(sala).emit('carta-cantada', carta);
  }, 4000); 
}

async function actualizarSaldoUsuario(jugador) {
    try {
        if (jugador.email) {
            await db.collection('usuarios').doc(jugador.email).update({ monedas: jugador.monedas });
        } else {
            await db.collection('jugadores').doc(jugador.nickname).set({ monedas: jugador.monedas }, { merge: true });
        }
    } catch (error) {
        console.error("❌ Error al guardar saldo:", error);
    }
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('Nuevo socket conectado:', socket.id);

  // RECONEXIÓN
  socket.on('reconectar', ({ sala, email }) => {
      if (sala && salas[sala]) {
          const jugadorExistente = Object.values(salas[sala].jugadores).find(j => j.email === email);
          
          if (jugadorExistente) {
              socket.join(sala);
              const viejoSocketId = jugadorExistente.id;
              
              salas[sala].jugadores[socket.id] = jugadorExistente;
              salas[sala].jugadores[socket.id].id = socket.id; 
              
              if (viejoSocketId !== socket.id) {
                  delete salas[sala].jugadores[viejoSocketId];
              }
              
              socket.emit('estado-sala-restaurado', { 
                  enJuego: salas[sala].juegoIniciado,
                  cartas: jugadorExistente.cartas,
                  apostado: jugadorExistente.apostado,
                  monedas: jugadorExistente.monedas
              });
              
              io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
          }
      }
  });

  // UNIRSE A SALA
  socket.on('unirse-sala', async ({ nickname, email, sala }) => {
    socket.join(sala);

    if (!salas[sala]) {
      salas[sala] = {
        jugadores: {},
        baraja: [],
        historial: [],
        juegoIniciado: false,
        bote: 0,
        hostId: socket.id,
        intervaloCartas: null,
        loteriaPendiente: null,
        pagoRealizado: false
      };
      socket.emit('rol-asignado', { host: true });
    } else {
      socket.emit('rol-asignado', { host: false });
    }

    let monedasIniciales = 30;
    try {
        if(email) {
            const userDoc = await db.collection('usuarios').doc(email).get();
            if (userDoc.exists) monedasIniciales = userDoc.data().monedas;
        } else {
             const jugadorDoc = await db.collection('jugadores').doc(nickname).get();
             if (jugadorDoc.exists) monedasIniciales = jugadorDoc.data().monedas;
        }
    } catch (error) { console.error("Error cargando monedas DB", error); }

    salas[sala].jugadores[socket.id] = { 
      nickname, 
      email,
      monedas: monedasIniciales, 
      apostado: false, 
      cartas: [], 
      id: socket.id 
    };
    
    const cartasOcupadas = Object.values(salas[sala].jugadores).flatMap(j => j.cartas);
    io.to(sala).emit('cartas-desactivadas', cartasOcupadas);
    io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
    io.to(sala).emit('bote-actualizado', salas[sala].bote);
    io.to(sala).emit('historial-actualizado', salas[sala].historial);
  });

  socket.on('seleccionar-carta', ({ carta, sala }) => {
    const salaInfo = salas[sala];
    if (salaInfo && salaInfo.jugadores[socket.id]) {
      const jugador = salaInfo.jugadores[socket.id];
      if (jugador.cartas.length < 4 && !jugador.cartas.includes(carta)) {
        jugador.cartas.push(carta);
        const cartasOcupadas = Object.values(salaInfo.jugadores).flatMap(j => j.cartas);
        io.to(sala).emit('cartas-desactivadas', cartasOcupadas);
      }
    }
  });

  socket.on('apostar', async ({ sala, cantidad }) => {
    if (salas[sala] && salas[sala].jugadores[socket.id] && !salas[sala].jugadores[socket.id].apostado) {
      const jugador = salas[sala].jugadores[socket.id];
      if (jugador.monedas >= cantidad) {
        jugador.monedas -= cantidad;
        salas[sala].bote += cantidad;
        jugador.apostado = true;

        io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
        io.to(sala).emit('bote-actualizado', salas[sala].bote);
        await actualizarSaldoUsuario(jugador);
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
        salas[sala].loteriaPendiente = null;
        salas[sala].pagoRealizado = false;
        
        io.to(sala).emit('juego-iniciado');
        io.to(sala).emit('campana'); 

        setTimeout(() => {
            if(salas[sala] && salas[sala].juegoIniciado) {
               io.to(sala).emit('corre');
            }
        }, 2000);

        setTimeout(() => {
            if(salas[sala] && salas[sala].juegoIniciado) {
               repartirCartas(sala);
            }
        }, 5000); 
      }
    }
  });

  socket.on('detener-juego', (sala) => {
    if (salas[sala] && socket.id === salas[sala].hostId) {
      salas[sala].juegoIniciado = false;
      if (salas[sala].intervaloCartas) clearInterval(salas[sala].intervaloCartas);
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
      salas[sala].loteriaPendiente = null;
      salas[sala].pagoRealizado = false;
      if (salas[sala].intervaloCartas) clearInterval(salas[sala].intervaloCartas);
      for (const id in salas[sala].jugadores) {
        salas[sala].jugadores[id].apostado = false;
        salas[sala].jugadores[id].cartas = [];
      }
      io.to(sala).emit('partida-reiniciada');
      io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
      io.to(sala).emit('bote-actualizado', 0);
    }
  });

  socket.on('loteria', ({ nickname, sala, boardState }) => {
    if (salas[sala] && salas[sala].juegoIniciado) {
      salas[sala].juegoIniciado = false;
      if (salas[sala].intervaloCartas) clearInterval(salas[sala].intervaloCartas);

      salas[sala].loteriaPendiente = {
        ganadorId: socket.id,
        nickname,
        boardState,
        timestamp: Date.now()
      };
      salas[sala].pagoRealizado = false;
      io.to(salas[sala].hostId).emit('loteria-anunciada', nickname, socket.id, boardState);
    }
  });
  
  socket.on('confirmar-ganador', async ({ sala, ganadorId, esValido }) => {
    const salaInfo = salas[sala];
    if (!salaInfo || socket.id !== salaInfo.hostId || !salaInfo.loteriaPendiente || salaInfo.pagoRealizado) return;
    
    const ganador = salaInfo.jugadores[ganadorId];
    if (!ganador) return;
    
    if (esValido === false) {
      io.to(sala).emit('ganador-rechazado', ganadorId);
      salaInfo.loteriaPendiente = null;
      salaInfo.juegoIniciado = true;
      repartirCartas(sala); 
      return; 
    }
    
    const boteActual = Number(salaInfo.bote) || 0;
    if (boteActual > 0) {
      ganador.monedas += boteActual;
      salaInfo.bote = 0;
      salaInfo.pagoRealizado = true;
      await actualizarSaldoUsuario(ganador);
    }
    
    for (const id in salaInfo.jugadores) salaInfo.jugadores[id].apostado = false;
    
    salaInfo.loteriaPendiente = null;
    salaInfo.juegoIniciado = false;
    if (salaInfo.intervaloCartas) {
      clearInterval(salaInfo.intervaloCartas);
      salaInfo.intervaloCartas = null;
    }
    
    io.to(sala).emit('ganador-confirmado', ganadorId);
    io.to(sala).emit('jugadores-actualizados', salaInfo.jugadores);
    io.to(sala).emit('bote-actualizado', salaInfo.bote);
  });

  socket.on('salir-sala', (sala) => {
    if (salas[sala] && salas[sala].jugadores[socket.id]) {
      socket.leave(sala);
      delete salas[sala].jugadores[socket.id];
      io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
      
      if (Object.keys(salas[sala].jugadores).length === 0) {
        if (salas[sala].intervaloCartas) clearInterval(salas[sala].intervaloCartas);
        delete salas[sala];
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Jugador desconectado:', socket.id);
    setTimeout(() => {
        for (const sala in salas) {
            if (salas[sala].jugadores[socket.id]) {
                const jugadorSaliente = salas[sala].jugadores[socket.id];
                const eraHost = (salas[sala].hostId === socket.id);

                delete salas[sala].jugadores[socket.id];

                if (Object.keys(salas[sala].jugadores).length === 0) {
                    if (salas[sala].intervaloCartas) clearInterval(salas[sala].intervaloCartas);
                    delete salas[sala];
                } else {
                    if (eraHost) {
                        const ids = Object.keys(salas[sala].jugadores);
                        if (ids.length > 0) {
                            salas[sala].hostId = ids[0];
                            io.to(ids[0]).emit('rol-asignado', { host: true });
                        }
                    }
                    io.to(sala).emit('jugadores-actualizados', salas[sala].jugadores);
                }
            }
        }
    }, 10000); 
  });
});

http.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
