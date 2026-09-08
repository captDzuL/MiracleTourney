# Modular Monolith Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining import, match, and statistics extraction; remove compatibility monoliths; and prove tenant isolation through final integration and release gates.

**Architecture:** Preserve the established vertical-module flow: `UI -> Server Action -> Service -> Policy / Repository -> Prisma -> PostgreSQL`. Continue from checkpoint `86b32b0`: Tasks 1-7 and registration/payment review are complete, while imports, matches/stats, facade removal, and final operational validation remain.

**Tech Stack:** Next.js 15.5, React 19, TypeScript 5.9, Prisma 6/PostgreSQL, Zod 4, Vitest 3.2, Playwright 1.62, pnpm.

**Branch:** `fix/modular-build-and-test-stability`

**Recovery snapshot:** [snapshot.modular-monolith.md](./snapshot.modular-monolith.md)

**Authoritative design:** [docs/superpowers/specs/2026-09-07-modular-monolith-tenant-authorization-design.md](./docs/superpowers/specs/2026-09-07-modular-monolith-tenant-authorization-design.md)

**Original full plan:** [docs/superpowers/plans/2026-09-07-modular-monolith-tenant-authorization.md](./docs/superpowers/plans/2026-09-07-modular-monolith-tenant-authorization.md)

## Global Constraints

- Preserve routes, localized redirects, action signatures, cache TTLs/tags, transaction boundaries, demo fallbacks, and visible behavior.
- Only `platform_admin` may cross organizer boundaries; legacy `admin` remains organizer/self-tenant scoped during compatibility cleanup.
- Server Actions own session loading, input parsing, redirects, uploads, and cache invalidation.
- Services expose use cases; repositories own Prisma and transaction-scoped ownership checks.
- Policies remain pure and never import Prisma, repositories, sessions, or Next.js.
- Tenant-scoped writes include ownership in their predicate or recheck ownership inside the same Prisma transaction.
- Cross-module runtime imports use public module APIs. Client Components import narrow `"use server"` action entrypoints when a broad barrel can expose server-only dependencies.
- Keep real image decoding in upload security tests. The two decoding tests have scoped `15_000 ms` limits because full Vitest worker contention exceeded the default while isolated execution remained fast.
- Do not run `pnpm build` concurrently with the full Vitest suite on this machine.
- Do not apply migrations or run real-database tests until a dedicated PostgreSQL database and explicit approval are available.
- Commit each independently reviewed task. Do not push intermediate task commits unless requested.

## Completed Baseline

| Work item | Status at `86b32b0` |
|---|---|
| Architecture guardrails | Complete |
| Identity, actor, and typed errors | Complete |
| Tenant ownership preflight and migration artifact | Complete; migration not applied |
| Events reference module | Complete |
| Visual assets module | Complete |
| Certificates module | Complete |
| Teams and captain roster module | Complete |
| Registration/payment review module | Complete |
| Registration CSV/XLSX imports | Remaining |
| Matches and stats modules | Remaining |
| Legacy caller/facade removal | Remaining |
| Real-database and E2E release gate | Remaining |

---

### Task 8b: Registration Imports and Credential Export

**Files:**
- Create: `src/modules/imports/types.ts`
- Create: `src/modules/imports/policy.ts` only if decisions cannot reuse existing actor/event ownership APIs
- Create: `src/modules/imports/repository.ts`
- Create: `src/modules/imports/service.ts`
- Create: `src/modules/imports/actions.ts`
- Create: `src/modules/imports/index.ts`
- Create: `src/modules/imports/*.test.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/app/api/admin/captain-credentials/route.ts`
- Modify: `src/app/api/admin/captain-credentials/route.test.ts`
- Modify: import-related admin/organizer callers identified by repository search

**Interfaces:**
- Consumes: `ActorContext`, typed identity errors, event ownership checks, teams compatibility primitives, existing CSV/XLSX parser behavior.
- Produces: tenant-scoped import use cases and a tenant-scoped captain-credential export query for the API route.

- [ ] **Step 1: Characterize the remaining behavior**

Add focused tests proving that organizer A cannot import teams, mutate an import batch, or export captain credentials for organizer B's event; `platform_admin` may operate globally; malformed rows remain atomic; spreadsheet-formula prefixes remain escaped in CSV output.

- [ ] **Step 2: Run the focused tests and confirm authorization failures**

Run:

```powershell
pnpm exec vitest run src/modules/imports src/app/api/admin/captain-credentials/route.test.ts src/lib/actions.test.ts src/lib/platform/repository.test.ts
```

Expected: the new cross-tenant tests fail against the compatibility path before extraction.

- [ ] **Step 3: Extract parser orchestration and persistence**

