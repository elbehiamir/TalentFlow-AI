import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase, pool } from './db.js';
import apiRoutes from './routes.js';
import { createAuthMiddleware, bootstrapAdmin } from './auth.js';
import { createAuthRouter } from './auth-routes.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 random bytes. Generate one with: openssl rand -hex 32');
}
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use((req, res, next) => {
  const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const requestOrigin = req.get('origin');
  if (unsafeMethod && requestOrigin && requestOrigin !== allowedOrigin) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', service: 'TalentFlow AI API' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected', service: 'TalentFlow AI API' });
  }
});

const authenticate = createAuthMiddleware(jwtSecret);
app.use('/api/auth', createAuthRouter({ pool, secret: jwtSecret, authenticate }));
app.use('/api', authenticate, apiRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  try {
    await initializeDatabase();
    const adminCreated = await bootstrapAdmin(pool, process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);
    if (adminCreated) console.log('Bootstrap administrator account created.');
    if (!process.env.BOOTSTRAP_ADMIN_EMAIL && !process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      console.warn('No bootstrap administrator configured. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD for the first startup.');
    }
    app.listen(port, () => console.log(`TalentFlow AI API listening on http://localhost:${port}`));
  } catch (error) {
    console.error('TalentFlow AI startup failed:', error.message);
    process.exit(1);
  }
}

start();
