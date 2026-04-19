import pg from 'pg';

const { Pool, types } = pg;

// pg returns BIGINT (int8) as a string by default to avoid precision loss.
// All our BIGINT columns are unix-ms timestamps which comfortably fit in a JS
// Number, so parse them back to numbers.
types.setTypeParser(20, (val) => (val === null ? null : Number(val)));

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://ludo:ludo@localhost:5432/ludo';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
});

pool.on('error', (err) => {
  console.error('[pg] idle client error', err);
});

/** Run a parameterised query against the pool. Returns a pg Result. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn(client)` inside a BEGIN/COMMIT transaction on a dedicated client.
 * Rolls back and re-throws on any error.
 */
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failures
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Create tables & indexes if they don't already exist. Idempotent. */
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      coins         INTEGER NOT NULL DEFAULT 0,
      created_at    BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL REFERENCES users(id),
      kind           TEXT NOT NULL,
      amount         INTEGER NOT NULL,
      balance_after  INTEGER NOT NULL,
      ref            TEXT,
      created_at     BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_user
      ON transactions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS games (
      id             TEXT PRIMARY KEY,
      room_id        TEXT NOT NULL,
      entry_amount   INTEGER NOT NULL,
      player0_id     TEXT NOT NULL REFERENCES users(id),
      player1_id     TEXT NOT NULL REFERENCES users(id),
      winner_id      TEXT REFERENCES users(id),
      rake           INTEGER NOT NULL DEFAULT 0,
      payout         INTEGER NOT NULL DEFAULT 0,
      started_at     BIGINT NOT NULL,
      finished_at    BIGINT,
      history_json   JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_games_p0
      ON games(player0_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_games_p1
      ON games(player1_id, started_at DESC);
  `);
}

/** Close the pool (for tests / graceful shutdown). */
export async function closeDb() {
  await pool.end();
}
