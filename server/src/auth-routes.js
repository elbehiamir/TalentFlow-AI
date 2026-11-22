import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  createAccessToken,
  DUMMY_PASSWORD_HASH,
  normalizeEmail,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifyPassword
} from './auth.js';
import { createLoginRateLimiter } from './login-rate-limit.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: SESSION_TTL_MS
  };
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api'
  });
}

export function createAuthRouter({ pool, secret, authenticate, passwordVerifier = verifyPassword, dummyPasswordHash = DUMMY_PASSWORD_HASH }) {
  const router = Router();
  const loginRateLimiter = createLoginRateLimiter();

  router.post('/login', loginRateLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;
      if (!EMAIL_PATTERN.test(email) || typeof password !== 'string' ||
          password.length < 1 || password.length > 128) {
        return res.status(400).json({ error: 'Enter a valid email and password.' });
      }

      const result = await pool.query(
        'SELECT id, email, password_hash, role FROM users WHERE email = $1',
        [email]
      );
      const account = result.rows[0];
      const valid = await passwordVerifier(password, account?.password_hash ?? dummyPasswordHash);
      if (!account || !valid) {
        loginRateLimiter.recordFailure(req);
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const now = Date.now();
      const sessionId = randomUUID();
      const token = createAccessToken(account, secret, now, sessionId);
      await pool.query(
        `INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
        [sessionId, account.id, SESSION_TTL_SECONDS]
      );

      loginRateLimiter.reset(req);
      res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
      res.json({
        user: { id: account.id, email: account.email, role: account.role }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/logout', authenticate, async (req, res, next) => {
    try {
      await pool.query(
        'UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
        [req.sessionId, req.user.id]
      );
      clearSessionCookie(res);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
