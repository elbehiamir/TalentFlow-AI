import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE_STAGES,
  JOB_STATUSES,
  cleanString,
  validScore,
  parsePositiveId,
  parseCandidateInput,
  parseJobInput
} from '../src/validation.js';

test('candidate input is trimmed and email is normalized', () => {
  const result = parseCandidateInput({
    name: '  Ada Lovelace  ', email: ' ADA@EXAMPLE.COM ', role: '  Data Analyst  '
  });
  assert.deepEqual(result.value, {
    name: 'Ada Lovelace', email: 'ada@example.com', role: 'Data Analyst',
    stage: 'Applied', score: 0, job_id: null
  });
});

test('candidate input rejects invalid email, stage, score and job id', () => {
  assert.ok(parseCandidateInput({ name: 'A', email: 'not-an-email', role: 'Engineer' }).error);
  assert.ok(parseCandidateInput({ name: 'A', email: 'a@example.com', role: 'Engineer', stage: 'Unknown' }).error);
  assert.ok(parseCandidateInput({ name: 'A', email: 'a@example.com', role: 'Engineer', score: 101 }).error);
  assert.ok(parseCandidateInput({ name: 'A', email: 'a@example.com', role: 'Engineer', job_id: '0' }).error);
});

test('candidate patch preserves fields omitted from the request', () => {
  const current = {
    name: 'Grace Hopper', email: 'grace@example.com', role: 'Backend Engineer',
    stage: 'Screening', score: 82, job_id: '12'
  };
  const result = parseCandidateInput({ stage: 'Interview' }, current);
  assert.deepEqual(result.value, {
    name: 'Grace Hopper', email: 'grace@example.com', role: 'Backend Engineer',
    stage: 'Interview', score: 82, job_id: 12
  });
});

test('candidate can explicitly unlink a job', () => {
  const current = {
    name: 'Katherine Johnson', email: 'k@example.com', role: 'Analyst',
    stage: 'Applied', score: 50, job_id: '4'
  };
  assert.equal(parseCandidateInput({ job_id: null }, current).value.job_id, null);
});

test('job input applies defaults and trims fields', () => {
  assert.deepEqual(parseJobInput({ title: '  Product Designer  ' }).value, {
    title: 'Product Designer', team: 'General', location: 'Tunisia', status: 'Active'
  });
});

test('job patch preserves omitted fields and rejects invalid status', () => {
  const current = { title: 'Frontend Engineer', team: 'Engineering', location: 'Tunis', status: 'Paused' };
  assert.deepEqual(parseJobInput({ status: 'Active' }, current).value, {
    ...current, status: 'Active'
  });
  assert.ok(parseJobInput({ status: 'Archived' }, current).error);
  assert.ok(parseJobInput({ title: '   ' }).error);
});

test('ids accept positive safe integers only', () => {
  assert.equal(parsePositiveId('42'), 42);
  assert.equal(parsePositiveId(7), 7);
  for (const value of ['', '0', '-1', '1.5', '01', 'abc', '9007199254740992']) {
    assert.equal(parsePositiveId(value), null);
  }
});

test('shared helpers expose stable allowed values and boundaries', () => {
  assert.ok(CANDIDATE_STAGES.includes('Interview'));
  assert.ok(JOB_STATUSES.includes('Closed'));
  assert.equal(cleanString('  x  ', 1), 'x');
  assert.equal(validScore(100), 100);
  assert.equal(validScore(100.5), null);
});

test('non-object request bodies are rejected', () => {
  assert.ok(parseCandidateInput(null).error);
  assert.ok(parseCandidateInput([]).error);
  assert.ok(parseJobInput('job').error);
});