Move import use cases into `src/modules/imports/`. Preserve bcrypt-before-transaction behavior, all-or-nothing persistence, duplicate validation, credential generation semantics, and the existing extended transaction timeout. Actor-less primitives required by public registration may remain in an explicitly named compatibility entrypoint rather than weakening the module API.

- [ ] **Step 4: Move credential export behind the module boundary**

Update the route to resolve an authoritative actor, invoke one imports service/query use case, and serialize the returned rows. Remove direct imports from `@/lib/platform/repository`; preserve current status codes, headers, filename, formula escaping, and no-store behavior.

- [ ] **Step 5: Shrink compatibility facades**

Re-export only symbols still needed by unmigrated match/stat callers. Confirm no import-specific implementation remains in `src/lib/actions.ts` or `src/lib/platform/repository.ts`.

- [ ] **Step 6: Verify and review**

Run focused tests, `pnpm lint`, `pnpm exec vitest run`, and `pnpm build` sequentially. Review actor scope, transaction scope, credential exposure, and CSV injection resistance before committing.

- [ ] **Step 7: Commit Task 8b**

```powershell
git add src/modules/imports src/lib/actions.ts src/lib/platform/repository.ts src/app/api/admin/captain-credentials
git commit -m "refactor: extract tenant-scoped registration imports"
```

---

### Task 9a: Matches Module

