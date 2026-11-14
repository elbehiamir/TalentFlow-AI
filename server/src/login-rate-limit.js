const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 5000;

export function createLoginRateLimiter({ windowMs = DEFAULT_WINDOW_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS, now = Date.now } = {}) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000) {
    throw new Error('Login rate-limit window must be at least 1000 milliseconds.');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Login rate-limit attempts must be a positive integer.');
  }
  if (typeof now !== 'function') throw new Error('Login rate-limit clock must be a function.');

  const attempts = new Map();
  const keyFor = req => {
    const address = typeof req.ip === 'string' && req.ip ? req.ip : req.socket?.remoteAddress || 'unknown';
    return address.slice(0, 128);
  };

  function removeExpired(currentTime) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= currentTime) attempts.delete(key);
    }
  }

  function makeRoom(key) {
    if (attempts.has(key) || attempts.size < MAX_TRACKED_IPS) return;
    let oldestKey = null;
    let earliestReset = Infinity;
    for (const [candidate, entry] of attempts) {
      if (entry.resetAt < earliestReset) {
        earliestReset = entry.resetAt;
        oldestKey = candidate;
      }
    }
    if (oldestKey !== null) attempts.delete(oldestKey);
  }

  function middleware(req, res, next) {
    const currentTime = now();
    removeExpired(currentTime);
    const entry = attempts.get(keyFor(req));
    if (!entry || entry.count < maxAttempts) {
      if (entry) {
        res.setHeader('RateLimit-Limit', String(maxAttempts));
        res.setHeader('RateLimit-Remaining', String(maxAttempts - entry.count));
      }
      return next();
    }

    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('RateLimit-Limit', String(maxAttempts));
    res.setHeader('RateLimit-Remaining', '0');
    return res.status(429).json({ error: 'Too many failed sign-in attempts. Please try again later.' });
  }

  middleware.recordFailure = req => {
    const currentTime = now();
    removeExpired(currentTime);
    const key = keyFor(req);
    let entry = attempts.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      makeRoom(key);
      entry = { count: 0, resetAt: currentTime + windowMs };
    }
    entry.count += 1;
    attempts.set(key, entry);
  };

  middleware.reset = req => attempts.delete(keyFor(req));
  return middleware;
}

