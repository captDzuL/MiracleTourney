# Task 1 Report: Completion and Certificate Persistence Foundation

## Status

Implementation complete. The additive completion/certificate schema, migration, compatibility layer, safety fixes, tests, and required verification are committed on `feature/ui/completion-v3`.

## Commits

- `d7fdff031822a8d83330a3dc2749f1e5c750129f` — `feat(completion): add podium awards and versioned certificates`
- `f6d9f71` — `fix(certificates): preserve version history`
- `72a723e` — `fix(certificates): serialize version allocation`
- This report is committed separately because it records the implementation commit identifiers.

## Files

- `prisma/schema.prisma`
  - Added `TournamentCompletion`, `PodiumPlacement`, `EventAward`, `AwardDecision`, and `CompletionAuditEntry`.
  - Replaced singular event certificate relations with `certificates` collections.
  - Expanded `Certificate` with recipient, version, template, manifest, publication, verification, and supersession fields.
- `prisma/migrations/20260912010000_v3_completion_certificates/migration.sql`
  - Creates the additive completion tables and foreign keys.
  - Backfills legacy certificate rows as version-1 `champion`/`team` certificates.
  - Preserves existing certificate IDs and image URLs, using the ID as the initial verification code and the existing image URL as the published URL.
  - Drops the old one-certificate-per-event unique index and adds version/verification constraints and lookup indexes.
- `src/lib/completion/schema-contract.test.ts`
  - Adds focused schema and migration contract coverage.
- `src/lib/feature-flags.ts`, `src/lib/feature-flags.test.ts`
  - Adds `completion_workspace_v3`, defaulting to `false`, with environment override coverage.
- `src/lib/platform/repository.ts`, `src/lib/platform/repository.test.ts`
  - Keeps legacy event-level APIs scoped to the latest Champion team certificate.
  - Appends published versions, supersedes the prior version, preserves a published result from late failures, and performs version allocation in bounded-retry serializable transactions.
- `prisma/seed.ts`
  - Updates seeded certificate writes and event relation access for the versioned model.
- `scripts/regenerate-certificates.ts`
  - Appends and supersedes certificate versions instead of deleting history; allocates versions in a serializable transaction.
- `scripts/upload-certificate-to-blob.mjs`
  - Resolves the legacy Champion certificate by event and updates it by certificate ID.
- `scripts/cleanup-production-dummy-events.ts`, `src/lib/platform/production-cleanup.ts`
  - Updates cleanup paths for the non-unique event-to-certificates relation.

## TDD Evidence

### Required contract RED

Command:

```text
pnpm test src/lib/feature-flags.test.ts src/lib/completion/schema-contract.test.ts
```

Result before implementation: `4 failed, 11 passed`. Failures proved the flag, completion model, plural event relation, and collision-safe migration were absent.

### Legacy compatibility RED

Command:

```text
pnpm test src/lib/platform/repository.test.ts
```

Result before compatibility implementation: `3 failed, 74 passed`. Failures proved event-level reads did not select the latest Champion certificate and legacy generation could not persist against the versioned model.

### Review-driven history RED

Command:

```text
pnpm test src/lib/platform/repository.test.ts
```

Result after adding the append/supersede regression: `1 failed, 77 passed`. The failure showed a published certificate was overwritten rather than retained as immutable history.

### Review-driven concurrency/security RED

- Concurrency regression tests initially failed `2 failed, 77 passed`, proving version allocation was not protected and a late failure could downgrade a published certificate.
- The first advisory-lock correction made the behavior tests green but the full suite reported `1 failed, 824 passed`; `src/security-smoke.test.ts` correctly rejected the raw-SQL escape hatch.
- After replacing raw SQL with Prisma serializable transactions and retry handling, the focused repository suite passed `79/79` and security smoke passed `6/6`.

### GREEN

Final focused command:

```text
pnpm test src/lib/feature-flags.test.ts src/lib/completion/schema-contract.test.ts src/lib/platform/repository.test.ts src/lib/certificate/service.test.ts src/lib/certificate/generate.test.ts
```

Output:

```text
Test Files  5 passed (5)
Tests       106 passed (106)
```

Final full suite:

