# Task 2 Report: Add launch-ready team import domain types and CSV validation pipeline

## Status

Completed on Friday, July 31, 2026.

## Scope delivered

- Extended `Team` to carry imported captain contact fields needed by launch-week registration import.
- Added `src/lib/imports/team-import.ts` with:
  - `TeamImportRow`
  - `TeamImportError`
  - `buildTeamTag`
  - `parseTeamImportCsv`
  - `validateTeamImportRows`
  - `importTeamsFromRows`
- Added whole-file validation that:
  - requires `event_slug`, `team_name`, `captain_name`, and `captain_contact`
  - accepts optional `team_tag`
  - auto-generates `team_tag` from `team_name` when blank
  - rejects invalid `event_slug`
  - rejects duplicate `team_name` within the same event
  - collects all validation errors in one pass
- Added atomic store writer support in the current demo-store architecture.
- Added focused tests for parse/validate/import behavior.

## TDD evidence

### RED

Test file written first:

- `src/lib/imports/team-import.test.ts`

Initial RED verification command attempted from the brief:

```powershell
corepack pnpm vitest run src/lib/imports/team-import.test.ts
```

Environment result:

- `corepack` was not available in this machine shell.

Equivalent direct Vitest run used to preserve the same single-file RED check:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\vitest\vitest.mjs' run src/lib/imports/team-import.test.ts
```

RED result:

- Suite failed before implementation existed.
- Failure: `Cannot find module './team-import' imported from 'src/lib/imports/team-import.test.ts'`

This confirmed the test was genuinely failing for the expected missing-feature reason.

### GREEN

After minimal implementation, reran:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\vitest\vitest.mjs' run src/lib/imports/team-import.test.ts
```

GREEN result:

- `1 passed` test file
- `3 passed` tests
- exit code `0`

## Verification evidence

Focused import test verification:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\vitest\vitest.mjs' run src/lib/imports/team-import.test.ts
```

Result:

- pass

TypeScript verification:

First attempt:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\typescript\bin\tsc' --noEmit
```

Result:

- blocked only by `EPERM` writing `tsconfig.tsbuildinfo`

Clean verification rerun without incremental cache writes:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\typescript\bin\tsc' --noEmit --incremental false
```

Result:

- pass
- exit code `0`

## Files changed

- `src/lib/platform/types.ts`
- `src/lib/platform/demo-store.ts`
- `src/lib/imports/team-import.ts`
- `src/lib/imports/team-import.test.ts`

## Minimal implementation notes

- Import remains demo-store based as required.
- Validation is whole-file and atomic: import only writes after rows have already passed validation.
- Duplicate detection covers:
  - existing registered teams in the target event
  - repeated team names within the incoming CSV for the same event
- `team_tag` generation uses initials from the team name and falls back to the first two uppercase characters when needed.

## Self-review

Checked the diff against the brief and current architecture.

What I specifically reviewed:

- No database or Prisma work introduced.
- No partial-write path introduced before validation succeeds.
- Required and optional CSV columns match the brief verbatim.
- Duplicate rejection is scoped to team name within the same event.
- Imported captain fields are stored on `Team` only as needed for launch import support.

## Concerns

- `parseTeamImportCsv` currently uses a simple comma-split parser, which is sufficient for the launch brief and current test cases but does not support quoted commas inside CSV cells.

## Commit

- Commit created after verification: `feat: add launch csv team import pipeline`

---

## Fix round 1: CSV parser safety and structured parse errors

### Findings addressed

- High: replaced comma-split parsing with a small quoted-field parser and explicit row-width rejection.
- Medium: header failures now return structured `TeamImportError` entries instead of throwing.
- Low: added coverage for quoted fields, malformed row width, missing headers, and unsupported headers.

### Scope of the fix

- Kept the work scoped to Task 2 only.
- Did not add a new CSV dependency.
- Changed `parseTeamImportCsv` to return structured parse output:
  - `rows`
  - `errors`
- Preserved whole-file validation and atomic import behavior.

### TDD evidence for fix round 1

#### RED

Added failing tests for:

- quoted field parsing with embedded commas
- malformed row width rejection
- missing required header rejection through structured errors
- unsupported header rejection through structured errors

RED verification command:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\vitest\vitest.mjs' run src/lib/imports/team-import.test.ts
```

RED output:

```text
RUN  v3.2.7 E:/dev/MiracleTourney-gitnative

❯ src/lib/imports/team-import.test.ts (7 tests | 7 failed)
  × team import pipeline > collects all CSV validation errors in one pass
    → parsed.errors is not iterable
  × team import pipeline > auto-generates a team tag when team_tag is empty
    → parsed.errors is not iterable
  × team import pipeline > imports valid rows atomically after full-file validation passes
    → parsed.errors is not iterable
  × team import pipeline > parses quoted fields instead of splitting on embedded commas
    → parsed.errors is not iterable
  × team import pipeline > returns structured errors for malformed rows with the wrong column count
    → parsed.errors is not iterable
  × team import pipeline > returns structured header errors instead of throwing for missing required columns
    → Missing required CSV column "captain_contact"
  × team import pipeline > returns structured header errors for unsupported columns
    → Unsupported CSV columns: captain_email

Test Files  1 failed (1)
Tests       7 failed (7)
```

This showed the exact root cause:

- parser contract still returned rows only
- header failures still threw instead of entering the validation error pipeline

#### GREEN

Implemented:

- a small stateful CSV line parser with quoted-field support
- unmatched-quote detection
- explicit row-width checks
- structured row 1 header errors for missing and unsupported columns
- structured parse result returned from `parseTeamImportCsv`

GREEN verification command:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\vitest\vitest.mjs' run src/lib/imports/team-import.test.ts
```

GREEN output:

```text
RUN  v3.2.7 E:/dev/MiracleTourney-gitnative

✓ src/lib/imports/team-import.test.ts (7 tests) 17ms

Test Files  1 passed (1)
Tests       7 passed (7)
```

### Verification after fix round 1

Focused import test verification:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\vitest\vitest.mjs' run src/lib/imports/team-import.test.ts
```

Result:

- pass
- `7 passed` tests

TypeScript verification:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'E:\dev\MiracleTourney-gitnative\node_modules\typescript\bin\tsc' --noEmit --incremental false
```

Result:

- pass
- exit code `0`

### Files changed in fix round 1

- `src/lib/imports/team-import.ts`
- `src/lib/imports/team-import.test.ts`

### Self-review for fix round 1

- Confirmed quoted commas are accepted inside quoted fields.
- Confirmed malformed rows are rejected clearly instead of being silently shifted.
- Confirmed header failures are returned as structured errors compatible with the import pipeline.
- Confirmed existing Task 2 behaviors still pass:
  - whole-file validation
  - atomic import
  - duplicate detection
  - auto-generated team tags

### Concerns after fix round 1

- The launch-safe parser now supports quoted commas and escaped quotes, but it still intentionally stays narrow and line-based; it does not attempt multi-line quoted cell support because that was outside Friday, July 31, 2026 launch scope.
