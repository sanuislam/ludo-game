# Testing the Ludo game end-to-end (Postgres stack)

Covers the full 2-player real-time flow: signup → escrow → forfeit payout → ledger verification. Proven against the Postgres migration (PR #3).

## Devin Secrets Needed
None. Everything runs locally — Postgres via docker-compose with hard-coded dev credentials (`ludo:ludo`).

## Ports & stack
- Postgres: docker-compose service `postgres`, port 5432
- Backend: `node src/index.js` in `backend/`, port 4000, requires `DATABASE_URL` (default `postgres://ludo:ludo@localhost:5432/ludo`)
- Frontend: `npm run dev` in `frontend/`, Vite on port 5173, proxies `/api` and `/socket.io` to 4000
- DB name: `ludo`, tables: `users`, `transactions`, `games` (auto-created by `initDb()` on backend boot)

## One-time setup
```bash
docker compose up -d postgres
cd backend && npm install && npm run smoke    # sanity check
cd ../frontend && npm install
```

## Running the stack for a test session
```bash
# Truncate state for a reproducible run.
docker exec ludo-game-postgres-1 psql -U ludo -d ludo -c \
  "TRUNCATE games, transactions, users CASCADE;"

# Backend (background)
cd backend && (node src/index.js > /tmp/backend.log 2>&1 &)

# Frontend (background)
cd frontend && (npm run dev > /tmp/frontend.log 2>&1 &)

sleep 3 && curl -s http://localhost:4000/api/health   # {"ok":true}
```

## Golden-path E2E in the browser
1. Open http://localhost:5173/signup in a regular Chrome window, sign up user A (e.g. `alice`).
2. Open a **separate incognito window** for user B (`bob`) — regular + incognito have isolated localStorage, so the auth tokens don't collide.
3. In each window, click **Join** on the 🪙 10 tier card.
4. Both windows auto-navigate to `/game/<id>` with "Pot 🪙 20".
5. Close one window to simulate disconnect. After **30s grace**, the opponent receives `game:over` with winner + payout.
6. Winner's balance jumps 990 → 1008 (payout 18, rake 2 = 10% of 20 pot).

## psql verification queries (run between steps)
```bash
docker exec ludo-game-postgres-1 psql -U ludo -d ludo -c \
  "SELECT username, coins FROM users ORDER BY username;
   SELECT kind, amount FROM transactions ORDER BY created_at;
   SELECT entry_amount, (SELECT username FROM users WHERE id=g.winner_id) AS winner,
          rake, payout, finished_at IS NOT NULL AS finished FROM games g;"
```
Expected after a forfeit of tier-10 game:
- users: winner 1008, loser 990
- transactions: 2 `signup_bonus` (+1000), 2 `room_entry` (−10), 1 `room_winnings` (+18)
- games: rake=2, payout=18, winner_id set, finished_at NOT NULL

## Concurrency race repro (non-UI, shell-level)
PR #3 fixed a race where two concurrent `joinTier` handlers could both debit coins for the same waiting slot. Script lives at `backend/scripts/race-join.mjs`:
```bash
docker exec ludo-game-postgres-1 psql -U ludo -d ludo -c "TRUNCATE games, transactions, users CASCADE;"
cd backend && node scripts/race-join.mjs
```
Expect: `joins ok=6  fail=0 / total debited = 60  expected = 60 / OK: no coins leaked`. Without the `withRoomsLock` fix, `total debited` will be > `expected`.

## Known UX gotchas (not bugs in PR #3)
- **"Loading game…" on 2nd joiner**: when the second player's `room:join` response triggers navigation to `/game/<id>`, the server's initial `game:state` snapshot has *already fired* to the socket before the Game component mounted. The screen self-heals on the next emit (roll / move / forfeit), but until then it shows "Loading game…". A small follow-up (re-emit `game:state` on game-room subscribe) would fix it.
- **F5 in-game = forfeit**: pressing F5 drops the socket, which starts the 30s disconnect timer. If the player doesn't reconnect within 30s they lose. During tests, avoid F5 on the game page — if you hit the "Loading game…" screen, wait for the next emit or use a scripted socket client instead.
- **`navigate(..., { replace: true })` can kick to /login**: if the auth token isn't in localStorage when Game.jsx mounts, the app bounces to /login. In incognito the token IS persisted across F5 within the same session, but make sure signup actually succeeded before navigating away.

## Faster iteration: backend-only smoke
`npm run smoke` in backend/ exercises signup × 2 + socket join × 2 + game start + dice roll entirely via fetch + socket.io-client. Use this for quick backend regression after DB-layer changes.

## CI parity
`.github/workflows/ci.yml` spins up a `postgres:16-alpine` service container for the backend job and sets `DATABASE_URL` — so `npm test` in CI matches local when using docker-compose.

## Recording tips (from past sessions)
- Maximize Chrome before `record_start` so the whole app is visible. `wmctrl` is not installed on the VM; use `xdotool getactivewindow windowsize 100% 100%` instead.
- Add `record_annotate` at each `test_start` and `assertion` — the video slows down at annotation points for the viewer.
- Annotate Postgres verification steps as text assertions rather than trying to screenshot the terminal output.