```text
pnpm test
Test Files  92 passed (92)
Tests       825 passed (825)
```

The full suite emits the existing expected stderr fixture for the password-reset email rejection test (`Resend API unreachable`); the suite exits successfully.

## Required Verification

### Prisma validation

The first invocation without environment setup failed because `DIRECT_URL` was not defined. This was an environment precondition, not a schema defect. Re-run with local placeholder PostgreSQL URLs:

```text
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/miracle'
$env:DIRECT_URL='postgresql://user:pass@localhost:5432/miracle'
pnpm prisma validate
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀
```

### Prisma client generation

```text
pnpm prisma generate
Prisma schema loaded from prisma\schema.prisma
✔ Generated Prisma Client (v6.19.3)
```

### Type/lint verification

```text
pnpm lint
$ tsc --noEmit
```

Exit code: `0`.

### Script syntax verification

```text
node --check scripts/upload-certificate-to-blob.mjs
```

Exit code: `0`, no output.

### Diff verification

```text
git diff --check
```

Exit code: `0`; only Git's Windows line-ending notices were printed during the pre-commit check.

## Self-review

- Confirmed the migration is additive and uses the required timestamp `20260912010000`.
- Confirmed existing certificate primary keys and image URLs remain unchanged during backfill, so legacy verification paths remain addressable.
- Confirmed legacy repository reads filter `type = champion` and `recipientKind = team`, ordered by descending version and creation time.
- Confirmed regeneration and upload utilities no longer assume `eventId` is unique.
- Confirmed published certificate history is appended rather than overwritten and late failed work cannot downgrade a published row.
- Confirmed version allocation reads and writes occur together under Prisma serializable isolation, with bounded retries for Prisma write conflicts (`P2034`) and version uniqueness races (`P2002`).
- Confirmed there are no raw SQL calls in the new path and the security-smoke suite passes.
- Reviewed the broad `schema.prisma` diff caused by Prisma formatting; the semantic changes remain within Task 1 persistence and relation requirements.

## Independent re-review

The final re-review reported no Critical or Important findings. It confirmed serialized version allocation and retry behavior, preservation of published history, protection against late-failure downgrades, legacy selector compatibility, collision-safe migration/backfill behavior, and passing schema, certificate, security-smoke, and type checks.

## Concerns

- The migration was statically validated and contract-tested but was not applied to a live or shadow PostgreSQL database because no task-scoped database connection was provided.
- The Prisma formatter produced substantial whitespace/alignment churn in `schema.prisma`; the semantic diff was reviewed, but this increases visual diff size.

## Fix Round 1 — Published Legacy Reads and Retry Coverage

### Commit

- `caf8cc7c0cd9adb7c15235467ed60f51b526e695` — `fix(certificates): prefer published legacy versions`
- `10b4768fe67f425cca53af43e95583fbeead298f` — `fix(certificates): retain legacy failure visibility`

### Findings addressed

1. Legacy single-event and batch lookups now select Champion/team certificates with `status = ready` and a non-null `publishedUrl` first, ordered by descending version. A newer generated/unpublished row can no longer hide the latest usable published certificate. When an event has no published certificate, both APIs fall back to its latest Champion row so persisted failure state remains visible for admin retry. The legacy mapper now maps only the literal persistence status `ready` to API status `ready`; every non-ready persistence state is conservatively exposed as `failed` rather than as a usable empty certificate.
2. Repository behavior tests now exercise `P2034` and `P2002` retry conflicts, successful completion on the third attempt, the three-attempt ceiling, and rethrowing the terminal database error.

### Tests and the production breaks they catch

- `keeps a newer unpublished Champion from hiding the latest published event certificate`
  - Catches removal of the published-ready predicate from the single-event lookup, which otherwise returns the newer empty row.
- `keeps newer unpublished Champions from hiding published certificates in batch reads`
  - Catches removal of the published-ready predicate from the batch lookup, which otherwise stores the newer empty row as the event result.
- `does not label an unpublished Champion as ready if persistence returns one`
  - Catches loss of the single-event failure fallback and permissive status mapping that treats `generated`, `pending`, or unknown persistence states as legacy `ready`.
