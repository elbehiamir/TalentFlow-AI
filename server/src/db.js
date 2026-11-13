import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Configure it in server/.env before starting the API.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      team VARCHAR(100) NOT NULL DEFAULT 'General',
      location VARCHAR(160) NOT NULL DEFAULT 'Tunisia',
      status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Paused', 'Closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'recruiter', 'hiring_manager')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      role VARCHAR(160) NOT NULL,
      stage VARCHAR(30) NOT NULL DEFAULT 'Applied'
        CHECK (stage IN ('Applied', 'Screening', 'Review', 'Interview', 'Shortlisted', 'Offer', 'Hired', 'Rejected')),
      score SMALLINT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
      job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id BIGINT,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS candidates_stage_idx ON candidates(stage);
    CREATE INDEX IF NOT EXISTS candidates_job_idx ON candidates(job_id);
    CREATE INDEX IF NOT EXISTS candidates_created_idx ON candidates(created_at DESC);
    CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
  `);
}

export async function logActivity(action, entityType, entityId, description) {
  await pool.query(
    'INSERT INTO activity_logs (action, entity_type, entity_id, description) VALUES ($1, $2, $3, $4)',
    [action, entityType, entityId ?? null, description]
  );
}
