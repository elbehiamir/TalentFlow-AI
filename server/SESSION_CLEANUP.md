# Authentication session cleanup

TalentFlow AI removes stale authentication-session rows without touching user or candidate records.

- The API runs one cleanup pass after database initialization, then repeats it every hour.
- Sessions whose `expires_at` is in the past are deleted.
- Revoked sessions are retained for seven days, then deleted. This short retention window helps preserve recent session-revocation records while bounding table growth.
- The cleanup uses PostgreSQL's clock (`NOW()`) and a partial index on non-null `revoked_at` values.
- Cleanup failures are logged and do not stop the API; the next scheduled pass retries.
- The timer is unreferenced so it does not keep the Node.js process alive.

This job only deletes rows from `auth_sessions`. It does not delete users, candidates, CV files, activity records or any recruitment data.
