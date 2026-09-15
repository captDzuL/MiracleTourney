# Task 5 report — event-local organizer registration actions

Base: `90d2e07`

Commit: final focused Task 5 commit (hash returned in the handoff)

Fix Round 1 commit: `7e28b1e3045b528d83224c46388596af056f8d53`

Fix Round 2 commit: `bce4f53193cbb148e02016c98171dbf99f900036`

## TDD evidence

RED:

```text
pnpm exec vitest run src/lib/registration/organizer-workspace-read.test.ts src/lib/actions/registration-v3-actions.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts
```

- The two new suites were discovered but failed to import their not-yet-created production modules. The existing repository/action suites stayed green (243 tests), confirming a behavior-level missing-module RED rather than a test-discovery failure.

GREEN checkpoints:

- First production reader/action pass: 4 files, 254 tests; the action suite exposed four fixture/union narrowing issues.
- After those fixes: 4 files, 254 tests passed.
- After repository regressions and the safe-return test: 4 files, 261 tests passed.

Final focused command:

```text
pnpm exec vitest run src/lib/registration/organizer-workspace-read.test.ts src/lib/actions/registration-v3-actions.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts
```

- 4 files passed; 261 tests passed.

## Verification

- `pnpm exec prisma validate`: exit 0; schema valid.
- `pnpm lint`: exit 0 (`tsc --noEmit`).
- `git diff --check`: exit 0.
- `pnpm test`: 171 files passed, 2 skipped; 1,878 tests passed, 6 skipped.

## Implementation

- Added `organizer-workspace-read.ts` as the focused authorization boundary for event-local queue, import history, payment review, and event QRIS reads. Queue records use the existing registration-record filter for status/source/search/pagination and do not expose payment proof URLs in queue rows.
- Added `registration-v3-actions.ts` for typed, localized event-local import preview/commit, payment approval/rejection, and QRIS draft/publication actions. Every action validates the event identifier, gates organizer/admin roles, rechecks ownership, verifies target event identity, canonicalizes only safe localized registration return URLs, and revalidates affected event paths/tags.
- Reused the existing registration intake parser, preview builder, import batch repository, and Task 4 `EventPaymentSettings` draft/publish CAS services. No second parser, payment reader, or global writable QRIS path was introduced.
- Added `RegistrationMutationConflictError` and optional status/`updatedAt` preconditions to payment approval/rejection. Conditional request transitions occur before a transaction returns; approval's team/request writes remain inside the serializable transaction so stale reviewers cannot leave partial state.
- Converted legacy admin preview/commit actions into adapters over the shared core while preserving their function signatures and legacy `/admin` redirects. The new V3 exports are also exposed from `src/lib/actions.ts`.

## Scope and security notes

- Only Task 5 readers/actions/repository tests and the requested SDD brief/report/ledger were changed. Task 6 UI files were not touched.
- `2026-09-14-release-1.0-verification.md` remains untracked and untouched.
- No production migration, deployment, feature-flag activation, or logging of proof URLs, QRIS URLs, row PII, credentials, or secrets was performed.

## Files

- `src/lib/registration/organizer-workspace-read.ts`
- `src/lib/registration/organizer-workspace-read.test.ts`
- `src/lib/registration/registration-v3-contract.test.ts`
- `src/lib/actions/registration-v3-actions.ts`
- `src/lib/actions/registration-v3-actions.test.ts`
- `src/lib/actions.ts`
- `src/lib/platform/repository.ts`
- `src/lib/platform/repository.test.ts`
- `.superpowers/sdd/2026-09-14-organizer-master-workspace/progress.md`
- `.superpowers/sdd/2026-09-14-organizer-master-workspace/task-5-brief.md`
- `.superpowers/sdd/2026-09-14-organizer-master-workspace/task-5-report.md`

## Fix Round 1 — reviewer findings

### TDD evidence

RED after adding the reviewer regressions and contract evidence:

```text
pnpm exec vitest run src/lib/registration/registration-v3-contract.test.ts src/lib/actions.test.ts
```

- 2 files were discovered; 7 tests failed and 145 passed. The failures were expected: legacy metadata was not yet consumed, the shared adapter did not receive compatibility mode, and the faithful transaction fixture exposed a Date-match fixture defect before production behavior was changed.

GREEN:

- `pnpm exec vitest run src/lib/registration/registration-v3-contract.test.ts src/lib/actions.test.ts`: 2 files passed; 152 tests passed.
- The contract test executes the production parser, mapping, validation/preview builder, event-local repository readers, authorization checks, and approval CAS transaction. It verifies that the transaction snapshot rolls back the event competition version, created team, and request mutation when the conditional claim loses a race.

### Contract-test boundary and limitation

- No live registration database was used. The repository has no always-available safe registration integration database in the unit-test command; the existing database integration harness is conditional on a separately configured guarded environment. The new test therefore injects a minimal faithful Prisma boundary with real event/request/team relations, query predicates, CAS update counts, serializable transaction snapshots, and rollback semantics. This is contract evidence for production repository control flow, not a claim of live PostgreSQL execution.
- Real CSV parser validation is exercised with an oversized source and a valid source flowing through mapping and preview validation. Repository authorization and event scoping are exercised for the owner, unrelated organizer, admin, and platform-admin paths.

### Legacy compatibility

- Legacy preview now performs the established authorization and file prechecks, preserves parser failures on the import phase, preserves required-mapping failures on the registration phase, and retains preview repository failures as errors with their original message.
- Legacy commit preserves empty-selection, expiry, and repository messages on the registration phase while delegating all parsing/import business logic to the shared action module. No second parser or import implementation was introduced.
- Event-local repository readers no longer expose string-only overloads. Every sensitive queue, history, payment-review, import-user, request-target, and manager QRIS read requires an authenticated actor and enforces owner/admin/platform-admin authorization internally.

### Fix Round 1 verification

- `pnpm lint`: exit 0 (`tsc --noEmit`).
- `pnpm exec prisma validate`: exit 0; schema valid.
- `git diff --check`: exit 0.
- Required focused command: 4 files passed; 271 tests passed.
- Contract evidence command: 1 file passed; 5 tests passed.
- `pnpm test`: 172 files passed, 2 skipped; 1,893 tests passed, 6 skipped.

The protected `2026-09-14-release-1.0-verification.md` file remains untouched and untracked; Task 6 UI files remain outside the change set.

## Fix Round 2 — residual P2 findings

### TDD evidence

RED after adding the two narrow regressions:

```text
pnpm exec vitest run src/lib/registration/registration-v3-contract.test.ts src/lib/actions.test.ts
```

- 2 files were discovered; 2 tests failed and 152 passed. The event-not-found assertion still received an `activeEventId`, and the real shared-core partial-mapping test initially needed its fixture switched to an existing configured game mode before reaching the intended mapping branch.

GREEN:

- The affected contract/actions suite passed 2 files / 154 tests after the two production corrections.
- The real shared-core regression now reports only `captain UID` when `teamName` and `captainIgn` are present; required labels retain the prior Indonesian ordering and punctuation.
- The legacy event-not-found adapter now returns exactly `/admin?phase=import&error=Event%20tidak%20ditemukan.` while other import failures retain their active event context.

### Fix Round 2 verification

- Required focused command: 4 files passed; 272 tests passed.
- `pnpm lint`: exit 0 (`tsc --noEmit`).
- `pnpm exec prisma validate`: exit 0; schema valid.
- `git diff --check`: exit 0.
- `pnpm test`: 172 files passed, 2 skipped; 1,895 tests passed, 6 skipped.

Only the two requested P2 compatibility corrections were made in this round. The protected verification note remains untouched and untracked.
