import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createAuthRouter } from '../src/auth-routes.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../src/auth.js';

const SECRET = 'test-only-secret-with-at-least-32-random-bytes';

async function startAuthServer(t, { pool, passwordVerifier }) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({
    pool,
    secret: SECRET,
    authenticate: (_req, res) => res.status(401).json({ error: 'Authentication required.' }),
    passwordVerifier
  }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  }));

  return `http://127.0.0.1:${server.address().port}/api/auth/login`;
}

test('the dummy hash is a valid scrypt hash that never authenticates an unknown account', async () => {
    assert.match(DUMMY_PASSWORD_HASH, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('not-the-dummy-password', DUMMY_PASSWORD_HASH), false);
});

test('unknown and existing emails use the same password-verification path and generic error', async t => {
  const verifiedHashes = [];
  const pool = {
    async query(_sql, [email]) {
      if (email === 'known@example.com') {
        return {
          rows: [{
            id: 7,
            email,
            password_hash: 'stored-account-hash',
            role: 'recruiter'
          }]
        };
      }
      return { rows: [] };
    }
  };
  const passwordVerifier = async (_password, storedHash) => {
    verifiedHashes.push(storedHash);
    return false;
  };
  const url = await startAuthServer(t, { pool, passwordVerifier });

  const unknownResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'unknown@example.com', password: 'wrong-password' })
  });
  const unknownBody = await unknownResponse.json();

  const knownResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'known@example.com', password: 'wrong-password' })
  });
  const knownBody = await knownResponse.json();

  assert.equal(unknownResponse.status, 401);
  assert.equal(knownResponse.status, 401);
  assert.deepEqual(unknownBody, { error: 'Invalid email or password.' });
  assert.deepEqual(knownBody, unknownBody);
  assert.deepEqual(verifiedHashes, [DUMMY_PASSWORD_HASH, 'stored-account-hash']);
});
