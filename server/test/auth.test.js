import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccessToken,
  hashPassword,
  requireRoles,
  verifyAccessToken,
  verifyPassword
} from '../src/auth.js';

const secret = 'test-only-secret-with-at-least-32-random-bytes';
const user = { id: 42, email: 'recruiter@example.com', role: 'recruiter' };

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

test('signed session contains only safe user claims and verifies', () => {
  const token = createAccessToken(user, secret);
  assert.deepEqual(verifyAccessToken(token, secret), {
    id: 42, email: 'recruiter@example.com', role: 'recruiter'
  });
});

test('expired, tampered and wrong-secret sessions are rejected', () => {
  const expired = createAccessToken(user, secret, Date.now() - 9 * 60 * 60 * 1000);
  const valid = createAccessToken(user, secret);
  const parts = valid.split('.');
  const changedSignature = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  const tampered = parts[0] + '.' + parts[1] + '.' + changedSignature;
  assert.equal(verifyAccessToken(expired, secret), null);
  assert.equal(verifyAccessToken(tampered, secret), null);
  assert.equal(verifyAccessToken(valid, 'another-secret-that-is-also-long-enough'), null);
});

test('session creation and verification reject weak secrets', () => {
  assert.throws(() => createAccessToken(user, 'short'), /at least 32 bytes/);
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
