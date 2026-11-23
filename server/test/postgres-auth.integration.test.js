import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { createAuthMiddleware, bootstrapAdmin } from '../src/auth.js';
import { createAuthRouter } from '../src/auth-routes.js';
import { createOriginGuard } from '../src/origin-guard.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const SECRET = 'integration-test-secret-with-at-least-32-bytes';
const ADMIN_EMAIL = 'admin@talentflow.test';
const ADMIN_PASSWORD = 'Integration-admin-password-2026';

test('PostgreSQL persists, reloads, revokes and expires authentication sessions', {
  skip: !databaseUrl ? 'Set TEST_DATABASE_URL to a disposable PostgreSQL database.' : false
}, async t => {
  const adminPool = new Pool({ connectionString: databaseUrl });
  const schema = 'talentflow_test_' + randomUUID().replaceAll('-', '');
  let schemaCreated = false;
  let appPool;
  let server;

  t.after(async () => {
    if (server) {
      await new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections?.();
      });
    }
    if (appPool) await appPool.end();
    if (schemaCreated) {
      await adminPool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    }
    await adminPool.end();
  });

  await adminPool.query('CREATE SCHEMA "' + schema + '"');
  schemaCreated = true;
  appPool = new Pool({
    connectionString: databaseUrl,
    options: '-c search_path=' + schema
  });

  // db.js validates DATABASE_URL during module initialization; keep this test isolated
  // from the developer's normal application database.
  process.env.DATABASE_URL = databaseUrl;
  const { initializeDatabase } = await import('../src/db.js');
  await initializeDatabase(appPool);

  assert.equal(await bootstrapAdmin(appPool, ADMIN_EMAIL, ADMIN_PASSWORD), true);

  const app = express();
  app.use(express.json());
  app.use(createOriginGuard('http://localhost:5173'));
  const authenticate = createAuthMiddleware(SECRET, appPool);
  app.use('/api/auth', createAuthRouter({
    pool: appPool,
    secret: SECRET,
    authenticate
  }));

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api/auth';

  const login = () => fetch(baseUrl + '/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173'
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const cookieFrom = response => {
    const value = response.headers.get('set-cookie') ?? '';
    const match = value.match(/^talentflow_session=([^;]+)/);
    assert.ok(match, 'login should issue a session cookie');
    return 'talentflow_session=' + match[1];
  };

  const firstLogin = await login();
  assert.equal(firstLogin.status, 200);
  const firstCookie = cookieFrom(firstLogin);

  const secondLogin = await login();
  assert.equal(secondLogin.status, 200);
  const secondCookie = cookieFrom(secondLogin);
  assert.notEqual(firstCookie, secondCookie);

  const storedSessions = await appPool.query(
    'SELECT id, user_id, expires_at, revoked_at FROM auth_sessions ORDER BY created_at'
  );
  assert.equal(storedSessions.rowCount, 2);
  assert.ok(storedSessions.rows.every(row => row.user_id === storedSessions.rows[0].user_id));
  assert.ok(storedSessions.rows.every(row => row.revoked_at === null));

  const beforeRoleChange = await fetch(baseUrl + '/me', {
    headers: { Cookie: firstCookie }
  });
  assert.equal(beforeRoleChange.status, 200);
  assert.equal((await beforeRoleChange.json()).user.role, 'admin');

  // Authorization uses the current database role, not the role embedded in the cookie.
  await appPool.query('UPDATE users SET role = $1 WHERE email = $2', ['recruiter', ADMIN_EMAIL]);
  const afterRoleChange = await fetch(baseUrl + '/me', {
    headers: { Cookie: firstCookie }
  });
  assert.equal(afterRoleChange.status, 200);
  assert.equal((await afterRoleChange.json()).user.role, 'recruiter');

  const logout = await fetch(baseUrl + '/logout', {
    method: 'POST',
    headers: {
      Cookie: firstCookie,
      Origin: 'http://localhost:5173'
    }
  });
  assert.equal(logout.status, 204);

  const revoked = await appPool.query(
    'SELECT revoked_at FROM auth_sessions WHERE id = $1',
    [storedSessions.rows[0].id]
  );
  assert.ok(revoked.rows[0].revoked_at);

  const afterLogout = await fetch(baseUrl + '/me', {
    headers: { Cookie: firstCookie }
  });
  assert.equal(afterLogout.status, 401);

  const independentSession = await fetch(baseUrl + '/me', {
    headers: { Cookie: secondCookie }
  });
  assert.equal(independentSession.status, 200);

  await appPool.query(
    'UPDATE auth_sessions SET expires_at = NOW() - INTERVAL \'1 second\' WHERE id = $1',
    [storedSessions.rows[1].id]
  );
  const afterExpiry = await fetch(baseUrl + '/me', {
    headers: { Cookie: secondCookie }
  });
  assert.equal(afterExpiry.status, 401);
});
