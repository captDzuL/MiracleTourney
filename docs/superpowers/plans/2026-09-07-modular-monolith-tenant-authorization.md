# Modular Monolith and Tenant Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the action and repository monoliths with domain modules and enforce organizer tenant ownership consistently.

**Architecture:** Mutations use thin domain Server Actions over services, pure policies, and Prisma repositories. Server-rendered reads use module query services directly. Temporary legacy re-exports preserve compatibility while callers move module by module.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.9, Prisma 6, PostgreSQL, Zod 4, Vitest 3, Playwright 1.62, pnpm.

## Global Constraints

- Preserve routes, localized redirects, action contracts, cache TTLs/tags, transaction boundaries, demo fallbacks, and visible behavior.
- Only `platform_admin` may cross organizer boundaries.
- Legacy `admin` users become tenant-scoped `organizer` users.
- Organizer `tenantId` equals `userId` initially, but service and policy contracts must permit a future organization tenant.
- Policies never import Prisma or repositories; repositories never import sessions or Server Actions.
- Cross-module consumers import only module `index.ts` public APIs.
- Tenant-scoped writes include ownership in their mutation predicate or validate it in the same transaction.
- Do not commit automatically; leave reviewed changes on the isolated branch for the user.

---

### Task 1: Baseline and Architecture Guardrails

**Files:**
- Create: `src/architecture-boundaries.test.ts`
- Modify: existing characterization tests only where a missing invariant is identified

**Produces:** Executable dependency rules and baseline evidence before code movement.

- [ ] Run `pnpm test` and record pre-existing failures.
- [ ] Add a failing architecture test that scans `src/modules` imports and rejects forbidden policy, repository, and private cross-module imports.
- [ ] Run the focused test and confirm it fails against a deliberately invalid fixture or missing boundary implementation.
- [ ] Implement the minimal import-boundary checker in test utilities.
- [ ] Run the focused test, `pnpm lint`, and `pnpm test`.

### Task 2: Identity and Actor Foundation

**Files:**
- Create: `src/modules/identity/actor.ts`
- Create: `src/modules/identity/errors.ts`
- Create: `src/modules/identity/repository.ts`
- Create: `src/modules/identity/service.ts`
- Create: `src/modules/identity/session.ts`
- Create: `src/modules/identity/index.ts`
- Create: `src/modules/identity/*.test.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/session.test.ts`

**Produces:** `ActorContext`, authoritative user-by-ID session resolution, typed authorization errors, and a compatibility facade.

- [ ] Add a regression test proving an organizer JWT subject is resolved by user ID, not email.
- [ ] Run the focused test and confirm the lookup mismatch fails.
- [ ] Add `getUserById` to the identity repository and migrate session resolution.
- [ ] Add policy-free actor construction for captain, organizer, and platform admin.
- [ ] Add tests for inactive users, stale JWT role claims, and actor tenant scope.
- [ ] Keep `src/lib/auth/session.ts` as a compatibility re-export and migrate direct callers incrementally.
- [ ] Run identity/session tests and `pnpm lint`.

### Task 3: Shared Action Error Contract

**Files:**
- Create: `src/modules/shared/action-errors.ts`
- Create: `src/modules/shared/action-errors.test.ts`
- Modify: one identity action and its tests

**Produces:** Consistent mapping for unauthenticated, forbidden, not-found, conflict, and validation failures.

- [ ] Write failing tests for each expected error mapping and unknown-error propagation.
- [ ] Implement the minimal typed error-to-action-result mapping.
- [ ] Convert one identity action to prove redirect and localization compatibility.
- [ ] Run focused tests and `pnpm lint`.

### Task 4: Ownership Preflight and Data Migration

