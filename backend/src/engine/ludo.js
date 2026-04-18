/**
 * Ludo game engine — pure, deterministic, server-authoritative.
 *
 * 2-player Ludo on a standard 52-square main track with 6-square home
 * stretches per player (5 regular home squares + the centre / "done" square).
 *
 * Progress encoding per token (0..58):
 *   0            = in base
 *   1..52        = on main track (abs pos = (entrySquare + progress - 1) mod 52)
 *   53..57       = home stretch squares 1..5
 *   58           = centre (token is "home"/done)
 *
 * Entry squares:
 *   Player 0 (red)  -> 0
 *   Player 1 (blue) -> 26
 *
 * Safe squares on main track (no captures): 0, 8, 13, 21, 26, 34, 39, 47
 *
 * Rules implemented:
 *   - Roll 6 to release a token from base (lands on entry square).
 *   - Rolling a 6 grants an extra turn.
 *   - Three 6s in a row = turn voided (no move made, next player's turn).
 *   - Capturing an opponent on a non-safe square sends it to base and grants
 *     an extra turn.
 *   - Reaching home (progress 58, exact) grants an extra turn.
 *   - Overshooting home is not allowed (move is illegal).
 *   - Own tokens cannot stack (a move that would land on an own token is
 *     illegal, except on base / centre).
 *   - First player to bring all 4 tokens home wins.
 *   - If no legal move exists after a roll, turn passes automatically.
 */

export const TRACK_LEN = 52;
export const TOTAL_PROGRESS = 58; // 52 main + 5 home + 1 centre
export const HOME_CENTRE = 58;
export const TOKENS_PER_PLAYER = 4;

export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const COLORS = ['red', 'blue'];
export const ENTRY_SQUARES = { red: 0, blue: 26 };

/** Absolute main-track position for a token, or null if not on main track. */
export function absPos(entrySquare, progress) {
  if (progress >= 1 && progress <= 52) {
    return (entrySquare + progress - 1) % TRACK_LEN;
  }
  return null;
}

/** Is this square a "globally safe" main-track square? */
export function isSafeSquare(absPosition) {
  return SAFE_SQUARES.has(absPosition);
}

/** Create a fresh game state for two players. */
export function createGame({ gameId, roomId, players, entryAmount = 0, rakePercent = 10, seed = null }) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error('Ludo requires exactly 2 players');
  }
  return {
    id: gameId,
    roomId,
    entryAmount,
    rakePercent,
    players: players.map((p, i) => ({
      userId: p.userId,
      username: p.username,
      color: COLORS[i],
      entrySquare: ENTRY_SQUARES[COLORS[i]],
      tokens: Array(TOKENS_PER_PLAYER).fill(0),
    })),
    turn: 0,
    lastRoll: null,
    consecutiveSixes: 0,
    awaitingMove: false,
    winner: null,
    finishedAt: null,
    history: [],
    rngSeed: seed,
    rngCounter: 0,
  };
}

// ─── RNG ─────────────────────────────────────────────────────────────────────
// Deterministic when `seed` is provided (used by tests). In production the
// server uses crypto randomness injected via the `rollFn` override.

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDice(state, override) {
  if (override != null) return override;
  if (state.rngSeed != null) {
    const rng = mulberry32(state.rngSeed + state.rngCounter);
    state.rngCounter += 1;
    return 1 + Math.floor(rng() * 6);
  }
  return 1 + Math.floor(Math.random() * 6);
}

// ─── Move validation ─────────────────────────────────────────────────────────

/**
 * List the legal token indices the current player can move with `roll`.
 * Returns an array of token indices (0..3).
 */
export function legalMoves(state, roll) {
  const player = state.players[state.turn];
  const legal = [];
  for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
    if (canMove(state, state.turn, i, roll)) legal.push(i);
  }
  return legal;
}

function canMove(state, playerIdx, tokenIdx, roll) {
  const player = state.players[playerIdx];
  const progress = player.tokens[tokenIdx];

  if (progress === HOME_CENTRE) return false; // already home

  // From base: must roll a 6.
  if (progress === 0) {
    if (roll !== 6) return false;
    // Must not land on own token (on entry square).
    const landing = player.entrySquare;
    if (ownTokenAt(state, playerIdx, 1, landing)) return false;
    return true;
  }

  const newProgress = progress + roll;
  if (newProgress > HOME_CENTRE) return false; // overshoot home

  // If landing on main track, check own-token stacking.
  if (newProgress <= 52) {
    const landingAbs = absPos(player.entrySquare, newProgress);
    if (ownTokenAtMainTrack(state, playerIdx, landingAbs) != null) return false;
  } else if (newProgress < HOME_CENTRE) {
    // Landing on own home stretch — own-stack not allowed.
    if (ownTokenAtProgress(state, playerIdx, newProgress)) return false;
  }
  return true;
}

function ownTokenAt(state, playerIdx, newProgress, _absLanding) {
  // convenience: check own token at given new progress
  return ownTokenAtProgress(state, playerIdx, newProgress);
}

function ownTokenAtProgress(state, playerIdx, progress) {
  const player = state.players[playerIdx];
  return player.tokens.some((p) => p === progress && p !== 0 && p !== HOME_CENTRE);
}

