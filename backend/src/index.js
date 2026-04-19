import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { authRouter } from './auth.js';
import { walletRouter } from './wallet.js';
import { attachSocket } from './socket.js';
import { listLobby, ROOM_TIERS } from './rooms.js';
import { initDb } from './db.js';

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/lobby/tiers', (_req, res) => res.json({ tiers: ROOM_TIERS, lobby: listLobby() }));

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);

// Basic error handler.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const httpServer = http.createServer(app);
attachSocket(httpServer, CORS_ORIGIN);

initDb()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Ludo backend listening on :${PORT} (CORS: ${CORS_ORIGIN})`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
