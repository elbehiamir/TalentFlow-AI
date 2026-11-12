import { Router } from 'express';
import { pool, logActivity } from './db.js';
import { CANDIDATE_STAGES, cleanString, parseCandidateInput, parseJobInput, parsePositiveId } from './validation.js';
import { calculateSkillMatch } from './matching.js';

const router = Router();

const stages = CANDIDATE_STAGES;

// Preview only: compares structured skill lists without storing candidate data.
router.post('/matching/preview', (req, res) => {
  const { candidateSkills, requiredSkills } = req.body ?? {};
  const result = calculateSkillMatch(candidateSkills, requiredSkills);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ match: result });
});

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
    const parsed = parseCandidateInput(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { name, email, role, stage, score, job_id: jobId } = parsed.value;
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
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid candidate id.' });
    const current = await pool.query('SELECT * FROM candidates WHERE id = $1', [id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Candidate not found.' });

    const parsed = parseCandidateInput(req.body, current.rows[0]);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { name, email, role, stage, score, job_id: jobId } = parsed.value;
    const result = await pool.query(
      `UPDATE candidates SET name=$1, email=$2, role=$3, stage=$4, score=$5, job_id=$6, updated_at=NOW()
       WHERE id=$7 RETURNING id, name, email, role, stage, score, job_id, created_at, updated_at`,
      [name, email, role, stage, score, jobId, id]
    );
    await logActivity('updated', 'candidate', id, `Candidate updated: ${name}`);
    res.json({ candidate: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A candidate with this email already exists.' });
    if (error.code === '23503') return res.status(400).json({ error: 'Selected job does not exist.' });
    next(error);
  }
});

router.delete('/candidates/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid candidate id.' });
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
    const parsed = parseJobInput(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { title, team, location } = parsed.value;
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
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid job id.' });
    const current = await pool.query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Job not found.' });

    const parsed = parseJobInput(req.body, current.rows[0]);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { title, team, location, status } = parsed.value;
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
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid job id.' });
    const result = await pool.query('DELETE FROM jobs WHERE id=$1 RETURNING id, title', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });
    await logActivity('deleted', 'job', id, `Job opening deleted: ${result.rows[0].title}`);
    res.json({ message: 'Job deleted.' });
  } catch (error) { next(error); }
});

router.get('/activity', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id, action, entity_type, entity_id, description, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ activities: result.rows });
  } catch (error) { next(error); }
});

export default router;
