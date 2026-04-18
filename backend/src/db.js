import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/ludo.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,                 -- signup_bonus | room_entry | room_refund | room_winnings | rake
    amount INTEGER NOT NULL,            -- signed: positive = credit, negative = debit
    balance_after INTEGER NOT NULL,
    ref TEXT,                           -- room/game id
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    entry_amount INTEGER NOT NULL,
    player0_id TEXT NOT NULL REFERENCES users(id),
    player1_id TEXT NOT NULL REFERENCES users(id),
    winner_id TEXT REFERENCES users(id),
    rake INTEGER NOT NULL DEFAULT 0,
    payout INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    history_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_games_p0 ON games(player0_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_games_p1 ON games(player1_id, started_at DESC);
`);
