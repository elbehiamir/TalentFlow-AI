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
const SECRET = 'postgres-recruitment-test-secret-with-32-bytes';
const ORIGIN = 'http://localhost:5173';
const ADMIN = {
  email: 'admin@talentflow.test',
  password: 'Postgres-admin-password-2026'
};
const RECRUITER_PASSWORD = 'Recruiter-test-password-2026';
const MANAGER_PASSWORD = 'Manager-test-password-2026';

test('PostgreSQL recruitment API persists CRUD and enforces role permissions', {
  skip: !databaseUrl ? 'Set TEST_DATABASE_URL to a disposable PostgreSQL database.' : false
}, async t => {
  const adminPool = new Pool({ connectionString: databaseUrl });
  const schema = 'talentflow_recruitment_' + randomUUID().replaceAll('-', '');
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

  const anonymousCandidates = await request('/candidates');
  assert.equal(anonymousCandidates.response.status, 401);
  const anonymousJobs = await request('/jobs');
  assert.equal(anonymousJobs.response.status, 401);

  const adminCookie = await signIn(ADMIN.email, ADMIN.password);
  const suffix = randomUUID().slice(0, 8);
  const recruiterEmail = 'recruiter+' + suffix + '@example.test';
  const managerEmail = 'manager+' + suffix + '@example.test';

  const recruiterCreated = await request('/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { email: recruiterEmail, password: RECRUITER_PASSWORD, role: 'recruiter' }
  });
  assert.equal(recruiterCreated.response.status, 201, JSON.stringify(recruiterCreated.payload));

  const managerCreated = await request('/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { email: managerEmail, password: MANAGER_PASSWORD, role: 'hiring_manager' }
  });
  assert.equal(managerCreated.response.status, 201, JSON.stringify(managerCreated.payload));

  const recruiterCookie = await signIn(recruiterEmail, RECRUITER_PASSWORD);
  const managerCookie = await signIn(managerEmail, MANAGER_PASSWORD);

  for (const path of ['/candidates', '/jobs', '/dashboard']) {
    const readable = await request(path, { cookie: managerCookie });
    assert.equal(readable.response.status, 200, path + ' should be readable by hiring managers');
  }

  const managerActivity = await request('/activity', { cookie: managerCookie });
  assert.equal(managerActivity.response.status, 403);

  const managerCreateJob = await request('/jobs', {
    method: 'POST',
    cookie: managerCookie,
    body: { title: 'Blocked role', team: 'Engineering', location: 'Remote' }
  });
  assert.equal(managerCreateJob.response.status, 403);

  const managerCreateCandidate = await request('/candidates', {
    method: 'POST',
    cookie: managerCookie,
    body: { name: 'Synthetic Candidate', email: 'blocked@example.test', role: 'Engineer' }
  });
  assert.equal(managerCreateCandidate.response.status, 403);

  const jobCreated = await request('/jobs', {
    method: 'POST',
    cookie: recruiterCookie,
    body: { title: 'Platform Engineer', team: 'Engineering', location: 'Remote' }
  });
  assert.equal(jobCreated.response.status, 201, JSON.stringify(jobCreated.payload));
  const jobId = jobCreated.payload.job.id;

  const candidateEmail = 'candidate+' + suffix + '@example.test';
  const candidateCreated = await request('/candidates', {
    method: 'POST',
    cookie: recruiterCookie,
    body: {
      name: 'Synthetic Candidate',
      email: candidateEmail,
      role: 'Platform Engineer',
      stage: 'Applied',
      score: 0,
      job_id: jobId
    }
  });
  assert.equal(candidateCreated.response.status, 201, JSON.stringify(candidateCreated.payload));
  const candidateId = candidateCreated.payload.candidate.id;

  for (const [path, method, body] of [
    ['/candidates/' + candidateId, 'PATCH', { stage: 'Interview' }],
    ['/jobs/' + jobId, 'PATCH', { status: 'Paused' }],
    ['/candidates/' + candidateId, 'DELETE', undefined],
    ['/jobs/' + jobId, 'DELETE', undefined]
  ]) {
    const denied = await request(path, { method, cookie: managerCookie, body });
    assert.equal(denied.response.status, 403, method + ' ' + path + ' must be denied to hiring managers');
  }

  const candidateUpdated = await request('/candidates/' + candidateId, {
    method: 'PATCH',
    cookie: recruiterCookie,
    body: { stage: 'Interview' }
  });
  assert.equal(candidateUpdated.response.status, 200, JSON.stringify(candidateUpdated.payload));
  assert.equal(candidateUpdated.payload.candidate.stage, 'Interview');

  const jobUpdated = await request('/jobs/' + jobId, {
    method: 'PATCH',
    cookie: recruiterCookie,
    body: { status: 'Paused' }
  });
  assert.equal(jobUpdated.response.status, 200, JSON.stringify(jobUpdated.payload));
  assert.equal(jobUpdated.payload.job.status, 'Paused');

  const recruiterCannotDeleteCandidate = await request('/candidates/' + candidateId, {
    method: 'DELETE',
    cookie: recruiterCookie
  });
  assert.equal(recruiterCannotDeleteCandidate.response.status, 403);

  const filteredCandidates = await request('/candidates?search=Synthetic&stage=Interview', {
    cookie: managerCookie
  });
  assert.equal(filteredCandidates.response.status, 200);
  assert.equal(filteredCandidates.payload.candidates.length, 1);
  assert.equal(filteredCandidates.payload.candidates[0].email, candidateEmail);

  const jobsWithApplicants = await request('/jobs', { cookie: managerCookie });
  assert.equal(jobsWithApplicants.payload.jobs.length, 1);
  assert.equal(Number(jobsWithApplicants.payload.jobs[0].applicant_count), 1);

  const recruiterActivity = await request('/activity', { cookie: recruiterCookie });
  assert.equal(recruiterActivity.response.status, 200);
  assert.equal(recruiterActivity.payload.activities.length, 4);
  assert.ok(recruiterActivity.payload.activities.every(activity => ['candidate', 'job'].includes(activity.entity_type)));

  const jobDeleted = await request('/jobs/' + jobId, {
    method: 'DELETE',
    cookie: adminCookie
  });
  assert.equal(jobDeleted.response.status, 200);

  const candidateAfterJobDelete = await request('/candidates', { cookie: adminCookie });
  assert.equal(candidateAfterJobDelete.payload.candidates.length, 1);
  assert.equal(candidateAfterJobDelete.payload.candidates[0].job_id, null);

  const candidateDeleted = await request('/candidates/' + candidateId, {
    method: 'DELETE',
    cookie: adminCookie
  });
  assert.equal(candidateDeleted.response.status, 200);

  const finalCandidates = await request('/candidates', { cookie: adminCookie });
  const finalJobs = await request('/jobs', { cookie: adminCookie });
  assert.equal(finalCandidates.payload.candidates.length, 0);
  assert.equal(finalJobs.payload.jobs.length, 0);

  const finalActivity = await request('/activity', { cookie: adminCookie });
  assert.equal(finalActivity.payload.activities.length, 11);
  assert.equal(finalActivity.payload.activities.filter(activity => ['candidate', 'job'].includes(activity.entity_type)).length, 6);
  assert.equal(finalActivity.payload.activities.filter(activity => activity.entity_type === 'auth' && activity.action === 'login').length, 3);
  assert.equal(finalActivity.payload.activities.filter(activity => activity.entity_type === 'user' && activity.action === 'created').length, 2);
  assert.equal(finalActivity.payload.actors.length, 3);
});
