# Modular Monolith Branch Snapshot

**Snapshot date:** 2026-09-08

**Branch:** `fix/modular-build-and-test-stability`

**Baseline commit:** `86b32b05e0a8ba5db9b97d0c0e4343519cbc8c7e`

**Status:** Stable checkpoint. Tasks 1-7 and registration/payment review are implemented; imports, matches/stats, facade removal, and real-database release validation remain.

**Continuation plan:** [plan.modular-monolith.md](./plan.modular-monolith.md)

**Authoritative design:** [docs/superpowers/specs/2026-09-07-modular-monolith-tenant-authorization-design.md](./docs/superpowers/specs/2026-09-07-modular-monolith-tenant-authorization-design.md)

**Original full plan:** [docs/superpowers/plans/2026-09-07-modular-monolith-tenant-authorization.md](./docs/superpowers/plans/2026-09-07-modular-monolith-tenant-authorization.md)

> The root [plan.md](./plan.md) and [snapshot.md](./snapshot.md) describe the older public-visual branch. They are intentionally preserved and are not the recovery source for this branch.

## Purpose

This file is the recovery handoff for the tenant-authorization modular-monolith branch. It records what is actually committed, the decisions that must not regress, fresh verification evidence, known environment constraints, and the next safe starting point.

## Objective and Request Flow

The branch is replacing the large `src/lib/actions.ts` and `src/lib/platform/repository.ts` surfaces with domain-owned vertical modules while enforcing organizer tenant isolation.

Mutations follow:

```text
UI -> Server Action -> Service -> Policy / Repository -> Prisma -> PostgreSQL
```

Server-rendered reads follow:

```text
UI -> Query Service -> Repository -> Prisma -> PostgreSQL
```

Server Actions own external input, sessions, redirects, uploads, and cache invalidation. Services expose use cases. Policies are pure. Repositories own Prisma and transaction-scoped ownership checks.

## Non-Negotiable Authorization Decisions

- Canonical roles are `captain`, `organizer`, and `platform_admin`.
- Only `platform_admin` has global access.
- Legacy `admin` is compatibility input only and behaves as organizer/self-tenant; it must never regain global access.
- `ActorContext` is the canonical authorization input. Organizer `tenantId` currently equals `userId`, but callers must not derive authorization from that implementation detail.
- Sessions resolve the current user by JWT subject/user ID and derive current role/tenant from the database rather than trusting stale JWT role claims.
- `Event.organizerUserId` is the current ownership root.
- Tenant writes include ownership in the mutation predicate or recheck ownership inside the same Prisma transaction.
- A separate authorization read followed by an unscoped write is not acceptable.
- Expected authorization failures use typed errors rather than `error.message === "Not authorized"` checks.

## Committed Module State

### Identity

`src/modules/identity/` owns actor construction, current-user/session resolution, identity queries, password change behavior, and typed authorization errors. `src/lib/auth/session.ts` remains a compatibility facade.

### Events

`src/modules/events/` is the reference vertical slice. It owns event reads, policies, repositories, services, draft/preview/publish actions, and public types. Its broad public barrel can expose server-only dependencies, so Client Components import Server Actions from the narrow `@/modules/events/actions` entrypoint.

### Visual Assets

`src/modules/visual-assets/` owns upload validation, image metadata decoding, revision persistence, approval, activation, and tenant checks. Ownership is checked before Blob upload and again transactionally at persistence.

### Certificates

`src/modules/certificates/` owns certificate assets, generation, result persistence, and event-scoped authorization. Actor-less legacy primitives are isolated in `compatibility.ts` rather than exposed as normal authenticated use cases.

### Teams

`src/modules/teams/` owns organizer team operations and captain roster operations. Forged team/player IDs are rejected, writes recheck scope transactionally, logo authorization happens before upload and at persistence, and `Ongoing`/`Finished` events lock roster mutation.

### Registrations

`src/modules/registrations/` owns free registration, paid requests, payment-proof uploads, review transitions, payment settings, capacity/duplicate checks, and expiry semantics. Organizer/global boundaries and linked team/event context are enforced. CSV/XLSX bulk imports and captain credential export remain outside this module and are the next extraction target.

### Shared and Migration Infrastructure

- `src/modules/shared/action-errors.ts` maps expected typed failures consistently.
- `src/lib/tenant-ownership/` and `scripts/preflight-tenant-ownership.mjs` provide read-only anomaly detection and explicit mapping support.
- `prisma/migrations/20260908083000_enforce_event_organizer_ownership/migration.sql` is committed but has not been applied to a real database in this worktree.
- Architecture tests enforce module direction and server-action bundle boundaries.

## Build and Test Stability Fixes in the Checkpoint

Three Client Components now import event Server Actions from `@/modules/events/actions` instead of the broad events barrel:

