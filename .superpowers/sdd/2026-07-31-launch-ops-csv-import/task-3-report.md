# Task 3 Report — Wire admin CSV upload into server actions and admin UI

Date: Friday, July 31, 2026

## Scope completed

- Kept the inherited action/import work in place:
  - `adminImportTeamsCsvAction(...)` in `src/lib/actions.ts`
  - `ImportResultBanner` in `src/components/ui.tsx`
  - `DemoStateLike`, `ParseResult`, and `parseAndValidateTeamImport(...)` in `src/lib/imports/team-import.ts`
  - `getImportSnapshot()` in `src/lib/platform/demo-store.ts`
  - invalid-upload redirect test in `src/lib/imports/team-import.test.ts`
- Finished the missing admin UI wiring in `src/app/admin/page.tsx`
- Added the downloadable template asset at `public/templates/team-import-template.csv`
- Added page-level verification in `src/app/admin/page.test.ts`

## TDD record

### Preserved existing RED evidence

- The inherited action-level invalid upload test remained in place:
  - `rejects CSV uploads with validation errors and preserves store state`

### Added missing RED coverage

- Added `src/app/admin/page.test.ts` to cover:
  - rendering the team import section
  - success feedback from query params
  - readable import error feedback from query params
  - presence of the template download link
  - presence and contents of `public/templates/team-import-template.csv`

### Observed failing state before implementation

- First run of `src/app/admin/page.test.ts` failed because:
  - the admin page did not yet render the import section
  - the template CSV file did not yet exist
  - the page/UI components needed explicit React imports for this Vitest server-render harness

### GREEN implementation

- Wired `adminImportTeamsCsvAction` into the admin page
- Replaced ad-hoc success messaging with `ImportResultBanner`
- Added the CSV upload section and template link
- Added the template CSV file
- Added explicit React imports needed by the server-render test harness
- Removed redundant `encType` from the server-action form to keep verification output clean

## Implementation details

### `src/app/admin/page.tsx`

- Imported and used `adminImportTeamsCsvAction`
- Imported and used `ImportResultBanner`
- Expanded `searchParams` support to:
  - `success`
  - `count`
  - `importError`
  - `error`
- Added a dedicated “Import teams from CSV” admin section with:
  - file input named `csvFile`
  - template download link
  - submit button

### `public/templates/team-import-template.csv`

- Added the required header row:
  - `event_slug,team_name,team_tag,captain_name,captain_contact`
- Added one example row for admin guidance

### `src/app/admin/page.test.ts`

- Added page-level rendering coverage for the admin import workflow
- Added asset existence/content coverage for the template CSV

## Verification run

Executed fresh after implementation:

```txt
vitest run src/app/admin/page.test.ts src/lib/imports/team-import.test.ts
11 tests passed
```

```txt
tsc --noEmit --incremental false
passed
```

## Self-review

- The upload form now points at the intended server action
- Import feedback is surfaced via query params with explicit success/error states
- The template asset path matches the admin link exactly
- Atomic import behavior remains enforced by the existing action/parser/import pipeline
- No database work was introduced; behavior stays on the current demo-store architecture

## Concerns

- None blocking.
