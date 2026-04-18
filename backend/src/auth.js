import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from './db.js';

export const authRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const STARTER_COINS = Number(process.env.STARTER_COINS || 1000);

const signupSchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().max(120),
  password: z.string().min(6).max(72),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().min(3).max(120),
  password: z.string().min(1).max(72),
});

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

export function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(hdr);
  if (!m) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, coins FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'user not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, coins FROM users WHERE id = ?').get(payload.sub);
    return user || null;
  } catch {
    return null;
  }
}

authRouter.post('/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { username, email, password } = parsed.data;

  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);
  if (existing) return res.status(409).json({ error: 'username or email already taken' });

  const id = nanoid();
  const hash = bcrypt.hashSync(password, 10);
  const now = Date.now();

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, username, email, password_hash, coins, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, username, email, hash, STARTER_COINS, now);
    db.prepare(
      'INSERT INTO transactions (id, user_id, kind, amount, balance_after, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(nanoid(), id, 'signup_bonus', STARTER_COINS, STARTER_COINS, null, now);
  });
  tx();

  const user = { id, username, email, coins: STARTER_COINS };
  res.json({ user, token: signToken(user) });
});

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { usernameOrEmail, password } = parsed.data;

  const row = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(usernameOrEmail, usernameOrEmail);
  if (!row) return res.status(401).json({ error: 'invalid credentials' });
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const user = { id: row.id, username: row.username, email: row.email, coins: row.coins };
  res.json({ user, token: signToken(user) });
});

authRouter.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