**Files:**
- Create: `scripts/preflight-tenant-ownership.mjs`
- Create: `src/tenant-ownership-preflight.test.ts`
- Create: `prisma/migrations/<timestamp>_enforce_event_ownership/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: E2E fixtures and auth helpers

**Produces:** An idempotent, explicit role/owner migration and a required indexed event owner.

- [ ] Test that preflight reports legacy admins, null owners, and invalid owners and exits non-zero without an explicit mapping.
- [ ] Implement read-only preflight output without printing secrets.
- [ ] Add deterministic admin-to-organizer and explicit orphan-event backfill SQL.
- [ ] Verify zero anomalies before applying the non-null constraint.
- [ ] Make `organizerUserId` required and indexed with delete restriction.
- [ ] Remove `admin` from runtime role types only after old sessions are invalidated or expired.
- [ ] Run migration tests, Prisma generation, focused tests, and `pnpm lint`.

### Task 5: Events Reference Module

**Files:**
- Create: `src/modules/events/{types,schemas,policy,repository,service,queries,actions,index}.ts`
- Create: `src/modules/events/*.test.ts`
- Modify: event pages, layouts, sitemap, `src/lib/actions/event-v3-actions.ts`, and legacy facades

**Produces:** The reference vertical slice and tenant policy pattern for dependent modules.

- [ ] Write policy matrix tests for organizer A/event A, organizer A/event B, captain, anonymous, and platform admin.
- [ ] Write repository/service characterization tests for public reads, manageable reads, create/update/status/archive/contact, cache behavior, demo fallback, and preview-token revocation.
- [ ] Move event code with no behavior changes and keep policy Prisma-free.
- [ ] Scope organizer mutations atomically.
- [ ] Migrate all event callers to `@/modules/events` and shrink legacy facades.
- [ ] Run module tests, `pnpm lint`, `pnpm test`, and `pnpm build`.

### Task 6: Visual Assets and Certificates Modules

**Files:**
- Create: `src/modules/visual-assets/`
- Create: `src/modules/certificates/`
- Modify: related actions, jobs, pages, and legacy facades

**Produces:** Event-owned media review and certificate workflows behind module APIs.

- [ ] Add failing cross-tenant visual review and activation tests.
- [ ] Preserve active-asset approval/rejection transactions and legacy image dual-write.
- [ ] Move certificate result persistence and regeneration orchestration with failure recording intact.
- [ ] Migrate callers and shrink facades.
- [ ] Run focused tests, `pnpm lint`, and `pnpm test`.

### Task 7: Teams and Roster Module

**Files:**
- Create: `src/modules/teams/`
- Modify: captain/organizer team actions, pages, and legacy facades

**Produces:** Team and roster use cases with separate organizer-event and captain-team policies.

- [ ] Add failing forged-team-ID tests for organizer and captain actors.
- [ ] Move team reads, captain assignment, logos, player CRUD, and roster lock rules.
- [ ] Keep the existing `teams` cache tag behavior.
- [ ] Migrate callers and run focused tests, `pnpm lint`, `pnpm test`, and `pnpm build`.

### Task 8: Registration and Imports Modules

**Files:**
- Create: `src/modules/registration/`
- Create: `src/modules/imports/{policy,repository,service,actions,index}.ts`
- Modify: existing import parsers' callers, API routes, pages, and legacy facades

**Produces:** Tenant-scoped registration/payment state transitions and bulk import workflows.

- [ ] Add failing cross-tenant registration review, captain proof, import batch, and credential export tests.
- [ ] Extract the registration state machine as pure code.
- [ ] Preserve request/team transactions and expiration behavior.
- [ ] Preserve bcrypt-before-transaction and the import transaction timeout.
- [ ] Migrate the captain-credentials route and remaining callers.
- [ ] Run focused tests, `pnpm lint`, `pnpm test`, and `pnpm build`.

### Task 9: Matches and Stats Modules

**Files:**
- Create: `src/modules/matches/`
- Create: `src/modules/stats/`
- Modify: `src/lib/platform/stat-recording-repository.ts`, actions, pages, and legacy facades

**Produces:** Tenant-scoped competition operations and stat submission/review workflows.

- [ ] Add failing cross-tenant match/stat tests and captain participation tests.
- [ ] Reuse pure tournament engine functions without moving or duplicating them.
- [ ] Preserve match-game and stat-approval transactions.
- [ ] Preserve shared `teams` cache invalidation and `stats` cache behavior.
- [ ] Absorb stat recording into the stats module and migrate callers.
- [ ] Run focused tests, `pnpm lint`, `pnpm test`, and `pnpm build`.

### Task 10: Final Caller Migration and Cleanup

**Files:**
- Modify: all remaining legacy callers and tests
- Delete: `src/lib/actions.ts`
- Delete: `src/lib/platform/repository.ts`
- Delete: obsolete compatibility files after references reach zero
- Modify: `README.developer.md`
- Create: `docs/operations/tenant-authorization-migration.md`
- Create: `tests/integration/tenant-isolation.test.ts`

**Produces:** No legacy monolith imports, full tenant matrix coverage, and operational migration guidance.

- [ ] Move all remaining actions and queries to owning module public APIs.
- [ ] Search for legacy imports, runtime `admin` checks, `Not authorized` string matching, and unscoped organizer mutations.
- [ ] Delete empty facades and split monolith tests into module tests.
- [ ] Document module dependency rules, actor semantics, ownership, transactions, preflight, deployment, and rollback.
- [ ] Run real-database tenant integration tests and targeted Playwright forged-ID journeys.
- [ ] Run `pnpm test:dashboard:perf` before and after and investigate meaningful regressions.
- [ ] Run final `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e:smoke`.
- [ ] Complete TypeScript, security, and whole-change code reviews; resolve all blocking findings.