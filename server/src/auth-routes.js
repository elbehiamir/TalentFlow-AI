import { Router } from 'express';
import { createAccessToken, normalizeEmail, SESSION_COOKIE_NAME, verifyPassword } from './auth.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: SESSION_TTL_MS
  };
}

export function createAuthRouter({ pool, secret, authenticate }) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
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
      const valid = account ? await verifyPassword(password, account.password_hash) : false;
      if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

      const token = createAccessToken(account, secret);
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

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api'
    });
    res.status(204).end();
  });

  return router;
}
