import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import {
  joinTier,
  leaveWaitingRoom,
  doRoll,
  doMove,
  listLobby,
  getGame,
  getUserActiveGame,
  startDisconnectTimer,
  cancelDisconnectTimer,
  gameSnapshot,
} from './rooms.js';

export function attachSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthenticated'));
    const user = verifyToken(token);
    if (!user) return next(new Error('invalid token'));
    socket.data.user = user;
    next();
  });

  function emitLobby() {
    io.emit('lobby:update', listLobby());
  }

  function emitGameState(gameId) {
    const g = getGame(gameId);
    if (!g) return;
    io.to(`game:${gameId}`).emit('game:state', gameSnapshot(g));
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);

    // Send initial lobby state.
    socket.emit('lobby:update', listLobby());

    // If user was in an active game, resume it.
    const active = getUserActiveGame(user.id);
    if (active) {
      socket.join(`game:${active.state.id}`);
      socket.emit('game:state', gameSnapshot(active));
      cancelDisconnectTimer({ gameId: active.state.id, userId: user.id });
    }

    socket.on('lobby:list', (ack) => {
      if (typeof ack === 'function') ack({ ok: true, tiers: listLobby() });
    });

    socket.on('room:join', ({ tier } = {}, ack) => {
      try {
        const result = joinTier({ tier, userId: user.id, username: user.username });
        socket.join(`room:${result.room.id}`);
        if (result.started) {
          socket.join(`game:${result.game.id}`);
          // Notify the other player (already in room:<id>) to join the game channel.
          io.to(`room:${result.room.id}`).emit('room:started', {
            roomId: result.room.id,
            gameId: result.game.id,
          });
          // Everyone on both user:* channels should subscribe to the game channel.
          for (const p of result.game.players) {
            for (const s of io.sockets.sockets.values()) {
              if (s.data.user?.id === p.userId) {
                s.join(`game:${result.game.id}`);
              }
            }
          }
          emitGameState(result.game.id);
        } else {
          socket.emit('room:joined', { room: result.room });
        }
        emitLobby();
        if (typeof ack === 'function') ack({ ok: true, room: result.room, started: result.started });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
        socket.emit('error:msg', { error: e.message });
      }
    });

    socket.on('room:leave', ({ roomId } = {}, ack) => {
      try {
        leaveWaitingRoom({ roomId, userId: user.id });
        socket.leave(`room:${roomId}`);
        emitLobby();
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    socket.on('game:roll', ({ gameId } = {}, ack) => {
      try {
        const result = doRoll({ gameId, userId: user.id });
        emitGameState(gameId);
        if (typeof ack === 'function') ack({ ok: true, result });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    socket.on('game:move', ({ gameId, tokenIdx } = {}, ack) => {
      try {
        const result = doMove({ gameId, userId: user.id, tokenIdx });
        emitGameState(gameId);
        if (result.won) {
          io.to(`game:${gameId}`).emit('game:over', gameSnapshot(getGame(gameId)));
          emitLobby();
        }
        if (typeof ack === 'function') ack({ ok: true, result });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    socket.on('disconnect', () => {
      const active = getUserActiveGame(user.id);
      if (active && active.state.winner == null) {
        startDisconnectTimer({
          gameId: active.state.id,
          userId: user.id,
          onForfeit: () => {
            io.to(`game:${active.state.id}`).emit('game:over', gameSnapshot(getGame(active.state.id)));
            emitLobby();
          },
        });
      }
    });
  });

  return io;
}
