const MAX_SKILLS = 100;
const MAX_SKILL_LENGTH = 80;

function readSkillList(value, fieldName) {
  if (!Array.isArray(value)) {
    return { error: fieldName + ' must be an array of strings.' };
  }
  if (value.length > MAX_SKILLS) {
    return { error: fieldName + ' cannot contain more than ' + MAX_SKILLS + ' skills.' };
  }

  const items = [];
  const seen = new Set();

  for (const raw of value) {
    if (typeof raw !== 'string') {
      return { error: fieldName + ' must contain only strings.' };
    }

    const label = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!label) {
      return { error: fieldName + ' cannot contain empty skills.' };
    }
    if (label.length > MAX_SKILL_LENGTH) {
      return { error: 'Each skill in ' + fieldName + ' must be at most ' + MAX_SKILL_LENGTH + ' characters.' };
    }

    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ label, key });
    }
  }

  return { items };
}

/**
 * Calculates transparent skill coverage using exact, normalized skill names.
 * This is a decision-support preview, not a hiring recommendation.
 */
export function calculateSkillMatch(candidateSkills, requiredSkills) {
  const candidate = readSkillList(candidateSkills, 'candidateSkills');
  if (candidate.error) return candidate;

  const required = readSkillList(requiredSkills, 'requiredSkills');
  if (required.error) return required;
  if (required.items.length === 0) {
    return { error: 'At least one required skill must be provided.' };
  }

  const candidateKeys = new Set(candidate.items.map(item => item.key));
  const requiredKeys = new Set(required.items.map(item => item.key));

  const matchedSkills = required.items
    .filter(item => candidateKeys.has(item.key))
    .map(item => item.label);
  const missingSkills = required.items
    .filter(item => !candidateKeys.has(item.key))
    .map(item => item.label);
  const additionalSkills = candidate.items
    .filter(item => !requiredKeys.has(item.key))
    .map(item => item.label);

  const skillCoveragePercent = Math.round(
    (matchedSkills.length / required.items.length) * 100
  );

  let explanation = 'Matched ' + matchedSkills.length + ' of ' +
    required.items.length + ' required skills.';
  if (missingSkills.length) {
    explanation += ' Missing: ' + missingSkills.join(', ') + '.';
  }
  if (additionalSkills.length) {
    explanation += ' Additional candidate skills are listed separately and do not increase coverage.';
  }

  return {
    skillCoveragePercent,
    matchedCount: matchedSkills.length,
    requiredCount: required.items.length,
    matchedSkills,
    missingSkills,
    additionalSkills,
    method: 'case-insensitive exact match with Unicode NFKC and whitespace normalization',
    explanation,
    limitation: 'No synonyms, proficiency, experience, seniority or context are inferred. This result is not a hiring recommendation.'
  };
}
