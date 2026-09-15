# Task 5 report — event-local organizer registration actions

Base: `90d2e07`

Commit: final focused Task 5 commit (hash returned in the handoff)

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
- `src/lib/actions/registration-v3-actions.ts`
- `src/lib/actions/registration-v3-actions.test.ts`
- `src/lib/actions.ts`
- `src/lib/platform/repository.ts`
- `src/lib/platform/repository.test.ts`
- `.superpowers/sdd/2026-09-14-organizer-master-workspace/progress.md`
- `.superpowers/sdd/2026-09-14-organizer-master-workspace/task-5-brief.md`
- `.superpowers/sdd/2026-09-14-organizer-master-workspace/task-5-report.md`
