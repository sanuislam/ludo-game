import { nanoid } from 'nanoid';
import { db } from './db.js';
import { adjustBalance } from './wallet.js';
import {
  createGame,
  applyRoll,
  applyMove,
  legalMoves,
  snapshot,
} from './engine/ludo.js';

/**
 * Available room tiers — each represents an entry amount. Players pay the
 * entry amount from their wallet to join. Winner gets 2 × entry minus the
 * rake (configurable via RAKE_PERCENT env; default 10%).
 */
export const ROOM_TIERS = [10, 50, 100, 500, 1000];

const RAKE_PERCENT = Number(process.env.RAKE_PERCENT || 10);
const DISCONNECT_GRACE_MS = 30_000;

/** In-memory room/game store. */
const rooms = new Map(); // roomId -> Room
const games = new Map(); // gameId -> { state, roomId, turnTimer, disconnectTimers }
const userActiveGame = new Map(); // userId -> gameId

/**
 * Room lifecycle:
 *   status = 'waiting'  -> 1 player waiting for opponent
 *   status = 'playing'  -> game in progress
 */

function publicRoom(r) {
  return {
    id: r.id,
    tier: r.tier,
    status: r.status,
    players: r.players.map((p) => ({ userId: p.userId, username: p.username })),
    gameId: r.gameId,
    createdAt: r.createdAt,
  };
}

