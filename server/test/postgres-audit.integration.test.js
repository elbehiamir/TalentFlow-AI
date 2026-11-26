import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { createAuthMiddleware, bootstrapAdmin } from '../src/auth.js';
import { createAuthRouter } from '../src/auth-routes.js';
import { createOriginGuard } from '../src/origin-guard.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const SECRET = 'postgres-audit-test-secret-with-at-least-32-bytes';
const ORIGIN = 'http://localhost:5173';
const ADMIN = {
  email: 'audit-admin@talentflow.test',
  password: 'Audit-admin-password-2026'
};
const RECRUITER_PASSWORD = 'Audit-recruiter-password-2026';

test('PostgreSQL audit events identify their actor and roll back with recruitment changes', {
  skip: !databaseUrl ? 'Set TEST_DATABASE_URL to a disposable PostgreSQL database.' : false
}, async t => {
  const adminPool = new Pool({ connectionString: databaseUrl });
  const schema = 'talentflow_audit_' + randomUUID().replaceAll('-', '');
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let schemaCreated = false;
  let appPool;
  let server;

  t.after(async () => {
    try {
      if (server) {
        await new Promise(resolve => {
          server.close(resolve);
          server.closeAllConnections?.();
        });
      }
      if (appPool) await appPool.end();
      if (schemaCreated) {
        await adminPool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      }
    } finally {
      await adminPool.end();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  await adminPool.query('CREATE SCHEMA "' + schema + '"');
  schemaCreated = true;

  const schemaUrl = new URL(databaseUrl);
  schemaUrl.searchParams.set('options', '-c search_path=' + schema);
  process.env.DATABASE_URL = schemaUrl.toString();

  const database = await import('../src/db.js');
  appPool = database.pool;
  await database.initializeDatabase(appPool);
  assert.equal(await bootstrapAdmin(appPool, ADMIN.email, ADMIN.password), true);

  const apiRoutes = (await import('../src/routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use(createOriginGuard(ORIGIN));

  const authenticate = createAuthMiddleware(SECRET, appPool);
  app.use('/api/auth', createAuthRouter({
    pool: appPool,
    secret: SECRET,
    authenticate
  }));
  app.use('/api', authenticate, apiRoutes);
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: 'Internal server error.' });
  });

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';

  async function request(path, { method = 'GET', cookie, body } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (method !== 'GET' && method !== 'HEAD') headers.Origin = ORIGIN;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(baseUrl + path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  }

  async function signIn(email, password) {
    const { response, payload } = await request('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    assert.equal(response.status, 200, JSON.stringify(payload));
    const match = (response.headers.get('set-cookie') ?? '').match(/^talentflow_session=([^;]+)/);
    assert.ok(match, 'successful login should issue a session cookie');
    return 'talentflow_session=' + match[1];
  }

  const adminCookie = await signIn(ADMIN.email, ADMIN.password);
  const suffix = randomUUID().slice(0, 8);
  const recruiterEmail = 'audit-recruiter+' + suffix + '@example.test';
  const recruiterCreated = await request('/users', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      email: recruiterEmail,
      password: RECRUITER_PASSWORD,
      role: 'recruiter'
    }
  });
  assert.equal(recruiterCreated.response.status, 201, JSON.stringify(recruiterCreated.payload));

  const recruiterCookie = await signIn(recruiterEmail, RECRUITER_PASSWORD);
  const recruiterId = recruiterCreated.payload.user.id;
  const candidateEmail = 'audit-candidate+' + suffix + '@example.test';

  const candidateCreated = await request('/candidates', {
    method: 'POST',
    cookie: recruiterCookie,
    body: {
      name: 'Synthetic Audit Candidate',
      email: candidateEmail,
      role: 'Platform Engineer',
      stage: 'Applied',
      score: 0
    }
  });
  assert.equal(candidateCreated.response.status, 201, JSON.stringify(candidateCreated.payload));
  const candidateId = candidateCreated.payload.candidate.id;

  await appPool.query(`
    CREATE FUNCTION reject_candidate_audit_event() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.entity_type = 'candidate' AND NEW.action IN ('created', 'updated') THEN
        RAISE EXCEPTION 'forced audit insert failure';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER reject_candidate_audit_event
      BEFORE INSERT ON activity_logs
      FOR EACH ROW EXECUTE FUNCTION reject_candidate_audit_event();
  `);

  const rollbackEmail = 'audit-rollback+' + suffix + '@example.test';
  const failedCreate = await request('/candidates', {
    method: 'POST',
    cookie: recruiterCookie,
    body: {
      name: 'Synthetic Rollback Candidate',
      email: rollbackEmail,
      role: 'Platform Engineer'
    }
  });
  assert.equal(failedCreate.response.status, 500);

  const rolledBackCreate = await appPool.query(
    'SELECT id FROM candidates WHERE email = $1',
    [rollbackEmail]
  );
  assert.equal(rolledBackCreate.rowCount, 0, 'candidate insert must roll back when its audit insert fails');

  const failedUpdate = await request('/candidates/' + candidateId, {
    method: 'PATCH',
    cookie: recruiterCookie,
    body: { stage: 'Interview' }
  });
  assert.equal(failedUpdate.response.status, 500);

  const unchangedCandidate = await appPool.query(
    'SELECT stage FROM candidates WHERE id = $1',
    [candidateId]
  );
  assert.equal(unchangedCandidate.rows[0].stage, 'Applied', 'candidate update must roll back when its audit insert fails');

  await appPool.query(`
    DROP TRIGGER reject_candidate_audit_event ON activity_logs;
    DROP FUNCTION reject_candidate_audit_event();
  `);

  const successfulUpdate = await request('/candidates/' + candidateId, {
    method: 'PATCH',
    cookie: recruiterCookie,
    body: { stage: 'Interview' }
  });
  assert.equal(successfulUpdate.response.status, 200, JSON.stringify(successfulUpdate.payload));

  const activities = await request('/activity', { cookie: recruiterCookie });
  assert.equal(activities.response.status, 200);
  assert.equal(activities.payload.activities.length, 2);
  assert.ok(activities.payload.activities.every(activity => activity.user_id === recruiterId));
  assert.ok(activities.payload.activities.every(activity => activity.actor_email === recruiterEmail));

  const persistedActors = await appPool.query(
    `SELECT a.action, a.user_id, u.email AS actor_email
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id`
  );
  assert.deepEqual(persistedActors.rows.map(row => row.action), ['created', 'updated']);
  assert.ok(persistedActors.rows.every(row => row.user_id === recruiterId));
  assert.ok(persistedActors.rows.every(row => row.actor_email === recruiterEmail));
});
