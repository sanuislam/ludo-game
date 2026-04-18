import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyRoll,
  applyMove,
  absPos,
  isSafeSquare,
  HOME_CENTRE,
  TRACK_LEN,
} from './ludo.js';

function newGame(seed = 1) {
  return createGame({
    gameId: 'g1',
    roomId: 'r1',
    players: [
      { userId: 'u1', username: 'alice' },
      { userId: 'u2', username: 'bob' },
    ],
    seed,
  });
}

test('createGame produces valid initial state', () => {
  const g = newGame();
  assert.equal(g.players.length, 2);
  assert.equal(g.players[0].color, 'red');
  assert.equal(g.players[1].color, 'blue');
  assert.equal(g.players[0].entrySquare, 0);
  assert.equal(g.players[1].entrySquare, 26);
  assert.deepEqual(g.players[0].tokens, [0, 0, 0, 0]);
  assert.equal(g.turn, 0);
  assert.equal(g.winner, null);
});

test('absPos loops correctly around the board', () => {
  assert.equal(absPos(0, 1), 0);
  assert.equal(absPos(0, 52), 51);
  assert.equal(absPos(26, 1), 26);
  assert.equal(absPos(26, 27), 0); // (26 + 26) % 52 = 0
  assert.equal(absPos(26, 52), 25); // turn-in square for blue
});

test('safe squares include entries and stars', () => {
  for (const sq of [0, 8, 13, 21, 26, 34, 39, 47]) assert.ok(isSafeSquare(sq));
  assert.ok(!isSafeSquare(1));
  assert.ok(!isSafeSquare(25));
});

test('cannot release from base without a 6', () => {
  const g = newGame();
  const r = applyRoll(g, { rollOverride: 3 });
  assert.equal(r.canMove, false);
  // turn should have advanced to blue
  assert.equal(g.turn, 1);
});

test('rolling 6 releases a token and grants extra turn', () => {
  const g = newGame();
  applyRoll(g, { rollOverride: 6 });
  applyMove(g, { tokenIdx: 0 });
  assert.equal(g.players[0].tokens[0], 1); // on entry square
  assert.equal(g.turn, 0); // extra turn after 6
});

test('three consecutive sixes voids the turn', () => {
  const g = newGame();
  // Roll 6, release, extra turn; roll 6, move, extra turn; roll 6 => voided.
  applyRoll(g, { rollOverride: 6 });
  applyMove(g, { tokenIdx: 0 });
  assert.equal(g.consecutiveSixes, 1);
  applyRoll(g, { rollOverride: 6 });
  applyMove(g, { tokenIdx: 0 });
  assert.equal(g.consecutiveSixes, 2);
  const r = applyRoll(g, { rollOverride: 6 });
  assert.equal(r.voided, true);
  assert.equal(g.turn, 1); // passed to blue
  assert.equal(g.consecutiveSixes, 0);
});

test('capturing an opponent sends them to base and grants extra turn', () => {
  const g = newGame();
  // Red releases + moves to square 5 (non-safe).
  applyRoll(g, { rollOverride: 6 });
  applyMove(g, { tokenIdx: 0 }); // red T0 at progress 1 (abs 0)
  applyRoll(g, { rollOverride: 5 });
  applyMove(g, { tokenIdx: 0 }); // red T0 at progress 6 (abs 5)
  // Blue's turn: release, then advance a token to abs 5 to capture.
  // Need to engineer blue's progress to land on abs 5.
  // Blue entry = 26, progress 1 = abs 26. To land on abs 5 from release,
  // need progress such that (26 + progress - 1) % 52 = 5 -> progress = 32.
  // Simpler: skip blue's turn by giving a non-useful roll that still lands
  // blue somewhere else. To hit this scenario deterministically we'll
  // instead assert a direct capture by mutating state.
  // Set up: blue token at progress 31 (abs (26+30)%52 = 4). Red is at abs 5.
  g.players[1].tokens[0] = 31;
  g.turn = 1;
  const r = applyRoll(g, { rollOverride: 1 });
  assert.ok(r.canMove);
  const m = applyMove(g, { tokenIdx: 0 });
  assert.equal(m.captures.length, 1);
  assert.equal(g.players[0].tokens[0], 0); // red sent home
  assert.equal(m.extraTurn, true);
  assert.equal(g.turn, 1);
});

test('capture is prevented on safe squares', () => {
  const g = newGame();
  // Red releases onto entry square 0 (safe). Blue tries to capture there.
  applyRoll(g, { rollOverride: 6 });
  applyMove(g, { tokenIdx: 0 }); // red T0 at abs 0 (safe)
  // Put blue near abs 0, then move 1 step onto abs 0.
  // Blue progress to hit abs 0: (26 + p - 1) % 52 = 0 -> p = 27.
  g.players[1].tokens[0] = 26; // abs (26+25)%52 = 51
  g.turn = 1;
  applyRoll(g, { rollOverride: 1 });
  const m = applyMove(g, { tokenIdx: 0 });
  assert.equal(m.captures.length, 0);
  assert.equal(g.players[0].tokens[0], 1); // red still at progress 1
});

test('reaching home centre requires exact roll and grants extra turn', () => {
  const g = newGame();
  // Put red's token at progress 56 (one before centre is 57; centre is 58).
  g.players[0].tokens[0] = 56;
  // Roll 3: overshoot, illegal.
  const r1 = applyRoll(g, { rollOverride: 3 });
  assert.equal(r1.canMove, false); // all other tokens in base, this one overshoots
  // New turn: set it back.
  g.turn = 0;
  g.players[0].tokens[0] = 56;
  applyRoll(g, { rollOverride: 2 });
  const m = applyMove(g, { tokenIdx: 0 });
  assert.equal(g.players[0].tokens[0], HOME_CENTRE);
  assert.equal(m.extraTurn, true);
});

test('winning when all four tokens reach home', () => {
  const g = newGame();
  g.players[0].tokens = [HOME_CENTRE, HOME_CENTRE, HOME_CENTRE, 57];
  applyRoll(g, { rollOverride: 1 });
  const m = applyMove(g, { tokenIdx: 3 });
  assert.equal(m.won, true);
  assert.equal(g.winner, 0);
  assert.ok(g.finishedAt != null);
});

test('cannot stack own tokens on main track', () => {
  const g = newGame();
  g.players[0].tokens = [5, 5, 0, 0]; // two red tokens at same progress — shouldn't happen in normal play but we'll test the blocker
  // Actually set one at progress 1, another progress that would land on the same abs.
  g.players[0].tokens = [1, 0, 0, 0]; // T0 at abs 0
  applyRoll(g, { rollOverride: 6 });
  // Cannot release T1 (would land on abs 0 where T0 sits)
  const moves = g.awaitingMove ? [0, 1, 2, 3].filter((i) => {
    try {
      const copy = JSON.parse(JSON.stringify(g));
      applyMove(copy, { tokenIdx: i });
      return true;
    } catch {
      return false;
    }
  }) : [];
  assert.ok(!moves.includes(1));
  assert.ok(!moves.includes(2));
  assert.ok(!moves.includes(3));
});

test('no-move roll passes turn automatically', () => {
  const g = newGame();
  applyRoll(g, { rollOverride: 2 }); // red can't do anything
  assert.equal(g.turn, 1);
  assert.equal(g.lastRoll, null);
});

test('snapshot is serialisable and has no functions', () => {
  const g = newGame();
  applyRoll(g, { rollOverride: 6 });
  applyMove(g, { tokenIdx: 0 });
  const s = JSON.parse(JSON.stringify(g));
  assert.equal(s.players[0].tokens[0], 1);
});