export function listLobby() {
  const byTier = {};
  for (const tier of ROOM_TIERS) {
    byTier[tier] = { tier, waiting: [], playing: 0 };
  }
  for (const r of rooms.values()) {
    if (r.status === 'waiting') byTier[r.tier].waiting.push(publicRoom(r));
    else if (r.status === 'playing') byTier[r.tier].playing += 1;
  }
  return ROOM_TIERS.map((t) => byTier[t]);
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

export function getGame(gameId) {
  return games.get(gameId);
}

export function getUserActiveGame(userId) {
  const gid = userActiveGame.get(userId);
  if (!gid) return null;
  return games.get(gid) || null;
}

/**
 * Join a tier: either join a waiting room or create a new one.
 * Deducts the entry amount from the player's wallet immediately (escrow).
 * Returns { room, started, game? }.
 */
export function joinTier({ tier, userId, username }) {
  if (!ROOM_TIERS.includes(tier)) throw new Error('invalid tier');
  if (userActiveGame.has(userId)) throw new Error('you are already in a game');

  // find oldest waiting room at this tier that the user is NOT already in
  let room = null;
  for (const r of rooms.values()) {
    if (r.tier === tier && r.status === 'waiting' && !r.players.some((p) => p.userId === userId)) {
      room = r;
      break;
    }
  }

  // Determine the room id up-front so the escrow tx can reference it even
  // when this player is the one creating a new room.
  const newRoomId = room ? null : nanoid(10);
  const refId = room?.id ?? newRoomId;

  // Escrow entry amount.
  adjustBalance({ userId, kind: 'room_entry', amount: -tier, ref: refId });

  if (!room) {
    room = {
      id: newRoomId,
      tier,
      status: 'waiting',
      players: [{ userId, username }],
      gameId: null,
      createdAt: Date.now(),
    };
    rooms.set(newRoomId, room);
    return { room, started: false };
  }

  // Second player — start the game.
  room.players.push({ userId, username });
  room.status = 'playing';

  const gameId = nanoid(10);
  const state = createGame({
    gameId,
    roomId: room.id,
    players: room.players,
    entryAmount: tier,
    rakePercent: RAKE_PERCENT,
  });
  room.gameId = gameId;

  db.prepare(
    'INSERT INTO games (id, room_id, entry_amount, player0_id, player1_id, started_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(gameId, room.id, tier, room.players[0].userId, room.players[1].userId, Date.now());

  games.set(gameId, {
    state,
    roomId: room.id,
    disconnectTimers: new Map(),
  });
  for (const p of room.players) userActiveGame.set(p.userId, gameId);

  return { room, started: true, game: state };
}

/** Leave a waiting room (before the game starts). Refunds the entry amount. */
export function leaveWaitingRoom({ roomId, userId }) {
  const r = rooms.get(roomId);
  if (!r) throw new Error('room not found');
  if (r.status !== 'waiting') throw new Error('cannot leave a room that is in play');
  const idx = r.players.findIndex((p) => p.userId === userId);
  if (idx < 0) throw new Error('not in this room');
  r.players.splice(idx, 1);
  adjustBalance({ userId, kind: 'room_refund', amount: r.tier, ref: r.id });
  if (r.players.length === 0) rooms.delete(r.id);
  return r;
}

/** Roll dice for the current player's turn. */
export function doRoll({ gameId, userId }) {
  const g = games.get(gameId);
  if (!g) throw new Error('game not found');
  const state = g.state;
  if (state.winner != null) throw new Error('game finished');
  const currentPlayer = state.players[state.turn];
  if (currentPlayer.userId !== userId) throw new Error('not your turn');
  if (state.awaitingMove) throw new Error('already rolled, make a move');
  const result = applyRoll(state);
  return result;
}

/** Move a token for the current player. */
export function doMove({ gameId, userId, tokenIdx }) {
  const g = games.get(gameId);
  if (!g) throw new Error('game not found');
  const state = g.state;
  if (state.winner != null) throw new Error('game finished');
  const currentPlayer = state.players[state.turn];
  if (currentPlayer.userId !== userId) throw new Error('not your turn');
  const result = applyMove(state, { tokenIdx });
  if (state.winner != null) finalizeGame(g);
  return result;
}

/**
 * Finalise a finished game — credit winner, record rake, persist final state.
 */
function finalizeGame(g) {
  const state = g.state;
  const pot = state.entryAmount * state.players.length;
  const rake = Math.floor((pot * state.rakePercent) / 100);
  const payout = pot - rake;
  const winnerIdx = state.winner;
  const winnerId = state.players[winnerIdx].userId;

  adjustBalance({
    userId: winnerId,
    kind: 'room_winnings',
    amount: payout,
    ref: state.id,
  });

  db.prepare(
    'UPDATE games SET winner_id = ?, rake = ?, payout = ?, finished_at = ?, history_json = ? WHERE id = ?',
  ).run(winnerId, rake, payout, state.finishedAt || Date.now(), JSON.stringify(state.history), state.id);

  for (const p of state.players) userActiveGame.delete(p.userId);

  // Remove room
  const r = rooms.get(g.roomId);
  if (r) rooms.delete(r.id);

  // Keep game in memory briefly for final snapshot fetch, then clear.
  setTimeout(() => games.delete(state.id), 60_000);

  g.finalized = { payout, rake, winnerId, winnerIdx };
}

/**
 * Called by socket layer when a player disconnects. Starts a grace timer;
 * if they don't reconnect, they forfeit the game.
 */
export function startDisconnectTimer({ gameId, userId, onForfeit }) {
  const g = games.get(gameId);
  if (!g) return;
  if (g.state.winner != null) return;
  const timer = setTimeout(() => {
    forfeitGame({ gameId, forfeitingUserId: userId, onForfeit });
  }, DISCONNECT_GRACE_MS);
  g.disconnectTimers.set(userId, timer);
}

export function cancelDisconnectTimer({ gameId, userId }) {
  const g = games.get(gameId);
  if (!g) return;
  const t = g.disconnectTimers.get(userId);
  if (t) {
    clearTimeout(t);
    g.disconnectTimers.delete(userId);
  }
}

function forfeitGame({ gameId, forfeitingUserId, onForfeit }) {
  const g = games.get(gameId);
  if (!g || g.state.winner != null) return;
  const loserIdx = g.state.players.findIndex((p) => p.userId === forfeitingUserId);
  if (loserIdx < 0) return;
  const winnerIdx = 1 - loserIdx;
  g.state.winner = winnerIdx;
  g.state.finishedAt = Date.now();
  g.state.history.push({ type: 'forfeit', player: loserIdx });
  finalizeGame(g);
  if (onForfeit) onForfeit({ game: g, winnerIdx, loserIdx });
}

export function gameSnapshot(g) {
  if (!g) return null;
  return {
    ...snapshot(g.state),
    legalMoves:
      g.state.awaitingMove && g.state.lastRoll != null
        ? legalMoves(g.state, g.state.lastRoll)
        : [],
    finalized: g.finalized || null,
  };
}
