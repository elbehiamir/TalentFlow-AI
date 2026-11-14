import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginRateLimiter } from '../src/login-rate-limit.js';

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('login limiter allows attempts below the failure threshold', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 3, windowMs: 15000, now: () => 1000 });
  const req = { ip: '192.0.2.10' };
  limiter.recordFailure(req);
  limiter.recordFailure(req);
  const res = responseRecorder();
  let nextCalled = false;
  limiter(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.headers['RateLimit-Limit'], '3');
  assert.equal(res.headers['RateLimit-Remaining'], '1');
});

test('login limiter blocks after the configured number of failed attempts', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 2, windowMs: 15000, now: () => 1000 });
  const req = { ip: '192.0.2.11' };
  limiter.recordFailure(req);
  limiter.recordFailure(req);
  const res = responseRecorder();
  let nextCalled = false;
  limiter(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '15');
  assert.equal(res.headers['RateLimit-Remaining'], '0');
  assert.match(res.body.error, /Too many failed sign-in attempts/);
});

test('login limiter resets an IP after its time window expires', () => {
  let currentTime = 1000;
  const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 5000, now: () => currentTime });
  const req = { ip: '192.0.2.12' };
  limiter.recordFailure(req);
  currentTime = 6000;
  const res = responseRecorder();
  let nextCalled = false;
  limiter(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('login limiter keeps failure counts isolated by client IP', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 15000, now: () => 1000 });
  limiter.recordFailure({ ip: '192.0.2.13' });
  const res = responseRecorder();
  let nextCalled = false;
  limiter({ ip: '192.0.2.14' }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('successful sign-in can clear the client IP failure count', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 15000, now: () => 1000 });
  const req = { ip: '192.0.2.15' };
  limiter.recordFailure(req);
  limiter.reset(req);
  const res = responseRecorder();
  let nextCalled = false;
  limiter(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('login limiter rejects invalid configuration', () => {
  assert.throws(() => createLoginRateLimiter({ windowMs: 0 }), /at least 1000/);
  assert.throws(() => createLoginRateLimiter({ maxAttempts: 0 }), /positive integer/);
});

