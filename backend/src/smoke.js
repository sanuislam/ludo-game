// Manual integration smoke test: two socket clients play a (very short)
// Ludo-style interaction and we verify rooms/game start events fire.
// Run with: node src/smoke.js (backend must be running on :4000).

import { io as ioc } from 'socket.io-client';

async function signupOrLogin(username) {
  const signup = await fetch('http://localhost:4000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@t.com`, password: 'secret123' }),
  });
  if (signup.ok) return signup.json();
  const login = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: username, password: 'secret123' }),
  });
  return login.json();
}

function connect(token) {
  return ioc('http://localhost:4000', { auth: { token }, transports: ['websocket'] });
}

function emit(sock, ev, payload) {
  return new Promise((res) => sock.emit(ev, payload, res));
}

function waitFor(sock, ev, pred = () => true, timeoutMs = 5000) {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), timeoutMs);
    sock.on(ev, (data) => {
      if (pred(data)) {
        clearTimeout(to);
        sock.off(ev);
        res(data);
      }
    });
  });
}

async function main() {
  const a = await signupOrLogin('smoke_a');
  const b = await signupOrLogin('smoke_b');
  const sa = connect(a.token);
  const sb = connect(b.token);
  await new Promise((r) => sa.on('connect', r));
  await new Promise((r) => sb.on('connect', r));

  console.log('alice coins', a.user.coins, 'bob coins', b.user.coins);

  const ra = await emit(sa, 'room:join', { tier: 10 });
  console.log('A join ->', ra);
  if (!ra.ok) throw new Error('a join failed');
  const started = waitFor(sa, 'room:started');
  const stateP = waitFor(sa, 'game:state', (s) => s && s.turn != null);
  const rb = await emit(sb, 'room:join', { tier: 10 });
  console.log('B join ->', rb);
  if (!rb.ok) throw new Error('b join failed');
  const startEvent = await started;
  console.log('started ->', startEvent);

  const state1 = await stateP;
  console.log('initial state turn=%d, awaitingMove=%s', state1.turn, state1.awaitingMove);

  // Which socket is player 0? It's whoever was in the room first (alice).
  const rollerSock = state1.players[0].username === 'smoke_a' ? sa : sb;
  const roll1 = await emit(rollerSock, 'game:roll', { gameId: state1.id });
  console.log('roll ->', roll1);

  sa.close();
  sb.close();
  console.log('OK');
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
