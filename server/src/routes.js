import { Router } from 'express';
import { pool, logActivity } from './db.js';

const router = Router();
const stages = ['Applied', 'Screening', 'Review', 'Interview', 'Shortlisted', 'Offer', 'Hired', 'Rejected'];
const jobStatuses = ['Active', 'Paused', 'Closed'];

function cleanString(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validScore(value) {
  const score = Number(value ?? 0);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
}

// Dashboard data is calculated from PostgreSQL, never from hard-coded demo metrics.
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [candidateCount, jobCount, interviews, stagesResult, recent, sources] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM candidates'),
      pool.query("SELECT COUNT(*)::int AS total FROM jobs WHERE status = 'Active'"),
      pool.query("SELECT COUNT(*)::int AS total FROM candidates WHERE stage = 'Interview'"),
      pool.query('SELECT stage, COUNT(*)::int AS total FROM candidates GROUP BY stage ORDER BY total DESC'),
      pool.query(`SELECT c.id, c.name, c.role, c.stage, c.score, c.created_at, j.title AS job_title
        FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id
        ORDER BY c.created_at DESC LIMIT 8`),
      pool.query('SELECT COUNT(*)::int AS total FROM candidates')
    ]);
    res.json({
      metrics: {
        totalCandidates: candidateCount.rows[0].total,
        openPositions: jobCount.rows[0].total,
        interviewsScheduled: interviews.rows[0].total
      },
      pipeline: stagesResult.rows,
      recentCandidates: recent.rows,
      sourceCount: sources.rows[0].total
    });
  } catch (error) { next(error); }
});

// Candidates
router.get('/candidates', async (req, res, next) => {
  try {
    const search = cleanString(req.query.search, 160);
    const stage = cleanString(req.query.stage, 30);
    if (stage && !stages.includes(stage)) return res.status(400).json({ error: 'Invalid candidate stage.' });
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.role, c.stage, c.score, c.job_id, c.created_at, c.updated_at, j.title AS job_title
       FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id
       WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%' OR c.role ILIKE '%' || $1 || '%')
         AND ($2 = '' OR c.stage = $2)
       ORDER BY c.created_at DESC`,
      [search, stage]
    );
    res.json({ candidates: result.rows });
  } catch (error) { next(error); }
});

router.post('/candidates', async (req, res, next) => {
  try {
    const name = cleanString(req.body.name);
    const email = cleanString(req.body.email, 254).toLowerCase();
    const role = cleanString(req.body.role);
    const stage = cleanString(req.body.stage || 'Applied', 30);
    const score = validScore(req.body.score);
    const jobId = req.body.job_id ? Number(req.body.job_id) : null;
    if (!name || !email || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Name, a valid email and target role are required.' });
    }
    if (!stages.includes(stage) || score === null || (jobId !== null && (!Number.isInteger(jobId) || jobId < 1))) {
      return res.status(400).json({ error: 'Invalid stage, score or job.' });
    }
    const result = await pool.query(
      `INSERT INTO candidates (name, email, role, stage, score, job_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, stage, score, job_id, created_at, updated_at`,
      [name, email, role, stage, score, jobId]
    );
    await logActivity('created', 'candidate', result.rows[0].id, `Candidate added: ${name}`);
    res.status(201).json({ candidate: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A candidate with this email already exists.' });
    if (error.code === '23503') return res.status(400).json({ error: 'Selected job does not exist.' });
    next(error);
  }
});

router.patch('/candidates/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, email, role, stage, score, job_id: jobIdRaw } = req.body;
    const current = await pool.query('SELECT * FROM candidates WHERE id = $1', [id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Candidate not found.' });
    const old = current.rows[0];
    const nextName = name === undefined ? old.name : cleanString(name);
    const nextEmail = email === undefined ? old.email : cleanString(email, 254).toLowerCase();
    const nextRole = role === undefined ? old.role : cleanString(role);
    const nextStage = stage === undefined ? old.stage : cleanString(stage, 30);
    const nextScore = score === undefined ? old.score : validScore(score);
    const nextJobId = jobIdRaw === undefined ? old.job_id : (jobIdRaw === '' || jobIdRaw === null ? null : Number(jobIdRaw));
    if (!nextName || !nextRole || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail) ||
        !stages.includes(nextStage) || nextScore === null ||
        (nextJobId !== null && (!Number.isInteger(nextJobId) || nextJobId < 1))) {
      return res.status(400).json({ error: 'Invalid candidate data.' });
    }
    const result = await pool.query(
      `UPDATE candidates SET name=$1, email=$2, role=$3, stage=$4, score=$5, job_id=$6, updated_at=NOW()
       WHERE id=$7 RETURNING id, name, email, role, stage, score, job_id, created_at, updated_at`,
      [nextName, nextEmail, nextRole, nextStage, nextScore, nextJobId, id]
    );
    await logActivity('updated', 'candidate', id, `Candidate updated: ${nextName}`);
    res.json({ candidate: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A candidate with this email already exists.' });
    if (error.code === '23503') return res.status(400).json({ error: 'Selected job does not exist.' });
    next(error);
  }
});

router.delete('/candidates/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query('DELETE FROM candidates WHERE id=$1 RETURNING id, name', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Candidate not found.' });
    await logActivity('deleted', 'candidate', id, `Candidate deleted: ${result.rows[0].name}`);
    res.json({ message: 'Candidate deleted.' });
  } catch (error) { next(error); }
});

// Job openings
router.get('/jobs', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT j.id, j.title, j.team, j.location, j.status, j.created_at,
       COUNT(c.id)::int AS applicant_count
       FROM jobs j LEFT JOIN candidates c ON c.job_id=j.id
       GROUP BY j.id ORDER BY j.created_at DESC`
    );
    res.json({ jobs: result.rows });
  } catch (error) { next(error); }
});

