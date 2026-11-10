import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase, pool } from './db.js';
import apiRoutes from './routes.js';

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', service: 'TalentFlow AI API' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected', service: 'TalentFlow AI API' });
  }
});

app.use('/api', apiRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  try {
    await initializeDatabase();
    app.listen(port, () => console.log(`TalentFlow AI API listening on http://localhost:${port}`));
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}

start();
