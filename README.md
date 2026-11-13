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
JWT_SECRET=<output of openssl rand -hex 32>
BOOTSTRAP_ADMIN_EMAIL=admin@your-company.example
BOOTSTRAP_ADMIN_PASSWORD=<unique password of at least 12 characters>
```

Use your own administrator email and a unique password; never commit the populated `.env` file.

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

## Authentication setup

The API now requires an authenticated workspace session for recruitment data. Before starting the server:

1. Generate a private signing secret with `openssl rand -hex 32` and place the output in `JWT_SECRET` in `server/.env`.
2. Set both `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for the first startup. The initial password must contain at least 12 characters.
3. Start the API. It creates the first administrator only if that email is not already registered. It never resets an existing account's password.
4. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the runtime environment after the administrator has been created.

There is no public registration endpoint. An administrator can create recruiter or hiring-manager accounts with the protected `POST /api/users` endpoint. User passwords are stored as salted scrypt hashes. Sign-in uses an eight-hour, HttpOnly, SameSite=Lax session cookie; production mode also marks it Secure. The frontend and API should be deployed on the same site, and `CLIENT_URL` must match the frontend origin exactly.

Roles:
- **admin**: full access, including user provisioning and deleting records.
- **recruiter**: can view, create and update candidates and jobs, and read the activity log.
- **hiring_manager**: read-only access to recruitment records and dashboard data; the activity log is hidden.

## Run backend tests

The backend uses Node's built-in test runner; no additional test framework is required.

```bash
cd server
npm test
```

## API routes

- `GET /api/health` (public health check)
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/users` (administrator only; creates recruiter or hiring-manager accounts)
- `GET /api/dashboard` (authenticated)
- `GET /api/candidates?search=&stage=`
- `POST /api/candidates`
- `PATCH /api/candidates/:id`
- `DELETE /api/candidates/:id` (administrator only)
- `GET /api/jobs`
- `POST /api/jobs`
- `PATCH /api/jobs/:id`
- `DELETE /api/jobs/:id` (administrator only)
- `GET /api/activity`
- `POST /api/matching/preview`

All routes except the health check, login and logout require the session cookie. Role restrictions are enforced by the API, not only by the interface.

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

This is an early development foundation, not yet ready for real candidate personal data or production use. Authentication, HttpOnly session cookies, password hashing and API role checks are now implemented, but login rate limiting, private CV storage, consent and retention workflows, API integration tests and production deployment review remain outstanding. The current Node test suite covers password/session primitives, validation and deterministic skill matching; it does not yet exercise the HTTP routes or PostgreSQL. Use test records only until the remaining protections are in place.

TalentFlow AI is decision-support software. A fit score is not a hiring decision; recruiters must review job-related evidence and make decisions themselves.
