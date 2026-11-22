import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapAdmin,
  createAccessToken,
  createAuthMiddleware,
  hashPassword,
  requireRoles,
  verifyAccessToken,
  verifyPassword
} from '../src/auth.js';

const secret = 'test-only-secret-with-at-least-32-random-bytes';
const user = { id: 42, email: 'recruiter@example.com', role: 'recruiter' };
const sessionId = 'a3d9b2a1-8d4e-4a63-9d21-91a6a9f7c142';

test('password hashes verify without storing the original password', async () => {
  const password = 'A-long-test-password-2026';
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('a-different-password', hash), false);
});

test('password hashing rejects weak or oversized passwords', async () => {
  await assert.rejects(() => hashPassword('short'), /between 12 and 128/);
  await assert.rejects(() => hashPassword('x'.repeat(129)), /between 12 and 128/);
});

test('signed session includes a unique session id and verifies', () => {
  const token = createAccessToken(user, secret, Date.now(), sessionId);
  assert.deepEqual(verifyAccessToken(token, secret), {
    id: 42,
    email: 'recruiter@example.com',
    role: 'recruiter',
    sessionId
  });
});

test('expired, tampered and wrong-secret sessions are rejected', () => {
  const expired = createAccessToken(user, secret, Date.now() - 9 * 60 * 60 * 1000, sessionId);
  const valid = createAccessToken(user, secret, Date.now(), sessionId);
  const parts = valid.split('.');
  const changedSignature = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  const tampered = parts[0] + '.' + parts[1] + '.' + changedSignature;
  assert.equal(verifyAccessToken(expired, secret), null);
  assert.equal(verifyAccessToken(tampered, secret), null);
  assert.equal(verifyAccessToken(valid, 'another-secret-that-is-also-long-enough'), null);
});

test('session creation rejects invalid session identifiers and weak secrets', () => {
  assert.throws(() => createAccessToken(user, 'short'), /at least 32 bytes/);
  assert.throws(() => createAccessToken(user, secret, Date.now(), 'not-a-uuid'), /invalid session id/);
  assert.throws(() => verifyAccessToken('anything', 'short'), /at least 32 bytes/);
});

test('role guard rejects users outside the allowed roles', () => {
  let statusCode = 0;
  let responseBody;
  let nextCalled = false;
  const response = {
    status(code) { statusCode = code; return this; },
    json(body) { responseBody = body; return this; }
  };
  requireRoles('admin')({ user }, response, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
  assert.match(responseBody.error, /permission/);
});

test('role guard allows an authorized user', () => {
  let nextCalled = false;
  requireRoles('admin', 'recruiter')(
    { user },
    { status() { return this; }, json() { return this; } },
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
});

test('bootstrap creates a normalized first administrator without exposing the password', async () => {
  const inserted = [];
  const pool = {
    async query(sql, values) {
      if (sql.startsWith('SELECT')) return { rowCount: 0, rows: [] };
      inserted.push({ sql, values });
      return { rowCount: 1, rows: [] };
    }
  };
  const password = 'First-admin-password-2026';
  assert.equal(await bootstrapAdmin(pool, ' ADMIN@EXAMPLE.COM ', password), true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].values[0], 'admin@example.com');
  assert.notEqual(inserted[0].values[1], password);
  assert.equal(inserted[0].values[2], 'admin');
});

test('bootstrap does not overwrite an existing administrator', async () => {
  let insertCalled = false;
  const pool = {
    async query(sql) {
      if (sql.startsWith('SELECT')) return { rowCount: 1, rows: [{ id: 1 }] };
      insertCalled = true;
      return { rowCount: 1, rows: [] };
    }
  };
  assert.equal(await bootstrapAdmin(pool, 'admin@example.com', 'Another-password-2026'), false);
  assert.equal(insertCalled, false);
  await assert.rejects(() => bootstrapAdmin(pool, 'admin@example.com', ''), /Set both/);
});

test('session middleware loads the active user from the database', async () => {
  const token = createAccessToken(user, secret, Date.now(), sessionId);
  const pool = {
    async query(sql, values) {
      assert.match(sql, /FROM auth_sessions s/);
      assert.deepEqual(values, [sessionId, user.id]);
      return { rows: [{ id: user.id, email: user.email, role: user.role }] };
    }
  };
  const middleware = createAuthMiddleware(secret, pool);
  const request = { headers: { cookie: 'other=value; talentflow_session=' + token } };
  let nextCalled = false;
  await middleware(request, { status() { return this; }, json() { return this; } }, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(request.user, user);
  assert.equal(request.sessionId, sessionId);
});

test('session middleware rejects a revoked or missing database session', async () => {
  const token = createAccessToken(user, secret, Date.now(), sessionId);
  const middleware = createAuthMiddleware(secret, { query: async () => ({ rows: [] }) });
  let statusCode = 0;
  const response = {
    status(code) { statusCode = code; return this; },
    json() { return this; }
  };
  await middleware({ headers: { cookie: 'talentflow_session=' + token } }, response, () => {
    throw new Error('next should not run');
  });
  assert.equal(statusCode, 401);
});

test('session middleware forwards database failures to Express', async () => {
  const failure = new Error('database unavailable');
  const token = createAccessToken(user, secret, Date.now(), sessionId);
  const middleware = createAuthMiddleware(secret, { query: async () => { throw failure; } });
  let forwarded;
  await middleware(
    { headers: { cookie: 'talentflow_session=' + token } },
    { status() { return this; }, json() { return this; } },
    error => { forwarded = error; }
  );
  assert.equal(forwarded, failure);
});

test('session middleware requires a database pool', () => {
  assert.throws(() => createAuthMiddleware(secret), /PostgreSQL pool is required/);
});
