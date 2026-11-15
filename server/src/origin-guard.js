const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createOriginGuard(allowedOrigin) {
  if (typeof allowedOrigin !== 'string' || !allowedOrigin) {
    throw new Error('CLIENT_URL must be a valid HTTP(S) origin.');
  }

  let expectedOrigin;
  try {
    const parsed = new URL(allowedOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== allowedOrigin) {
      throw new Error('Invalid origin format.');
    }
    expectedOrigin = parsed.origin;
  } catch {
    throw new Error('CLIENT_URL must be a valid HTTP(S) origin without a path or trailing slash.');
  }

  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const requestOrigin = typeof req.get === 'function'
      ? req.get('origin')
      : req.headers?.origin;

    if (requestOrigin !== expectedOrigin) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }

    return next();
  };
}
