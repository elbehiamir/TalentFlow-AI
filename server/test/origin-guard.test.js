import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginGuard } from '../src/origin-guard.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('origin guard allows a state-changing request from the configured frontend', () => {
  const guard = createOriginGuard('http://localhost:5173');
  const req = { method: 'POST', get: name => name === 'origin' ? 'http://localhost:5173' : undefined };
  const res = responseRecorder();
  let nextCalled = false;

  guard(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('origin guard rejects a state-changing request from another origin', () => {
  const guard = createOriginGuard('https://app.example.com');
  const req = { method: 'PATCH', headers: { origin: 'https://attacker.example' } };
  const res = responseRecorder();
  let nextCalled = false;

  guard(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Request origin is not allowed.' });
});

test('origin guard rejects state-changing requests without an Origin header', () => {
  const guard = createOriginGuard('https://app.example.com');
  const req = { method: 'DELETE', headers: {} };
  const res = responseRecorder();
  let nextCalled = false;

  guard(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('origin guard does not block safe methods without an Origin header', () => {
  const guard = createOriginGuard('https://app.example.com');
  let nextCalled = false;

  guard({ method: 'GET', headers: {} }, responseRecorder(), () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test('origin guard does not block CORS preflight requests', () => {
  const guard = createOriginGuard('https://app.example.com');
  let nextCalled = false;

  guard({ method: 'OPTIONS', headers: {} }, responseRecorder(), () => { nextCalled = true; });

  assert.equal(nextCalled, true);
});

test('origin guard rejects malformed or non-origin CLIENT_URL values', () => {
  assert.throws(() => createOriginGuard(''), /valid HTTP\(S\) origin/);
  assert.throws(() => createOriginGuard('ftp://app.example.com'), /valid HTTP\(S\) origin/);
  assert.throws(() => createOriginGuard('https://app.example.com/path'), /without a path/);
  assert.throws(() => createOriginGuard('https://app.example.com/'), /without a path/);
});
