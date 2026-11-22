import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createAuthMiddleware } from '../src/auth.js';
import { createAuthRouter } from '../src/auth-routes.js';

const SECRET = 'test-only-secret-with-at-least-32-random-bytes';
const ACCOUNT = Object.freeze({
  id: 91,
  email: 'recruiter@example.com',
  password_hash: 'stubbed-test-hash',
  role: 'recruiter'
});

test('login, session lookup and logout revoke only the current server-side session', async t => {
  const sessions = new Map();
  const pool = {
    async query(sql, values) {
      if (sql.startsWith('SELECT id, email, password_hash, role FROM users')) {
        assert.deepEqual(values, [ACCOUNT.email]);
        return { rows: [ACCOUNT] };
      }

      if (sql.includes('INSERT INTO auth_sessions')) {
        const [id, userId, ttlSeconds] = values;
        sessions.set(id, {
          userId: Number(userId),
          expiresAt: Date.now() + Number(ttlSeconds) * 1000,
          revoked: false
        });
        return { rowCount: 1, rows: [] };
      }

      if (sql.includes('FROM auth_sessions s')) {
        const [id, userId] = values;
        const session = sessions.get(id);
        if (!session || session.userId !== Number(userId) ||
            session.revoked || session.expiresAt <= Date.now()) {
          return { rows: [] };
        }
        return { rows: [{ id: ACCOUNT.id, email: ACCOUNT.email, role: ACCOUNT.role }] };
      }

      if (sql.startsWith('UPDATE auth_sessions SET revoked_at')) {
        const [id, userId] = values;
        const session = sessions.get(id);
        if (session && session.userId === Number(userId) && !session.revoked) {
          session.revoked = true;
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }

      throw new Error('Unexpected test query: ' + sql);
    }
  };

  const app = express();
  app.use(express.json());
  const authenticate = createAuthMiddleware(SECRET, pool);
  app.use('/api/auth', createAuthRouter({
    pool,
    secret: SECRET,
    authenticate,
    passwordVerifier: async (password, storedHash) =>
      password === 'Valid-test-password-2026' && storedHash === ACCOUNT.password_hash
  }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;

  const anonymousResponse = await fetch(`${baseUrl}/me`);
  assert.equal(anonymousResponse.status, 401);

  const login = () => fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ' RECRUITER@EXAMPLE.COM ',
      password: 'Valid-test-password-2026'
    })
  });

  const firstLogin = await login();
  assert.equal(firstLogin.status, 200);
  assert.deepEqual(await firstLogin.json(), {
    user: { id: ACCOUNT.id, email: ACCOUNT.email, role: ACCOUNT.role }
  });

  const firstSetCookie = firstLogin.headers.get('set-cookie') ?? '';
  assert.match(firstSetCookie, /^talentflow_session=/);
  assert.match(firstSetCookie, /HttpOnly/i);
  assert.match(firstSetCookie, /SameSite=Lax/i);
  assert.match(firstSetCookie, /Path=\\/api/i);
  assert.match(firstSetCookie, /Max-Age=28800/i);
  const firstCookie = firstSetCookie.split(';', 1)[0];

  const secondLogin = await login();
  assert.equal(secondLogin.status, 200);
  const secondCookie = (secondLogin.headers.get('set-cookie') ?? '').split(';', 1)[0];
  assert.notEqual(secondCookie, firstCookie);

  const firstSessionResponse = await fetch(`${baseUrl}/me`, {
    headers: { Cookie: firstCookie }
  });
  assert.equal(firstSessionResponse.status, 200);

  const logoutWithoutSession = await fetch(`${baseUrl}/logout`, { method: 'POST' });
  assert.equal(logoutWithoutSession.status, 401);

  const logoutResponse = await fetch(`${baseUrl}/logout`, {
    method: 'POST',
    headers: { Cookie: firstCookie }
  });
  assert.equal(logoutResponse.status, 204);
  const clearedCookie = logoutResponse.headers.get('set-cookie') ?? '';
  assert.match(clearedCookie, /^talentflow_session=;/);
  assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  assert.match(clearedCookie, /HttpOnly/i);
  assert.match(clearedCookie, /Path=\\/api/i);
  assert.match(clearedCookie, /SameSite=Lax/i);

  const revokedSessionResponse = await fetch(`${baseUrl}/me`, {
    headers: { Cookie: firstCookie }
  });
  assert.equal(revokedSessionResponse.status, 401);

  const otherSessionResponse = await fetch(`${baseUrl}/me`, {
    headers: { Cookie: secondCookie }
  });
  assert.equal(otherSessionResponse.status, 200);
});