- `src/components/v3/events/EventDraftForm.tsx`
- `src/components/v3/events/PreviewControls.tsx`
- `src/components/v3/events/PublishReadiness.tsx`

This removes the production build chain from a Client Component through the broad events barrel into identity session code and `next/headers`. `src/lib/server-action-bundle.test.ts` guards the boundary.

Two real image-decoding action tests use a scoped `15_000 ms` timeout:

- the owned-event character-art upload test;
- the approved organizer visual revision upload test.

The tests remain fully awaited and keep real image metadata decoding. In isolation they pass in hundreds of milliseconds. Under an 85-file Vitest run, both exceeded the global 5-second default because of worker contention; the first sequential full run failed only those two at `795/797`, and the scoped timeout rerun passed `797/797`. Do not replace the decoder with a mock because spoofed-image rejection is security-relevant.

## Verification Evidence at Checkpoint

Fresh verification performed before commit `86b32b0`:

| Command or gate | Result |
|---|---|
| Focused event action/bundle tests | 4 files, 36/36 passed |
| Focused certificate/visual action tests | 2 files, 23/23 passed |
| Full `pnpm exec vitest run` | 85 files, 797/797 passed |
| `pnpm lint` (`tsc --noEmit`) | exit 0 |
| `pnpm build` | exit 0; compiled and generated 39/39 static pages |
| `git diff --check` | clean after EOF cleanup |

The build printed a Prisma `DATABASE_URL` validation message during page-data collection because no database URL was supplied. Existing fallback behavior handled it and the build exited `0`. The original `next/headers` Client Component import-chain error did not recur.

## Environment and Execution Constraints

- Active linked worktree: `C:\Test\MiracleTourney\.worktrees\modular-monolith`.
- Main checkout is a different branch. Always use explicit worktree paths or `pnpm -C "C:/Test/MiracleTourney/.worktrees/modular-monolith" ...`.
- Prefer `git -C "C:\Test\MiracleTourney\.worktrees\modular-monolith" ...` for Git commands.
- `rg` is not available in the current PowerShell environment; use workspace search tools or `Get-ChildItem | Select-String`.
- Run full Vitest and production build sequentially, never concurrently on this machine.
- No real database or migration command was run during this checkpoint.
- Do not apply the committed migration without a dedicated database, reviewed ownership mappings, and explicit approval.
- The root visual-system plan/snapshot belong to another branch context and must not drive this migration.

## Remaining Legacy Surface

The compatibility monoliths still exist:

- `src/lib/actions.ts`
- `src/lib/platform/repository.ts`

Remaining callers include admin and captain pages, authentication/reset/register surfaces, public event/bracket/leaderboard/standings pages, the captain-credentials API route, compatibility tests, and two certificate dependencies. Treat the exact list as dynamic: rerun repository search before each cleanup batch.

Existing focused statistics code remains under:

- `src/lib/platform/stat-recording.ts`
- `src/lib/platform/stat-recording-repository.ts`

The captain-credentials route currently imports `assertUserCanManageEvent` and `getCaptainCredentialsForEvent` directly from the repository facade and recognizes legacy `admin`. Task 8b must move it behind an actor-aware imports service while preserving its CSV injection defense and response headers.

## Remaining Work

1. Extract registration CSV/XLSX imports and captain credential export into `src/modules/imports/`.
2. Extract match reads and writes into `src/modules/matches/`.
3. Extract stat recording, submission, review, leaderboard, and standing workflows into `src/modules/stats/`.
4. Migrate every remaining caller and delete both compatibility monoliths when references reach zero.
5. Run ownership preflight, migration validation, tenant integration tests, and forged-ID browser journeys against a dedicated PostgreSQL database.
6. Complete performance, TypeScript/React, security, migration, and whole-change review gates.

## Safe Resume Procedure

```powershell
git -C "C:\Test\MiracleTourney\.worktrees\modular-monolith" status --short --branch
git -C "C:\Test\MiracleTourney\.worktrees\modular-monolith" log -3 --oneline
pnpm -C "C:/Test/MiracleTourney/.worktrees/modular-monolith" lint
```

Then read this snapshot and [plan.modular-monolith.md](./plan.modular-monolith.md), begin Task 8b with characterization tests, and do not reopen completed modules unless a focused failing check identifies a regression.

## Git State at Snapshot Creation

- Branch: `fix/modular-build-and-test-stability`
- Checkpoint: `86b32b05e0a8ba5db9b97d0c0e4343519cbc8c7e`
- Checkpoint subject: `refactor: modularize tenant-owned tournament workflows`
- Remote: `origin` at `https://github.com/captDzuL/MiracleTourney.git`
- Upstream target: `origin/fix/modular-build-and-test-stability`.