function ownTokenAtMainTrack(state, playerIdx, absLanding) {
  const player = state.players[playerIdx];
  for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
    const p = player.tokens[i];
    if (p >= 1 && p <= 52 && absPos(player.entrySquare, p) === absLanding) return i;
  }
  return null;
}

function opponentTokensAtMainTrack(state, playerIdx, absLanding) {
  const hits = [];
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIdx) continue;
    const p = state.players[pi];
    for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
      const prog = p.tokens[i];
      if (prog >= 1 && prog <= 52 && absPos(p.entrySquare, prog) === absLanding) {
        hits.push({ playerIdx: pi, tokenIdx: i });
      }
    }
  }
  return hits;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Apply a dice roll for the current player. Returns { roll, canMove, forced }.
 * If no legal move is available, turn advances automatically.
 */
export function applyRoll(state, { rollOverride } = {}) {
  if (state.winner != null) throw new Error('Game already finished');
  if (state.awaitingMove) throw new Error('Already rolled — move a token first');

  const roll = rollDice(state, rollOverride);
  state.lastRoll = roll;

  if (roll === 6) {
    state.consecutiveSixes += 1;
    if (state.consecutiveSixes >= 3) {
      // Triple-six rule: turn voided.
      state.history.push({ type: 'roll', player: state.turn, roll, voided: true });
      state.lastRoll = null;
      state.consecutiveSixes = 0;
      advanceTurn(state);
      return { roll, canMove: false, voided: true };
    }
  }

  const moves = legalMoves(state, roll);
  if (moves.length === 0) {
    state.history.push({ type: 'roll', player: state.turn, roll, noMove: true });
    state.lastRoll = null;
    if (roll !== 6) state.consecutiveSixes = 0;
    advanceTurn(state);
    return { roll, canMove: false };
  }

  state.awaitingMove = true;
  state.history.push({ type: 'roll', player: state.turn, roll });
  return { roll, canMove: true, legalTokens: moves };
}

/**
 * Move a token by the current dice roll. Returns details of the move
 * (captures, extraTurn, won).
 */
export function applyMove(state, { tokenIdx }) {
  if (state.winner != null) throw new Error('Game already finished');
  if (!state.awaitingMove || state.lastRoll == null) throw new Error('Roll first');

  const roll = state.lastRoll;
  const playerIdx = state.turn;
  if (!canMove(state, playerIdx, tokenIdx, roll)) throw new Error('Illegal move');

  const player = state.players[playerIdx];
  const prev = player.tokens[tokenIdx];

  let extraTurn = false;
  const captures = [];
  let newProgress;

  if (prev === 0) {
    // Release from base onto entry square.
    newProgress = 1;
  } else {
    newProgress = prev + roll;
  }
  player.tokens[tokenIdx] = newProgress;

  // Capture check — only on main track and not on safe square.
  if (newProgress >= 1 && newProgress <= 52) {
    const landingAbs = absPos(player.entrySquare, newProgress);
    if (!isSafeSquare(landingAbs)) {
      const hits = opponentTokensAtMainTrack(state, playerIdx, landingAbs);
      for (const h of hits) {
        state.players[h.playerIdx].tokens[h.tokenIdx] = 0;
        captures.push(h);
      }
      if (captures.length > 0) extraTurn = true;
    }
  }

  // Reached home centre -> extra turn.
  if (newProgress === HOME_CENTRE) extraTurn = true;

  // Rolled a 6 -> extra turn.
  if (roll === 6) extraTurn = true;

  // Win check.
  const allHome = player.tokens.every((p) => p === HOME_CENTRE);
  if (allHome) {
    state.winner = playerIdx;
    state.finishedAt = Date.now();
  }

  state.history.push({
    type: 'move',
    player: playerIdx,
    tokenIdx,
    from: prev,
    to: newProgress,
    roll,
    captures,
    extraTurn,
  });

  state.awaitingMove = false;
  state.lastRoll = null;

  if (state.winner != null) {
    return { from: prev, to: newProgress, captures, extraTurn, won: true };
  }

  if (extraTurn) {
    // Same player rolls again — consecutiveSixes already tracked in applyRoll.
    // For non-6 extra turns (capture / home), reset sixes.
    if (roll !== 6) state.consecutiveSixes = 0;
    return { from: prev, to: newProgress, captures, extraTurn, won: false };
  }

  state.consecutiveSixes = 0;
  advanceTurn(state);
  return { from: prev, to: newProgress, captures, extraTurn: false, won: false };
}

function advanceTurn(state) {
  state.turn = (state.turn + 1) % state.players.length;
  state.awaitingMove = false;
  state.lastRoll = null;
  state.consecutiveSixes = 0;
}

/** Public, serialisable snapshot of the game state (what clients see). */
export function snapshot(state) {
  return {
    id: state.id,
    roomId: state.roomId,
    entryAmount: state.entryAmount,
    players: state.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      color: p.color,
      entrySquare: p.entrySquare,
      tokens: [...p.tokens],
    })),
    turn: state.turn,
    lastRoll: state.lastRoll,
    consecutiveSixes: state.consecutiveSixes,
    awaitingMove: state.awaitingMove,
    winner: state.winner,
    finishedAt: state.finishedAt,
  };
}
