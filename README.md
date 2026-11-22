# TalentFlow AI

An AI-assisted applicant tracking platform for recruitment teams. Recruiters remain responsible for every hiring decision.

## Stack

- Frontend: React + Vite
- API: Node.js + Express
- Database: PostgreSQL
- SQL queries use parameters to avoid SQL injection.

## Implemented application features

- Candidate list, search and stage filter
- Create, edit and delete candidate records
- Create and pause/reactivate job openings
- Dashboard metrics and pipeline counts calculated from database records
- Activity log for candidate and job changes
- CSV export of the currently filtered candidate list
- API validation for candidate and job fields, allowed stages/statuses, fit-score bounds and record IDs
- Explainable skill-coverage preview using exact normalized skill names; no hidden AI score or automatic hiring decision
- Authenticated, memory-only PDF CV text preview with strict size/page limits; no file or candidate data is persisted

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

The API requires an authenticated workspace session for recruitment data. Before starting the server:

1. Generate a private signing secret with `openssl rand -hex 32` and place the output in `JWT_SECRET` in `server/.env`.
2. Set both `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for the first startup. The initial password must contain at least 12 characters.
3. Start the API. It creates the first administrator only if that email is not already registered. It never resets an existing account's password.
4. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the runtime environment after the administrator has been created.

There is no public registration endpoint. An administrator can create recruiter or hiring-manager accounts with the protected `POST /api/users` endpoint. User passwords are stored as salted scrypt hashes. Sign-in creates an eight-hour, HttpOnly, SameSite=Lax cookie (Secure in production) and a corresponding row in PostgreSQL `auth_sessions`. Every protected request checks that the session row still exists, is not revoked and has not expired; the current role is loaded from the database. Logging out revokes only the current session in PostgreSQL before clearing the browser cookie, so a copied token stops working immediately. Deleting a user also deletes that user's sessions through the foreign key. Existing cookies issued before database-backed sessions are introduced must sign in again. Failed sign-in attempts are limited to 10 per client IP in a 15-minute window, with a `Retry-After` response when blocked. This limiter is in-memory and applies per API process; production deployments with multiple instances should replace it with a shared store such as Redis. When running behind a reverse proxy, configure Express `trust proxy` only for the known proxy hops so `req.ip` identifies the client safely; never trust arbitrary forwarded headers. The frontend and API should be deployed on the same site, and `CLIENT_URL` must match the frontend origin exactly.

For browser-session requests, every state-changing method (`POST`, `PUT`, `PATCH`, `DELETE`) must include an `Origin` header that exactly matches `CLIENT_URL`. Missing or mismatched origins are rejected with HTTP 403. Keep the frontend and API origin configuration aligned. Do not disable this check to accommodate a future mobile or server-to-server client; add a separately designed authentication mechanism for those clients.

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
- `POST /api/auth/logout` (requires a valid session and revokes it)
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
- `POST /api/cv/preview` (admin/recruiter only; multipart field `file`)

All routes except the health check and login require a valid session cookie. Role restrictions are enforced by the API, not only by the interface.

## Temporary CV PDF preview

The authenticated endpoint `POST /api/cv/preview` accepts one multipart PDF in the `file` field. Only administrators and recruiters can use it. Uploads are held in memory, limited to 5 MB and 5 pages, parsed with a 12-second timeout, and are not written to disk or saved in PostgreSQL. The response returns extracted text for a human to review; it does not create a candidate record. Image-only PDFs return `requiresOcr: true`; OCR is not implemented. Password-protected PDFs and files with obvious active-content or embedded-file markers are rejected.

These checks are defense-in-depth, not a malware scanner or a PDF sanitizer. PDF parsing still processes untrusted input. Focused HTTP-level tests cover the CV route's role checks, multipart constraints, upload-size limit and preview error mapping using a stub preview service. Do not use real candidate CVs: private persistent storage, malware scanning, isolated parsing, consent and retention controls, and full authentication/PostgreSQL integration tests are still required.

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

The preview uploads a PDF only for temporary text extraction; it does not store candidate details. It also suggests skills by matching text against a fixed keyword catalog using case-insensitive Unicode-aware boundaries and explicit aliases. Suggestions are shown for manual selection; overlapping terms prefer the longer phrase (for example, React Native before React), duplicates are removed, and no proficiency, experience, synonym or context inference is performed. The extractor is heuristic and can produce false positives or miss skills. Suggestions are not saved or used in matching until a recruiter manually selects them in the UI.

## Security and product boundaries

This is an early development foundation, not yet ready for real candidate personal data or production use. Password hashing, database-backed revocable sessions, HttpOnly cookies, API role checks, strict Origin checks for state-changing browser requests and an in-memory failed-login limiter are implemented. Private persistent CV storage, malware scanning, isolated PDF parsing, consent and retention workflows, full authentication/recruitment API and PostgreSQL integration tests, a distributed rate-limit store and production deployment review remain outstanding. The temporary CV preview is memory-only and is not a production document-management feature. The current Node test suite covers password/session primitives, the HTTP login/session/logout lifecycle with an in-memory session repository, request-origin validation, login throttling, input validation, deterministic skill matching and focused CV upload route HTTP behavior with a stub preview service. It does not yet exercise PostgreSQL itself or the full authentication/recruitment API. Use test records only until the remaining protections are in place.

TalentFlow AI is decision-support software. A fit score is not a hiring decision; recruiters must review job-related evidence and make decisions themselves.