- `falls back per event to the latest non-published Champion when batch reads have no published version`
  - Catches batch logic that leaves an event at `null` and hides its persisted failure state when another event in the same request has a published certificate.
- `retries P2034 and P2002 write conflicts before publishing the certificate`
  - Catches removal of either retryable Prisma error code or an attempt limit below three.
- `stops after three certificate write conflicts and rethrows the terminal database error`
  - Catches an unbounded/incorrect retry limit or swallowing/replacing the final database error.

### RED evidence

Initial lookup and selection run:

```text
pnpm test src/lib/platform/repository.test.ts
Test Files  1 failed (1)
Tests       4 failed | 79 passed (83)
```

The failures showed both query paths lacked `status: ready` / `publishedUrl: { not: null }`; both observable results selected `certificate-champion-v3` with an empty URL instead of published `certificate-champion-v2`.

Status mapping run:

```text
pnpm test src/lib/platform/repository.test.ts -t "does not label an unpublished Champion"
Test Files  1 failed (1)
Tests       1 failed | 83 skipped (84)
```

Observed mismatch: expected `failed`, received `ready` for a `generated` row with no published URL.

The retry implementation already existed but lacked tests, so its new tests were mutation-verified against the exact requested production breaks: `P2002` handling was temporarily removed and the bound temporarily changed from three attempts to two.

```text
pnpm test src/lib/platform/repository.test.ts -t "retries P2034 and P2002|stops after three"
Test Files  1 failed (1)
Tests       2 failed | 81 skipped (83)
```

The first test rejected on `P2002` instead of succeeding; the exhaustion test observed two attempts instead of three. The controlled mutation was then reverted before the production lookup fix.

Independent review then found that an exclusively published-only query returned `null` when an event had only a persisted failed/generated certificate. The single and mixed-batch fallback tests were made query-sensitive and run before the fallback implementation:

```text
pnpm test src/lib/platform/repository.test.ts -t "does not label an unpublished Champion|falls back per event"
Test Files  1 failed (1)
Tests       2 failed | 83 skipped (85)
```

Observed results were `null` instead of the latest failed Champion in both single and batch APIs.

### GREEN and verification evidence

Repository GREEN immediately after the minimal fix:

```text
pnpm test src/lib/platform/repository.test.ts
Test Files  1 passed (1)
Tests       85 passed (85)
```

Amended focused Task 1 suite:

```text
pnpm test src/lib/feature-flags.test.ts src/lib/completion/schema-contract.test.ts src/lib/platform/repository.test.ts src/lib/certificate/service.test.ts src/lib/certificate/generate.test.ts
Test Files  5 passed (5)
Tests       112 passed (112)
```

Security smoke:

```text
pnpm test src/security-smoke.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)
```

Type/lint verification:

```text
pnpm lint
$ tsc --noEmit
```

Exit code: `0`.

Full regression suite:

```text
pnpm test
Test Files  92 passed (92)
Tests       831 passed (831)
```

The full suite again emitted only the existing expected stderr fixture for the password-reset email rejection test and exited `0`.

Diff verification:

```text
git diff --check
```

Exit code: `0`; only Git's Windows line-ending notices were printed.

### Fix-round self-review

- Confirmed single and batch query paths share one published-ready Champion filter and preserve descending version selection.
- Confirmed the single path falls back to the latest Champion state when no published version exists, and the batch path performs the same fallback only for event IDs still missing after the published query.
- Confirmed the batch exception fallback calls the corrected single-event path.
- Confirmed an unexpected non-ready row cannot be exposed as legacy `ready`.
- Confirmed retry tests produce both supported Prisma conflict codes, prove third-attempt success, prove the three-attempt ceiling, and preserve the terminal error object.
- Confirmed the controlled mutation was fully reverted; only the intended lookup, mapper, and test changes are present in the fix commit.

### Fix-round independent review

The first fix-round review identified one Important compatibility regression: published-only reads hid a persisted failed/generated state when no published version existed. Commit `10b4768fe67f425cca53af43e95583fbeead298f` added the single and per-event batch fallback under strict RED/GREEN coverage. The follow-up review of that commit reported no remaining Critical or Important findings.