**Files:**
- Create: `src/modules/matches/types.ts`
- Create: `src/modules/matches/policy.ts`
- Create: `src/modules/matches/repository.ts`
- Create: `src/modules/matches/service.ts`
- Create: `src/modules/matches/queries.ts`
- Create: `src/modules/matches/actions.ts`
- Create: `src/modules/matches/index.ts`
- Create: `src/modules/matches/*.test.ts`
- Modify: bracket, standings, event detail, admin, and organizer callers that still use legacy facades
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/platform/repository.ts`

**Interfaces:**
- Consumes: events ownership API, teams public API, and pure algorithms under `src/lib/tournament/`.
- Produces: public match queries plus tenant-scoped schedule, result, status, and match-game mutations.

- [ ] **Step 1: Add the authorization matrix**

Cover organizer A/event A, organizer A/event B, captain participant/non-participant, anonymous public reads, and `platform_admin`. Include forged match IDs whose event does not belong to the actor.

- [ ] **Step 2: Confirm the new matrix fails on legacy paths**

Run the new matches tests together with existing bracket and repository characterization tests.

- [ ] **Step 3: Extract reads and transaction-scoped writes**

Move match mapping and persistence to the module repository. Reuse tournament-engine functions without copying them. Keep event ownership and target match lookup in the same Prisma transaction as schedule/result/status writes.

- [ ] **Step 4: Migrate callers and cache behavior**

Move server-rendered reads to matches queries and mutation callers to narrow action entrypoints. Preserve existing `events`, `teams`, and route revalidation semantics.

- [ ] **Step 5: Verify, review, and commit**

Run matches, bracket, event-page, action, and repository tests; then run lint, full Vitest, and build sequentially. Commit as `refactor: extract tenant-scoped match workflows`.

---

### Task 9b: Statistics Module

**Files:**
- Create: `src/modules/stats/types.ts`
- Create: `src/modules/stats/policy.ts`
- Create: `src/modules/stats/repository.ts`
- Create: `src/modules/stats/service.ts`
- Create: `src/modules/stats/queries.ts`
- Create: `src/modules/stats/actions.ts`
- Create: `src/modules/stats/index.ts`
- Create: `src/modules/stats/*.test.ts`
- Move or re-export pure logic from `src/lib/platform/stat-recording.ts`
- Absorb persistence from `src/lib/platform/stat-recording-repository.ts`
- Modify: captain stats, leaderboard, standings, admin, and organizer callers
- Modify: remaining legacy facades

**Interfaces:**
- Consumes: matches public API, teams public API, `ActorContext`, and existing stat-recording completeness rules.
- Produces: public leaderboard/standing queries and actor-scoped stat submission, recording, approval, and review use cases.

- [ ] **Step 1: Add ownership and participation regressions**

Test cross-tenant organizer review, forged match/player IDs, captain submission for a non-participating team, platform-admin global review, and public read behavior.

- [ ] **Step 2: Preserve pure recording semantics**

Move `getTeamStatRecording` and `getMatchStatRecording` without changing `unrecorded`, `partial`, `recorded`, `notRequired`, or `missingRoster` behavior.

- [ ] **Step 3: Extract repository and service transactions**

Keep match status, roster membership, stat writes, and approval checks transactionally consistent. Avoid policy-induced N+1 queries by loading required match/team/player context in bounded queries.

- [ ] **Step 4: Migrate callers and cache behavior**

Preserve the `stats` cache contract and shared `teams` invalidation. Client Components must use narrow action entrypoints.

- [ ] **Step 5: Verify, review, and commit**

Run existing stat-recording tests plus new module/caller tests; then lint, full Vitest, build, and dashboard performance checks. Commit as `refactor: extract tenant-scoped statistics workflows`.

---

### Task 10: Remove Legacy Facades and Finish Caller Migration

**Files:**
- Modify: every remaining caller returned by searches for `@/lib/actions` and `@/lib/platform/repository`
- Modify: `src/architecture-boundaries.test.ts`
- Modify: `src/lib/server-action-bundle.test.ts`
- Delete: `src/lib/actions.ts` after runtime references reach zero
- Delete: `src/lib/platform/repository.ts` after runtime references reach zero
- Delete or relocate obsolete monolith tests after equivalent module coverage exists
- Modify: `README.developer.md`
- Create: `docs/operations/tenant-authorization-migration.md`

**Interfaces:**
- Consumes: public APIs from identity, events, visual-assets, certificates, teams, registrations, imports, matches, and stats.
- Produces: a codebase with no runtime dependency on either compatibility monolith.

- [ ] **Step 1: Turn residual searches into executable gates**

Extend architecture tests to reject runtime imports of both facade paths, broad Client Component barrels that expose server-only code, repository imports from actions/pages, and session imports from repositories.

- [ ] **Step 2: Migrate residual callers by owning domain**

Handle pages and API routes in small batches. Replace internal certificate imports from the repository facade with explicit module dependencies or actor-less compatibility primitives whose names expose their limited purpose.

- [ ] **Step 3: Remove string-based authorization and legacy global admin assumptions**

Search runtime code for `role === "admin"`, role arrays containing `admin`, `Not authorized` message comparisons, and organizer mutations without ownership predicates. Preserve migration-only recognition where required by the preflight artifact.

- [ ] **Step 4: Delete the facades**

Delete each monolith only after source and test imports reach zero and equivalent module tests pass. Do not delete pure tournament, platform configuration, or demo-adapter code.

- [ ] **Step 5: Document operation and rollback**

Document preflight inputs, explicit orphan mappings, migration ordering, stale-session invalidation, verification queries, rollback boundaries, and the rule that no migration is applied from this worktree without approval.

- [ ] **Step 6: Verify, review, and commit**

Run architecture tests, lint, full Vitest, build, smoke E2E, and focused security review. Commit as `refactor: remove legacy action and repository facades`.

---

### Task 11: Final Integration and Release Gate

**Files:**
- Create: `tests/integration/tenant-isolation.test.ts` when a dedicated PostgreSQL test database is available
- Modify: Playwright fixtures/specs for forged-ID journeys
- Update: [snapshot.modular-monolith.md](./snapshot.modular-monolith.md) with final evidence

**Produces:** Release evidence that tenant isolation and module boundaries hold outside mocks.

- [ ] **Step 1: Run migration preflight against a dedicated copy**

Record legacy admins, null owners, invalid owners, and explicit mappings without exposing credentials. Abort on every unresolved anomaly.

- [ ] **Step 2: Apply and validate the migration in non-production**

Verify `Event.organizerUserId` is non-null, indexed, references a valid user, and uses the intended delete restriction.

- [ ] **Step 3: Run the real-database tenant matrix**

Exercise organizer A, organizer B, captain A, `platform_admin`, and anonymous actors across list, read, mutation, review, credential export, and forged-ID paths.

- [ ] **Step 4: Run browser journeys**

Run smoke E2E and targeted organizer/captain workflows against the dedicated database. Capture failures and traces before changing code.

- [ ] **Step 5: Run final local gates sequentially**

```powershell
pnpm lint
pnpm exec vitest run
pnpm build
pnpm test:e2e:smoke
```

Expected: all commands exit `0`; the build may log the known Prisma fallback only when `DATABASE_URL` is intentionally absent.

- [ ] **Step 6: Complete independent reviews**

Require TypeScript/React review for touched callers, security review for actor/tenant boundaries and export routes, migration review for SQL/preflight, and whole-change review for compatibility regressions.

- [ ] **Step 7: Update recovery documentation and commit evidence**

Record exact commands, counts, environment, database target, migration status, residual risks, and final commit hashes in the branch snapshot before merge preparation.

## Completion Criteria

The migration is complete only when all of the following are true:

- No runtime caller imports `@/lib/actions` or `@/lib/platform/repository`.
- No runtime path grants global access to legacy `admin`.
- Every organizer-owned mutation scopes ownership atomically.
- Import credentials are tenant-scoped and CSV-safe.
- Match and stat writes validate event/team/player relationships in the write transaction.
- The ownership migration passes preflight and real-database validation.
- Architecture tests, lint, all Vitest tests, production build, smoke E2E, and tenant integration tests pass.
- Dashboard performance shows no meaningful policy-induced N+1 regression.
- Operational migration and rollback documentation is complete.
