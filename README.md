# TalentFlow AI

An AI-assisted applicant tracking platform for recruitment teams. Recruiters remain responsible for every hiring decision.

## Stack

- Frontend: React + Vite
- API: Node.js + Express
- Database: PostgreSQL
- SQL queries use parameters to avoid SQL injection.

## Features connected to PostgreSQL

- Candidate list, search and stage filter
- Create, edit and delete candidate records
- Create and pause/reactivate job openings
- Dashboard metrics and pipeline counts calculated from database records
- Activity log for candidate and job changes
- CSV export of the currently filtered candidate list
- API validation for candidate and job fields, allowed stages/statuses, fit-score bounds and record IDs
- Explainable skill-coverage preview using exact normalized skill names; no hidden AI score or automatic hiring decision

The database starts empty. The dashboard does not invent candidate profiles or hiring statistics. Add records through the interface to see real data.

## Run locally

Requirements: Node.js 20+ and PostgreSQL.

### 1. Create the database

Open a terminal where PostgreSQL is available and run:

```bash
createdb talentflow_ai
```

If `createdb` is not available, use psql:

```sql
CREATE DATABASE talentflow_ai;
```

### 2. Configure and start the API

```bash
cd server
npm install
cp .env.example .env
```

Open `server/.env` and set `DATABASE_URL` to your local PostgreSQL username and password if you use one. Example:

```env
DATABASE_URL=postgresql://YOUR_POSTGRES_USER:YOUR_PASSWORD@localhost:5432/talentflow_ai
CLIENT_URL=http://localhost:5173
PORT=5000
DATABASE_SSL=false
```

Then start the API:

```bash
npm run dev
```

On first startup, the API creates the required tables and indexes automatically. Check the connection at `http://localhost:5000/api/health`; the response should show `"database":"connected"`.

### 3. Start the frontend in a second terminal

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`.

## Run API validation tests

The backend uses Node's built-in test runner; no additional test framework is required.

```bash
cd server
npm test
```

## API routes

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/candidates?search=&stage=`
- `POST /api/candidates`
- `PATCH /api/candidates/:id`
- `DELETE /api/candidates/:id`
- `GET /api/jobs`
- `POST /api/jobs`
- `PATCH /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `GET /api/activity`
- `POST /api/matching/preview`

## Explainable skill matching preview

The preview endpoint accepts structured skill lists and returns matched, missing and additional skills:

```http
POST /api/matching/preview
Content-Type: application/json
```

```json
{
  "candidateSkills": ["React", "Node.js", "Accessibility"],
  "requiredSkills": ["React", "PostgreSQL", "Node.js"]
}
```

The percentage is calculated as `matched required skills / unique required skills × 100`, rounded to the nearest integer. Matching is case-insensitive and normalizes Unicode and whitespace, but it does not infer synonyms, skill proficiency, experience or seniority. Extra skills are reported separately and do not raise the percentage. The result is decision support only, not a hiring recommendation.

The preview does not upload files, store candidate details or extract skills from CVs. Those capabilities remain unimplemented.

## Security and product boundaries

This is an early development foundation, not yet ready for real candidate personal data or production use. Authentication, role-based access control, private CV storage, consent and retention workflows, rate limiting, API integration tests and production deployment still need to be implemented. The current Node test suite covers validation and the deterministic matching function. Use test records only until those protections are in place.

TalentFlow AI is decision-support software. A fit score is not a hiring decision; recruiters must review job-related evidence and make decisions themselves.
