# V3 E2E and Vercel Preview safety

## Local browser tests

Copy the E2E template values from `.env.example` into an ignored `.env.test`. Use the Neon Delicate test branch for both `DATABASE_URL` and `DIRECT_URL`, set `NEON_PROD_HOST` to the production hostname, and set `E2E_DATABASE_RESET_ALLOWED=true` only when you intend to reset Delicate.

Run `pnpm dev:e2e` for a local V3 server. It loads `.env.test`, rejects a production database URL before Next starts, and enables the V3 feature flags.

To reset and seed Delicate, run `pnpm test:e2e:prepare`. Then run `pnpm test:e2e` for the serial browser suite. `pnpm test:e2e:full` performs both steps. Never run Prisma reset, migrate, seed, cleanup, or E2E with a production URL.

## GitHub Actions

The E2E job writes an ignored `.env.test` from `NEON_TEST_DATABASE_URL`, `NEON_TEST_DIRECT_URL`, and `NEON_PROD_HOST`, then runs the preflight-backed reset and seed. The concurrency group keeps one Delicate reset active at a time. CI never uses `prisma db push --accept-data-loss`.

## Vercel environments

Set these variables in **Preview** only with Delicate credentials:

- `DATABASE_URL` and `DIRECT_URL`: Delicate test branch
- `NEON_PROD_HOST`: production hostname, used only as a deny-list guard
- `FEATURE_FLAG_UI_V3_FOUNDATION=true`
- `FEATURE_FLAG_ORGANIZER_WORKSPACE_V3=true`
- `FEATURE_FLAG_REGISTRATION_WORKSPACE_V3=true`
- `FEATURE_FLAG_COMPETITION_OPERATIONS_V3=true`

Preview builds reject missing database safety variables and reject either URL when it points to production. They run `next build` only; no Prisma migration runs in Preview.

Production keeps its own database variables. Only `VERCEL_ENV=production` runs `prisma migrate deploy` before the production build.