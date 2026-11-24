export const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export async function cleanupAuthSessions(databasePool) {
  if (!databasePool || typeof databasePool.query !== 'function') {
    throw new TypeError('A PostgreSQL pool is required to clean authentication sessions.');
  }

  const result = await databasePool.query(`
    DELETE FROM auth_sessions
    WHERE expires_at <= NOW()
       OR revoked_at <= NOW() - INTERVAL '7 days'
  `, []);

  return Number.isInteger(result.rowCount) ? result.rowCount : 0;
}

export function scheduleAuthSessionCleanup(databasePool, {
  intervalMs = SESSION_CLEANUP_INTERVAL_MS,
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) {
    throw new RangeError('Session cleanup interval must be at least 1000 milliseconds.');
  }
  if (typeof setIntervalFn !== 'function' || typeof clearIntervalFn !== 'function') {
    throw new TypeError('Session cleanup timer functions must be callable.');
  }

  let running = false;
  const run = async () => {
    if (running) return 0;
    running = true;

    try {
      const deleted = await cleanupAuthSessions(databasePool);
      if (deleted > 0) {
        logger.info?.(`Removed ${deleted} expired or old revoked authentication sessions.`);
      }
      return deleted;
    } catch (error) {
      logger.error?.('Authentication session cleanup failed.', error);
      return null;
    } finally {
      running = false;
    }
  };

  const timer = setIntervalFn(run, intervalMs);
  timer?.unref?.();
  return () => clearIntervalFn(timer);
}
