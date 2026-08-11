# Pre-Pitch Verification

Last updated: 2026-08-11

## Verified Locally

- Typecheck: `pnpm lint`
- Unit, regression, smoke, and security tests: `pnpm test`
- Browser smoke without database dependency: `pnpm test:e2e:smoke`
- DB-free pressure smoke: `pnpm test:pressure:smoke`
- DB-backed E2E preflight: `pnpm test:e2e:preflight`
- Dependency audit: `pnpm audit --audit-level moderate`
- Production build: `pnpm build`

Latest local verification on 2026-08-11:

- `pnpm lint`: passed.
- `pnpm test`: passed, 18 files / 180 tests.
- `pnpm build`: passed.
- `pnpm test:e2e:smoke`: passed, 5 browser smoke tests.
- `pnpm test:pressure:smoke`: passed with 0 failures on `/id/login`, `/api/me`, and unauthenticated `/id/admin`.
- `pnpm audit --audit-level moderate`: passed, no known vulnerabilities.
- `pnpm test:e2e:preflight`: blocked because the Neon host is not reachable from this machine.

## Current Test Coverage Added

- CSV import rejects spreadsheet formula payloads before they can be stored.
- CSV import rejects oversized files and excessive row counts to reduce memory/CPU abuse risk.
- Captain credential CSV export requires admin access, rejects unsafe event IDs, and neutralizes spreadsheet formulas.
- Captain credential CSV export rejects SQL-injection-style `eventId` payloads before any repository query.
- Captain credential CSV export is marked `no-store` and `noindex` so temporary passwords are not cached or indexed.
- Captain stat submissions reject missing identifiers, negative/overflow values, and malformed stat/player keys before leaderboard review.
- Captain stat submissions reject manipulated team/match IDs unless the authenticated captain owns the team and the match is completed for that event.
- Middleware rate-limits repeated login POST attempts per client IP.
- Middleware blocks cross-site unsafe requests before server actions run.
- Admin character-art upload rejects non-image uploads, spoofed image MIME types, and unsafe event IDs.
- Admin stream URLs reject non-http schemes such as `javascript:`.
- Certificate sharing blocks scriptable/non-web image URLs and sanitizes generated file names.
- Middleware no longer falls back to the public placeholder JWT secret.
- Security smoke tests guard against raw SQL escape hatches such as `$queryRaw` / `$executeRaw`.
- DB-backed E2E now has a fast preflight that checks database reachability without printing secrets.
- Browser security headers are guarded by smoke tests.
- Browser responses include a baseline Content Security Policy to reduce XSS blast radius.
- Next image optimization uses an explicit remote host allowlist instead of a wildcard HTTPS host.
- Browser smoke covers localized login render, unauthenticated admin redirect, DB-free `/api/me`, security headers, and a 20-request concurrent login-page smoke load.
- Pressure smoke warms and exercises `/id/login`, `/api/me`, and unauthenticated `/id/admin` redirects under concurrent request batches with p95 latency thresholds.
- Production build no longer depends on fetching Google Fonts.
- Public bracket routes stay dynamic so build does not query the database for static params.

## E2E Gate

Run: `pnpm test:e2e`

Current local status: blocked by database connectivity from this machine. `pnpm test:e2e:preflight` fails fast because Prisma cannot reach the configured Neon Postgres host from this environment. `pnpm test:e2e` now runs the same preflight before Playwright so DB-backed E2E does not waste time starting the browser server when the database is unreachable.

To complete the E2E gate, run it from a network/CI environment that can reach the Neon database, or point `.env` to an isolated test database that is reachable from the test runner.

## Before Pitch

- Run all verified local commands above.
- Run `pnpm test:e2e:preflight` and `pnpm test:e2e` against a reachable, isolated test database.
- Avoid using production data for E2E because global setup intentionally resets test-created rows.
- Confirm production `JWT_SECRET` is unique and not the placeholder value.
- Confirm `DATABASE_URL` and `DIRECT_URL` use fresh Neon connection strings.
