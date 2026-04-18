import express from 'express';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { authMiddleware } from './auth.js';

export const walletRouter = express.Router();

/**
 * Atomically adjust a user's balance and record a transaction.
 * Throws if the balance would go negative.
 * Returns the new balance.
 */
export function adjustBalance({ userId, kind, amount, ref = null }) {
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
    if (!row) throw new Error('user not found');
    const next = row.coins + amount;
    if (next < 0) throw new Error('insufficient coins');
    db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(next, userId);
    db.prepare(
      'INSERT INTO transactions (id, user_id, kind, amount, balance_after, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(nanoid(), userId, kind, amount, next, ref, Date.now());
    return next;
  });
  return tx();
}

export function getBalance(userId) {
  const row = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
  return row ? row.coins : 0;
}

walletRouter.get('/balance', authMiddleware, (req, res) => {
  res.json({ coins: getBalance(req.user.id) });
});

walletRouter.get('/transactions', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, kind, amount, balance_after, ref, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
    )
    .all(req.user.id);
  res.json({ transactions: rows });
});

walletRouter.get('/games', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.*,
              u0.username as player0_username,
              u1.username as player1_username,
              uw.username as winner_username
       FROM games g
       JOIN users u0 ON u0.id = g.player0_id
       JOIN users u1 ON u1.id = g.player1_id
       LEFT JOIN users uw ON uw.id = g.winner_id
       WHERE g.player0_id = ? OR g.player1_id = ?
       ORDER BY g.started_at DESC LIMIT 50`,
    )
    .all(req.user.id, req.user.id);
  res.json({ games: rows });
});
