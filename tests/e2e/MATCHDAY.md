# Match Day V3 release verification

`helpers/matchday.ts` creates deterministic four-format graphs inside a unique namespace per test attempt. It uses real competition commands, explicit test database validation and the existing reset permission gate. Cleanup deletes only that fixture event. `showcase` adds eight teams, two disjoint live matches with check-in/readiness, a delayed match, official correction history, a draft schedule, and active/expired/draft announcements with explicit urgency.

For an isolated worktree, set `E2E_ENV_FILE` to the absolute path of an authorized file named `.env.test`. Credentials remain in that file. The loader clears inherited database variables and retains the same production-host and explicit reset safeguards. The file must contain `E2E_DATABASE_RESET_ALLOWED=true` before fixture writes or database reset are allowed.

Run in order:

1. `pnpm test:e2e:preflight`
2. `pnpm test:e2e:prepare` (resets only the validated isolated test database)
3. `pnpm exec playwright test tests/e2e/v3-matchday.spec.ts`
4. `pnpm exec playwright test`
5. `pnpm exec playwright test --config playwright.legacy.config.ts`

The separate legacy profile disables only competition and adaptive-public flags while preserving the organizer shell. It exercises canonical legacy public rendering and the event-scoped organizer legacy Match Day route. No new UI Captain, Finished recap, or real-time transport is included.

Passing test collection is not a passing browser run. If the reset permission is absent, stop at that gate and report E2E as unverified. Never bypass it using inherited environment variables or production data.
