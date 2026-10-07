# V3 production cutover runbook — 7 October 2026

Status: **procedure only, nothing here has been executed.** Every step that changes
production (Vercel settings or env, deployment, migration, flags, restore) needs
separate explicit approval from the owner at the time it is run; approval of this
document or a merged PR is not that approval. Companion documents:
`2026-10-03-v3-migration-preflight.md` (evidence, pending chain) and
`v3-feature-flag-matrix.md` (flags).

## Why the order matters (verified by read-back, 2026-10-07)

- The Vercel build override is
  `if [ "$VERCEL_ENV" = "production" ]; then pnpm prisma migrate deploy; fi && pnpm build`:
  any production build migrates the production database by itself.
- All eight V3 flags are `true` for the production target: any production build shows
  V3 immediately.
- Production Git branch in Vercel is `master`; the repository only has `main`. The last
  production deployment is `a742c300` from `main` (2026-09-03). Every later push is a
  preview. No production deployment is created until the production branch exists or
  is changed, so this cutover is a deliberate act, not a side effect of merging.
- Old code (`a742c300`) is **not** compatible with the migrated schema (21 new
  migrations, constraint renames, new tables). After step 5, rollback of the code alone
  is not safe; rollback is flags-off plus an owner decision on data restore (below).

## Preconditions (all must be true; record the evidence in the cutover log)

1. CI green on the exact release SHA: Lint, Unit and Schema drift jobs.
2. Local or manual E2E on the exact release SHA against a reset database: default
   profile shards 1/2 and 2/2, Match Day, visual, and the legacy flags-off profile.
   CI does not run E2E; record the command output.
3. `pnpm ops:vercel-readback` run and its output attached (see Read-back below).
4. A fresh backup/checkpoint of the production branch exists and its restore was
   rehearsed on a child branch within the Neon history window (6 h). The scheduled
   backup is PAUSED; a manual checkpoint is required. The incident restore procedure
   is `v3-incident-restore-runbook.md`; read it before step 4, and rehearse the restore on
   a child branch first.
5. Owner has named the maintenance window and who watches production.

## Procedure

Steps 1–3 change nothing in the database. Run them in this order.

1. **Stage the flags off (Vercel env, owner approval).** Set the eight V3
   `FEATURE_FLAG_*_V3` variables to `false` for the production target (Preview may stay
   `true`). Read back and confirm every value is `false`. This must come before any
   production deployment exists.
2. **Replace the build override (Vercel setting, owner approval).** Set the project
   build command to `pnpm vercel-build` (or clear the override, since `package.json`
   already defines `vercel-build`). `scripts/vercel-build.mjs` only builds and refuses a
   preview build that points at the production database; it never migrates. Read back:
   the `build-runs-migrate-deploy` finding must be gone.
3. **Production branch (Vercel setting, owner approval).** Either set the production
   branch to `main`, or create `master` from the release SHA. Prefer `main`: it avoids a
   second long-lived branch. `scripts/vercel-build.mjs` already treats trusted `main`
   builds as production candidates.
4. **Pause writes and take the checkpoint.** Announce the window, stop organizer and
   registration activity, create the fresh backup/checkpoint (precondition 4).
5. **Migrate manually, once.** From a trusted machine with the production
   `DIRECT_URL` (never pasted into chat or committed):
   - `pnpm exec prisma migrate status` — expect 17 applied, 21 pending.
   - `pnpm exec prisma migrate deploy`
   - `pnpm exec prisma migrate status` — expect 38 applied, 0 pending.
   - `pnpm exec prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code`
     — expect exit code 0 (empty). Exit 2 means drift: stop, do not deploy.
   - Physical catalog check (the ledger and `migrate diff` do not prove the physical
     schema): download the `catalog-reference-pg18` artifact of the CI run for the
     release SHA, then
     `CATALOG_DATABASE_URL="$DIRECT_URL" pnpm ops:catalog-postcheck compare catalog-reference-pg18.json --allow-production-read`
     — expect exit 0, or exactly the two known production differences listed in
     `v3-incident-restore-runbook.md` section 4. Any other difference: stop.
   Do not rerun on error; capture the error and decide with the owner.
6. **Deploy with flags off.** Create the production deployment of the release SHA.
   Smoke (flags off, legacy UI): home and `/events` in both locales return 200,
   a public event page and its bracket render, an organizer can sign in, one
   read-only organizer page loads. If anything fails, go to Rollback.
7. **Enable flags progressively** following the activation order in
   `v3-feature-flag-matrix.md`, one deployment per step, repeating the smoke checks
   plus the flag-specific page. A change of a flag is a Vercel env change plus a
   redeploy.
8. **Lift the write pause** only after step 7 completes and the organizer path has been
   exercised by a real organizer account.

## Rollback

- **Before step 5:** nothing in the database changed. Restore the previous build
  command and flags, or simply do not deploy.
- **After step 5, V3 misbehaves:** set the affected flags back to `false` and redeploy.
  The schema stays migrated; the new code runs with flags off.
- **After step 5, data or schema is damaged:** do not improvise. Restore into a **new**
  Neon branch from the checkpoint or point-in-time, verify it with the physical-catalog
  check, and let the owner decide the switchover. Writes made after the checkpoint are
  lost on a full restore; that trade-off is the owner's call and is why the write pause
  in step 4 exists.
- Never roll the code back to `a742c300` on the migrated database.

## Read-back (GET-only, no secrets printed)

```
NODE_USE_ENV_PROXY=1 VERCEL_TEAM_SLUG=<team> pnpm ops:vercel-readback
```

`VERCEL_TOKEN` must be in the environment. Exit code 0: no blocker; 1: blocker found
(build override runs `migrate deploy`, or a V3 flag is `true` for production); 2: could
not read. `NODE_USE_ENV_PROXY=1` is only needed behind an HTTP proxy.
Expected result right now: exit 1 with both blockers. After steps 1–2 it must be 0.

## Open items (not done by this document)

- Implement the post-V3 backup runner and rehearse a restore from it
  (`v3-incident-restore-runbook.md` section 6); the scheduled backup stays PAUSED.
- Decision on `email_password_reset` (see matrix, finding 2).
