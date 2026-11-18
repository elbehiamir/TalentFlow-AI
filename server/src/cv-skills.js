const SKILL_CATALOG = [
  { label: 'React Native', aliases: ['React Native', 'ReactNative'] },
  { label: 'Next.js', aliases: ['Next.js', 'NextJS'] },
  { label: 'Node.js', aliases: ['Node.js', 'NodeJS'] },
  { label: 'Express', aliases: ['Express', 'Express.js'] },
  { label: 'NestJS', aliases: ['NestJS', 'Nest.js'] },
  { label: 'Spring Boot', aliases: ['Spring Boot'] },
  { label: 'React', aliases: ['React', 'ReactJS', 'React.js'] },
  { label: 'TypeScript', aliases: ['TypeScript'] },
  { label: 'JavaScript', aliases: ['JavaScript'] },
  { label: 'Vue', aliases: ['Vue', 'Vue.js'] },
  { label: 'Angular', aliases: ['Angular'] },
  { label: 'Vite', aliases: ['Vite'] },
  { label: 'HTML', aliases: ['HTML', 'HTML5'] },
  { label: 'CSS', aliases: ['CSS', 'CSS3'] },
  { label: 'Tailwind CSS', aliases: ['Tailwind CSS', 'Tailwind'] },
  { label: 'Bootstrap', aliases: ['Bootstrap'] },
  { label: 'Python', aliases: ['Python'] },
  { label: 'Java', aliases: ['Java'] },
  { label: 'C#', aliases: ['C#', 'C Sharp'] },
  { label: 'C++', aliases: ['C++', 'Cpp'] },
  { label: 'PHP', aliases: ['PHP'] },
  { label: 'Ruby', aliases: ['Ruby'] },
  { label: 'Swift', aliases: ['Swift'] },
  { label: 'Kotlin', aliases: ['Kotlin'] },
  { label: 'SQL', aliases: ['SQL'] },
  { label: 'PostgreSQL', aliases: ['PostgreSQL', 'Postgres'] },
  { label: 'MySQL', aliases: ['MySQL'] },
  { label: 'MongoDB', aliases: ['MongoDB', 'Mongo'] },
  { label: 'Redis', aliases: ['Redis'] },
  { label: 'GraphQL', aliases: ['GraphQL'] },
  { label: 'REST API', aliases: ['REST API', 'RESTful API'] },
  { label: 'Docker', aliases: ['Docker'] },
  { label: 'Kubernetes', aliases: ['Kubernetes', 'K8s'] },
  { label: 'Git', aliases: ['Git'] },
  { label: 'GitHub', aliases: ['GitHub'] },
  { label: 'Linux', aliases: ['Linux'] },
  { label: 'AWS', aliases: ['AWS', 'Amazon Web Services'] },
  { label: 'Azure', aliases: ['Azure', 'Microsoft Azure'] },
  { label: 'Google Cloud', aliases: ['Google Cloud', 'GCP'] },
  { label: 'CI/CD', aliases: ['CI/CD'] },
  { label: 'Jest', aliases: ['Jest'] },
  { label: 'Vitest', aliases: ['Vitest'] },
  { label: 'Playwright', aliases: ['Playwright'] },
  { label: 'Cypress', aliases: ['Cypress'] },
  { label: 'Selenium', aliases: ['Selenium'] },
  { label: 'Figma', aliases: ['Figma'] },
  { label: 'UI/UX', aliases: ['UI/UX', 'UX/UI'] },
  { label: 'Agile', aliases: ['Agile'] },
  { label: 'Scrum', aliases: ['Scrum'] },
  { label: 'Jira', aliases: ['Jira'] },
  { label: 'Excel', aliases: ['Excel', 'Microsoft Excel'] },
  { label: 'Power BI', aliases: ['Power BI', 'PowerBI'] },
  { label: 'Tableau', aliases: ['Tableau'] },
  { label: 'Machine Learning', aliases: ['Machine Learning', 'ML'] },
  { label: 'Deep Learning', aliases: ['Deep Learning'] },
  { label: 'NLP', aliases: ['NLP', 'Natural Language Processing'] },
  { label: 'TensorFlow', aliases: ['TensorFlow'] },
  { label: 'PyTorch', aliases: ['PyTorch'] },
  { label: 'Pandas', aliases: ['Pandas'] },
  { label: 'NumPy', aliases: ['NumPy'] },
  { label: 'OpenCV', aliases: ['OpenCV'] },
  { label: 'FastAPI', aliases: ['FastAPI'] },
  { label: 'Flask', aliases: ['Flask'] },
  { label: 'Django', aliases: ['Django'] },
  { label: 'Laravel', aliases: ['Laravel'] },
  { label: '.NET', aliases: ['.NET', 'DotNet'] },
  { label: 'Flutter', aliases: ['Flutter'] },
  { label: 'Android', aliases: ['Android'] },
  { label: 'iOS', aliases: ['iOS'] },
  { label: 'Firebase', aliases: ['Firebase'] },
  { label: 'Supabase', aliases: ['Supabase'] },
  { label: 'Prisma', aliases: ['Prisma'] },
  { label: 'Sequelize', aliases: ['Sequelize'] },
  { label: 'OAuth', aliases: ['OAuth', 'OAuth2'] },
  { label: 'JWT', aliases: ['JWT', 'JSON Web Token'] },
  { label: 'Cybersecurity', aliases: ['Cybersecurity', 'Cyber Security'] },
  { label: 'Networking', aliases: ['Networking', 'Computer Networks'] },
  { label: 'Accessibility', aliases: ['Accessibility', 'A11y'] }
];

function escapeRegExp(value) {
  return Array.from(value, character => {
    return '\\^$.*+?()[]{}|'.includes(character) ? '\\' + character : character;
  }).join('');
}

const SKILL_PATTERNS = SKILL_CATALOG.flatMap(skill =>
  skill.aliases.map(alias => ({
    label: skill.label,
    alias,
    pattern: new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegExp(alias) + '(?![\\p{L}\\p{N}])', 'giu')
  }))
).sort((a, b) => b.alias.length - a.alias.length);

export function extractCvSkills(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return {
      skills: [],
      method: 'fixed keyword catalog with case-insensitive Unicode-aware token boundaries',
      reviewRequired: true,
      disclaimer: 'Suggestions are keyword matches only. Review each item; proficiency and experience are not inferred.'
    };
  }

  const normalized = text.normalize('NFKC');
  const matches = [];
  for (const entry of SKILL_PATTERNS) {
    entry.pattern.lastIndex = 0;
    let match;
    while ((match = entry.pattern.exec(normalized)) !== null) {
      matches.push({ label: entry.label, start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) entry.pattern.lastIndex += 1;
    }
  }

  matches.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const accepted = [];
  for (const match of matches) {
    const overlaps = accepted.some(item => match.start < item.end && match.end > item.start);
    if (!overlaps) accepted.push(match);
  }

  const seen = new Set();
  const skills = accepted
    .sort((a, b) => a.start - b.start)
    .map(item => item.label)
    .filter(label => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });

  return {
    skills,
    method: 'fixed keyword catalog with case-insensitive Unicode-aware token boundaries',
    reviewRequired: true,
    disclaimer: 'Suggestions are keyword matches only. Review each item; proficiency and experience are not inferred.'
  };
}
