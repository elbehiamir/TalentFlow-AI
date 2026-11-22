import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ALLOWED_ROLES = new Set(['admin', 'recruiter', 'hiring_manager']);
const EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SESSION_COOKIE_NAME = 'talentflow_session';

// Valid scrypt hash used only to keep unknown-email login attempts on the same verification path.
export const DUMMY_PASSWORD_HASH = 'scrypt$16384$8$1$j206G5xOcvCl2MGz5vcJKg$cpDTY6x8geZieT9_dngLSgYKr9l9Z2mAu8BG_7DDLzwBNkz6uhWZQrSG6twKVQc2eH1KQGKZdpfG5A6SW-XDZg';

function assertSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random data.');
  }
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Password must contain between 12 and 128 characters.');
  }

  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return ['scrypt', SCRYPT_OPTIONS.N, SCRYPT_OPTIONS.r, SCRYPT_OPTIONS.p,
    salt.toString('base64url'), Buffer.from(derived).toString('base64url')].join('$');
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' ||
      Number(parts[1]) !== SCRYPT_OPTIONS.N ||
      Number(parts[2]) !== SCRYPT_OPTIONS.r ||
      Number(parts[3]) !== SCRYPT_OPTIONS.p) return false;

  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = Buffer.from(await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createAccessToken(user, secret, now = Date.now(), sessionId = randomUUID()) {
  assertSecret(secret);
  const id = Number(user?.id);
  if (!Number.isSafeInteger(id) || id < 1 || !ALLOWED_ROLES.has(user?.role)) {
    throw new Error('Cannot create a session for an invalid user.');
  }
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Cannot create a session with an invalid session id.');
  }

  const issuedAt = Math.floor(now / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: String(id),
    email: normalizeEmail(user.email),
    role: user.role,
    jti: sessionId,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS
  })).toString('base64url');
  const signingInput = header + '.' + payload;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return signingInput + '.' + signature;
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  assertSecret(secret);
  if (typeof token !== 'string' || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) return null;

  const signingInput = parts[0] + '.' + parts[1];
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  let supplied;
  let header;
  let payload;

  try {
    supplied = Buffer.from(parts[2], 'base64url');
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

  const id = Number(payload.sub);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(id) || id < 1 ||
      typeof payload.email !== 'string' || !EMAIL_PATTERN.test(payload.email) ||
      !ALLOWED_ROLES.has(payload.role) ||
      typeof payload.jti !== 'string' || !SESSION_ID_PATTERN.test(payload.jti) ||
      !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds ||
      payload.exp - payload.iat > SESSION_TTL_SECONDS) return null;

  return { id, email: payload.email, role: payload.role, sessionId: payload.jti };
}

function readSessionCookie(req) {
  const header = req.headers?.cookie;
  if (typeof header !== 'string') return '';
  const prefix = SESSION_COOKIE_NAME + '=';
  const entry = header.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

export function createAuthMiddleware(secret, pool) {
  assertSecret(secret);
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('A PostgreSQL pool is required for revocable session authentication.');
  }

  return async (req, res, next) => {
    const claims = verifyAccessToken(readSessionCookie(req), secret);
    if (!claims) return res.status(401).json({ error: 'Authentication required. Please sign in.' });

    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.role
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1
           AND s.user_id = $2
           AND s.revoked_at IS NULL
           AND s.expires_at > NOW()`,
        [claims.sessionId, claims.id]
      );
      const account = result.rows?.[0];
      const id = Number(account?.id);
      if (!account || !Number.isSafeInteger(id) || id < 1 ||
          !EMAIL_PATTERN.test(account.email) || !ALLOWED_ROLES.has(account.role)) {
        return res.status(401).json({ error: 'Authentication required. Please sign in.' });
      }

      req.user = { id, email: normalizeEmail(account.email), role: account.role };
      req.sessionId = claims.sessionId;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export async function bootstrapAdmin(pool, emailValue, password) {
  if (!emailValue && !password) return false;
  if (!emailValue || !password) {
    throw new Error('Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or leave both empty.');
  }

  const email = normalizeEmail(emailValue);
  if (!EMAIL_PATTERN.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) return false;

  const passwordHash = await hashPassword(password);
  try {
    await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
      [email, passwordHash, 'admin']
    );
    return true;
  } catch (error) {
    if (error.code === '23505') return false;
    throw error;
  }
}
