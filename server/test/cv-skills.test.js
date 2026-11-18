import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCvSkills } from '../src/cv-skills.js';

test('recognizes supported skills and returns them in text order', () => {
  const result = extractCvSkills('Built a React and Node.js app with PostgreSQL, Docker, and REST API.');
  assert.deepEqual(result.skills, ['React', 'Node.js', 'PostgreSQL', 'Docker', 'REST API']);
  assert.equal(result.reviewRequired, true);
});

test('canonicalizes aliases to a single label', () => {
  const result = extractCvSkills('ReactJS, React.js, NodeJS, Postgres, K8s, GCP, PowerBI');
  assert.deepEqual(result.skills, ['React', 'Node.js', 'PostgreSQL', 'Kubernetes', 'Google Cloud', 'Power BI']);
});

test('longer overlapping phrase wins over its shorter skill', () => {
  const result = extractCvSkills('Worked with React Native and React.');
  assert.deepEqual(result.skills, ['React Native', 'React']);
});

test('does not match Java inside JavaScript', () => {
  assert.deepEqual(extractCvSkills('JavaScript development').skills, ['JavaScript']);
});

test('does not match SQL inside NoSQL', () => {
  assert.deepEqual(extractCvSkills('NoSQL systems').skills, []);
});

test('supports punctuation-heavy skills', () => {
  assert.deepEqual(extractCvSkills('C++ and C#; .NET; CI/CD; UI/UX').skills, ['C++', 'C#', '.NET', 'CI/CD', 'UI/UX']);
});

test('deduplicates repeated mentions without changing first-occurrence order', () => {
  assert.deepEqual(extractCvSkills('Python, React, Python, REACT').skills, ['Python', 'React']);
});

test('returns empty suggestions for empty or non-string input', () => {
  assert.deepEqual(extractCvSkills('').skills, []);
  assert.deepEqual(extractCvSkills(null).skills, []);
  assert.deepEqual(extractCvSkills(42).skills, []);
});

test('provides an explicit keyword-only review disclaimer', () => {
  const result = extractCvSkills('Figma and Accessibility');
  assert.match(result.method, /keyword catalog/);
  assert.match(result.disclaimer, /proficiency and experience are not inferred/);
});
