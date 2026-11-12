import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSkillMatch } from '../src/matching.js';

test('calculates exact skill coverage and explains missing skills', () => {
  const result = calculateSkillMatch(
    ['React', 'Node.js', 'Accessibility'],
    ['React', 'PostgreSQL', 'Node.js']
  );

  assert.equal(result.skillCoveragePercent, 67);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.requiredCount, 3);
  assert.deepEqual(result.matchedSkills, ['React', 'Node.js']);
  assert.deepEqual(result.missingSkills, ['PostgreSQL']);
  assert.deepEqual(result.additionalSkills, ['Accessibility']);
  assert.match(result.explanation, /Matched 2 of 3 required skills/);
  assert.match(result.explanation, /Missing: PostgreSQL/);
});

test('normalizes case, whitespace and duplicate skill labels', () => {
  const result = calculateSkillMatch(
    ['  REACT  ', 'react', 'TypeScript'],
    ['React', '  TYPESCRIPT  ', 'React']
  );

  assert.equal(result.skillCoveragePercent, 100);
  assert.equal(result.requiredCount, 2);
  assert.deepEqual(result.matchedSkills, ['React', 'TYPESCRIPT']);
  assert.deepEqual(result.missingSkills, []);
});

test('returns zero coverage when the candidate has no listed skills', () => {
  const result = calculateSkillMatch([], ['Python', 'SQL']);
  assert.equal(result.skillCoveragePercent, 0);
  assert.deepEqual(result.matchedSkills, []);
  assert.deepEqual(result.missingSkills, ['Python', 'SQL']);
});

test('requires at least one required skill', () => {
  assert.match(calculateSkillMatch([], []).error, /At least one required skill/);
});

test('rejects non-array and non-string skill input', () => {
  assert.match(calculateSkillMatch('React', ['React']).error, /candidateSkills must be an array/);
  assert.match(calculateSkillMatch([], 'React').error, /requiredSkills must be an array/);
  assert.match(calculateSkillMatch([42], ['React']).error, /candidateSkills must contain only strings/);
});

test('rejects empty and overlong skill labels', () => {
  assert.match(calculateSkillMatch(['  '], ['React']).error, /cannot contain empty skills/);
  assert.match(calculateSkillMatch([], ['x'.repeat(81)]).error, /at most 80 characters/);
});

test('limits each skill list to 100 entries', () => {
  const tooMany = Array.from({ length: 101 }, (_, index) => 'Skill ' + index);
  assert.match(calculateSkillMatch(tooMany, ['Skill 1']).error, /more than 100 skills/);
});
