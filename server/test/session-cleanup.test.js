import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupAuthSessions,
  scheduleAuthSessionCleanup
} from '../src/session-cleanup.js';

test('cleanup deletes expired sessions and revoked sessions older than seven days', async () => {
  let query;
  let values;
  const deleted = await cleanupAuthSessions({
    async query(sql, params) {
      query = sql;
      values = params;
      return { rowCount: 3 };
    }
  });

  assert.equal(deleted, 3);
  assert.match(query, /expires_at <= NOW\(\)/);
  assert.match(query, /revoked_at <= NOW\(\) - INTERVAL '7 days'/);
  assert.deepEqual(values, []);
});

test('cleanup requires a PostgreSQL query pool', async () => {
  await assert.rejects(
    () => cleanupAuthSessions(null),
    /PostgreSQL pool is required/
  );
});

test('scheduled cleanup prevents overlapping runs and can be stopped', async () => {
  let scheduledCallback;
  let scheduledDelay;
  let clearedTimer;
  let resolveQuery;
  let queryCount = 0;
  let unrefCalled = false;
  const timer = { unref() { unrefCalled = true; } };
  const logged = [];

  const stop = scheduleAuthSessionCleanup({
    query() {
      queryCount += 1;
      return new Promise(resolve => { resolveQuery = resolve; });
    }
  }, {
    intervalMs: 1000,
    logger: { info: message => logged.push(message), error: () => assert.fail('unexpected cleanup error') },
    setIntervalFn(callback, delay) {
      scheduledCallback = callback;
      scheduledDelay = delay;
      return timer;
    },
    clearIntervalFn(value) { clearedTimer = value; }
  });

  assert.equal(scheduledDelay, 1000);
  assert.equal(unrefCalled, true);

  const firstRun = scheduledCallback();
  assert.equal(await scheduledCallback(), 0);
  assert.equal(queryCount, 1);

  resolveQuery({ rowCount: 2 });
  assert.equal(await firstRun, 2);
  assert.deepEqual(logged, ['Removed 2 expired or old revoked authentication sessions.']);

  stop();
  assert.equal(clearedTimer, timer);
});

test('scheduled cleanup logs database errors without creating an unhandled rejection', async () => {
  let scheduledCallback;
  const errors = [];
  const stop = scheduleAuthSessionCleanup({
    async query() { throw new Error('test database unavailable'); }
  }, {
    intervalMs: 1000,
    logger: { error: (message, error) => errors.push({ message, error }) },
    setIntervalFn(callback) { scheduledCallback = callback; return 1; },
    clearIntervalFn() {}
  });

  assert.equal(await scheduledCallback(), null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'Authentication session cleanup failed.');
  assert.match(errors[0].error.message, /test database unavailable/);
  stop();
});
