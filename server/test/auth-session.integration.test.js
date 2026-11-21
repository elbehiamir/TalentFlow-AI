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

test('login, session lookup and logout use the expected browser cookie lifecycle', async t => {
  const app = express();
  app.use(express.json());

  const pool = {
    async query(_sql, values) {
      assert.deepEqual(values, [ACCOUNT.email]);
      return { rows: [ACCOUNT] };
    }
  };

  app.use('/api/auth', createAuthRouter({
    pool,
    secret: SECRET,
    authenticate: createAuthMiddleware(SECRET),
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

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ' RECRUITER@EXAMPLE.COM ',
      password: 'Valid-test-password-2026'
    })
  });

  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    user: { id: ACCOUNT.id, email: ACCOUNT.email, role: ACCOUNT.role }
  });

  const setCookie = loginResponse.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /^talentflow_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\/api/i);
  assert.match(setCookie, /Max-Age=28800/i);

  const cookie = setCookie.split(';', 1)[0];
  const sessionResponse = await fetch(`${baseUrl}/me`, {
    headers: { Cookie: cookie }
  });

  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), {
    user: { id: ACCOUNT.id, email: ACCOUNT.email, role: ACCOUNT.role }
  });

  const logoutResponse = await fetch(`${baseUrl}/logout`, {
    method: 'POST'
  });

  assert.equal(logoutResponse.status, 204);
  const clearedCookie = logoutResponse.headers.get('set-cookie') ?? '';
  assert.match(clearedCookie, /^talentflow_session=;/);
  assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  assert.match(clearedCookie, /HttpOnly/i);
  assert.match(clearedCookie, /Path=\/api/i);
  assert.match(clearedCookie, /SameSite=Lax/i);
});
