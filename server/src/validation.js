export const CANDIDATE_STAGES = Object.freeze([
  'Applied', 'Screening', 'Review', 'Interview', 'Shortlisted', 'Offer', 'Hired', 'Rejected'
]);

export const JOB_STATUSES = Object.freeze(['Active', 'Paused', 'Closed']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanString(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function validScore(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
}

export function parsePositiveId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCandidateInput(input, current = null) {
  if (!isRecord(input)) return { error: 'Invalid candidate data.' };

  const get = key => input[key] === undefined && current ? current[key] : input[key];
  const name = cleanString(get('name'));
  const email = cleanString(get('email'), 254).toLowerCase();
  const role = cleanString(get('role'));
  const stage = cleanString(get('stage') ?? 'Applied', 30);
  const score = validScore(get('score') ?? 0);
  const rawJobId = get('job_id');
  const jobId = rawJobId === undefined || rawJobId === null || rawJobId === ''
    ? null
    : parsePositiveId(rawJobId);

  if (!name || !email || !role || !EMAIL_PATTERN.test(email)) {
    return { error: 'Name, a valid email and target role are required.' };
  }
  if (!CANDIDATE_STAGES.includes(stage) || score === null ||
      (rawJobId !== undefined && rawJobId !== null && rawJobId !== '' && jobId === null)) {
    return { error: 'Invalid stage, score or job.' };
  }

  return { value: { name, email, role, stage, score, job_id: jobId } };
}

export function parseJobInput(input, current = null) {
  if (!isRecord(input)) return { error: 'Invalid job data.' };

  const get = key => input[key] === undefined && current ? current[key] : input[key];
  const title = cleanString(get('title'));
  const team = cleanString(get('team') || 'General', 100);
  const location = cleanString(get('location') || 'Tunisia');
  const status = cleanString(get('status') || 'Active', 20);

  if (!title || !team || !location || !JOB_STATUSES.includes(status)) {
    return { error: 'Invalid job data.' };
  }

  return { value: { title, team, location, status } };
}
