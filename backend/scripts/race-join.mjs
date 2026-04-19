// Adversarial concurrency repro for the joinTier race flagged by Devin
// Review. Fires N concurrent `room:join` events at the same tier from
// distinct users and asserts that every accepted join corresponds to a
// single, coherent coin deduction — i.e. no orphan debits.
//
// Before the rooms-lock fix, two handlers could both observe the same
// waiting slot, both debit, then the later one would throw on createGame
// and leak coins.
//
// Run: node scripts/race-join.mjs  (backend + postgres must be running).

import { io as ioc } from 'socket.io-client';

const BASE = 'http://localhost:4000';
const TIER = 10;
const N = 6; // even number so all can pair up into 3 games

async function signup(username) {
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@t.com`, password: 'secret123' }),
  });
  if (!r.ok) throw new Error(`signup ${username} failed: ${r.status}`);
  return r.json();
}

function connect(token) {
  return new Promise((res, rej) => {
    const s = ioc(BASE, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => res(s));
    s.on('connect_error', rej);
  });
}

function emit(s, ev, payload) {
  return new Promise((res) => s.emit(ev, payload, res));
}

async function balance(token) {
  const r = await fetch(`${BASE}/api/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await r.json()).coins;
}

async function main() {
  const suffix = Math.floor(Math.random() * 1e9);
  const users = await Promise.all(
    Array.from({ length: N }, (_, i) => signup(`race_${suffix}_${i}`)),
  );
  const sockets = await Promise.all(users.map((u) => connect(u.token)));

  // Fire all joins in the same tick.
  const joinAcks = await Promise.all(
    sockets.map((s) => emit(s, 'room:join', { tier: TIER })),
  );

  const ok = joinAcks.filter((a) => a.ok).length;
  const fail = joinAcks.length - ok;
  console.log(`joins ok=${ok}  fail=${fail}`);

  // Give server a tick to finalise any paired games.
  await new Promise((r) => setTimeout(r, 200));

  // Check balances: every accepted join debits exactly TIER.
  const balances = await Promise.all(users.map((u) => balance(u.token)));
  const totalDebit = users.reduce(
    (acc, u, i) => acc + (u.user.coins - balances[i]),
    0,
  );
  const expected = ok * TIER;
  console.log(`total debited = ${totalDebit}  expected = ${expected}`);

  for (const s of sockets) s.close();

  if (totalDebit !== expected) {
    console.error('FAIL: debit mismatch — orphan coins leaked');
    process.exit(1);
  }
  console.log('OK: no coins leaked under concurrent joinTier');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