router.post('/jobs', async (req, res, next) => {
  try {
    const title = cleanString(req.body.title);
    const team = cleanString(req.body.team || 'General', 100);
    const location = cleanString(req.body.location || 'Tunisia');
    if (!title) return res.status(400).json({ error: 'Job title is required.' });
    const result = await pool.query(
      'INSERT INTO jobs (title, team, location) VALUES ($1,$2,$3) RETURNING *',
      [title, team, location]
    );
    await logActivity('created', 'job', result.rows[0].id, `Job opening created: ${title}`);
    res.status(201).json({ job: { ...result.rows[0], applicant_count: 0 } });
  } catch (error) { next(error); }
});

router.patch('/jobs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await pool.query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Job not found.' });
    const title = req.body.title === undefined ? current.rows[0].title : cleanString(req.body.title);
    const team = req.body.team === undefined ? current.rows[0].team : cleanString(req.body.team, 100);
    const location = req.body.location === undefined ? current.rows[0].location : cleanString(req.body.location);
    const status = req.body.status === undefined ? current.rows[0].status : cleanString(req.body.status, 20);
    if (!title || !jobStatuses.includes(status)) return res.status(400).json({ error: 'Invalid job data.' });
    const result = await pool.query(
      'UPDATE jobs SET title=$1, team=$2, location=$3, status=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [title, team, location, status, id]
    );
    await logActivity('updated', 'job', id, `Job opening updated: ${title}`);
    res.json({ job: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/jobs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query('DELETE FROM jobs WHERE id=$1 RETURNING id, title', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });
    await logActivity('deleted', 'job', id, `Job opening deleted: ${result.rows[0].title}`);
    res.json({ message: 'Job opening deleted.' });
  } catch (error) { next(error); }
});

router.get('/activity', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id, action, entity_type, entity_id, description, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ activities: result.rows });
  } catch (error) { next(error); }
});

export default router;
