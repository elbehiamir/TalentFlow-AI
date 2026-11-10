# TalentFlow AI

An AI-assisted applicant tracking platform for modern recruiting teams.

TalentFlow AI helps HR teams organize vacancies and candidates, review CV information, and understand candidate-to-job fit through transparent, explainable criteria. It is designed as a practical SaaS foundation, not an automated hiring decision-maker.

## Product principles
- **Human-in-the-loop:** recruiters make every hiring decision.
- **Explainable matching:** show which job requirements are supported by CV evidence and which need review.
- **Privacy by design:** collect only relevant candidate information and protect uploaded documents.
- **No fabricated profiles:** demo content is clearly labelled as sample data.

## Current foundation
- Responsive React + Vite dashboard.
- Candidate pipeline overview and vacancy summaries.
- Node.js + Express API health endpoint.
- Initial project structure for PostgreSQL integration and CV processing.

## Repository structure
```
client/       React + Vite application
server/       Express API
```

## Run locally

### Requirements
- Node.js 20+
- npm

### Frontend
```bash
cd client
npm install
npm run dev
```

### Backend
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The API runs on `http://localhost:5000` by default and exposes `GET /api/health`.

## Roadmap
- [ ] PostgreSQL schema and migrations
- [ ] Secure authentication and role-based access
- [ ] Candidate and vacancy CRUD
- [ ] Private PDF upload and safe text extraction
- [ ] Explainable job matching with recruiter review
- [ ] Audit log, consent and retention controls
- [ ] Automated tests and deployment

## Important
TalentFlow AI is decision-support software. It must not reject, rank, or make employment decisions about people without meaningful human review. Matching criteria should be job-related, validated, and auditable.
