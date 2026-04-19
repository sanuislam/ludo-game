import express from 'express';
import { nanoid } from 'nanoid';
import { query, withTx } from './db.js';
import { authMiddleware } from './auth.js';

export const walletRouter = express.Router();

/**
 * Atomically adjust a user's balance and record a transaction.
 * Locks the user row `FOR UPDATE` so concurrent adjusts serialise.
 * Throws if the balance would go negative.
 * Returns the new balance.
 */
export async function adjustBalance({ userId, kind, amount, ref = null }) {
  return withTx(async (client) => {
    const { rows } = await client.query(
      'SELECT coins FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (rows.length === 0) throw new Error('user not found');
    const next = rows[0].coins + amount;
    if (next < 0) throw new Error('insufficient coins');
    await client.query('UPDATE users SET coins = $1 WHERE id = $2', [next, userId]);
    await client.query(
      `INSERT INTO transactions
         (id, user_id, kind, amount, balance_after, ref, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nanoid(), userId, kind, amount, next, ref, Date.now()],
    );
    return next;
  });
}

export async function getBalance(userId) {
  const { rows } = await query('SELECT coins FROM users WHERE id = $1', [userId]);
  return rows[0] ? rows[0].coins : 0;
}

walletRouter.get('/balance', authMiddleware, async (req, res, next) => {
  try {
    res.json({ coins: await getBalance(req.user.id) });
  } catch (err) {
    next(err);
  }
});

walletRouter.get('/transactions', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, kind, amount, balance_after, ref, created_at
       FROM transactions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.id],
    );
    res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
});

walletRouter.get('/games', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT g.*,
              u0.username AS player0_username,
              u1.username AS player1_username,
              uw.username AS winner_username
       FROM games g
       JOIN users u0 ON u0.id = g.player0_id
       JOIN users u1 ON u1.id = g.player1_id
       LEFT JOIN users uw ON uw.id = g.winner_id
       WHERE g.player0_id = $1 OR g.player1_id = $1
       ORDER BY g.started_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ games: rows });
  } catch (err) {
    next(err);
  }
});
