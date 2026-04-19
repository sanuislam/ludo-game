# ludo-game

2-player real-time multiplayer Ludo game with virtual coin wallet.

## Stack
- Backend: Node.js, Express, Socket.IO, PostgreSQL (`pg`), JWT auth
- Frontend: React + Vite, Socket.IO client, Zustand, React Router
- Game engine: pure, deterministic, server-authoritative (unit-tested)

## Run locally

### 1. Start Postgres
A `docker-compose.yml` at the repo root runs a local Postgres with the
credentials the backend expects by default:

```bash
docker compose up -d postgres
```

Or point `DATABASE_URL` at any Postgres you prefer (see `backend/.env.example`).
Tables are created automatically on first backend boot.

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env   # optional; defaults work with docker-compose
npm start              # http://localhost:4000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

No `.env` file is required for the frontend — Vite proxies `/api` and
`/socket.io` to `localhost:4000`. Set `VITE_API_URL` / `VITE_SOCKET_URL`
only when deploying against a non-local backend.

### Tests
```bash
cd backend && npm test
```
Engine tests are pure and don't require a database.

## How to play
1. Sign up (you get 1,000 starter virtual coins).
2. Pick a tier (10/50/100/500/1000) — entry is escrowed.
3. When a second player joins the same tier, the game starts.
4. Roll 6 to release a token. Move tokens around the 52-square board
   into your home stretch and the centre. First to get all 4 tokens
   home wins the pot (entry×2 minus 10% rake).
5. If a player disconnects for 30s they forfeit.

Virtual play-coins only — no real money.
