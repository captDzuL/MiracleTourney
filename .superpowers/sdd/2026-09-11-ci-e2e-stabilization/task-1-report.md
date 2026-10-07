# Task 1 Report — Registration-import E2E fixtures

## Implementation

Aligned all registration-import CSV fixtures with the V3 captain identity contract by adding `captain_ign` and `captain_uid` columns before the player nickname column. Generated rows now include stable captain IGN/UID pairs (`Captain${number}`, `UID-${number}`); fixed inline smoke/admin rows use stable values; the late-import fixture uses `LateCaptain` and `UID-LATE`.

## Files changed

- `tests/e2e/admin-event-management.spec.ts`
- `tests/e2e/overnight-smoke.spec.ts`
- `tests/fixtures/late-import-after-lock.csv`

## Tests and results

RED (before fixture repair):

`pnpm exec playwright test tests/e2e/admin-event-management.spec.ts tests/e2e/overnight-smoke.spec.ts --grep "import|publish" --reporter=line`

Result: 4 failed, 1 passed. Import paths failed with `Mapping wajib belum ditemukan: captain IGN, captain UID.`

GREEN verification after repair (clean database):

`pnpm test:e2e:prepare`

Result: isolated E2E database reset and seeded successfully.

`pnpm exec playwright test tests/e2e/admin-event-management.spec.ts tests/e2e/overnight-smoke.spec.ts --grep "import|publish" --reporter=line`

Result: 3 failed, 2 passed. The captain mapping error is absent. The remaining three failures are existing preview assertions receiving zero checked `itemId` rows; the publish/status and locked-import URL assertions pass.

## RED/GREEN evidence

- RED reproduced the required stale-header mapping failure.
- Post-repair runs no longer produce the captain IGN/UID mapping error.
- The focused suite does not reach full GREEN because preview rows remain unselected in three import assertions.

## Self-review

- Confirmed `git diff --check` is clean.
- Confirmed only the three files listed in the brief are modified.
- Confirmed all CSV headers have eight columns and all generated rows include captain IGN and UID before player nickname.

## Concerns

The requested focused suite remains partially failing after the fixture-only repair: three tests report zero checked preview rows. This is distinct from and downstream of the repaired captain mapping error; no production code or unrelated tests were changed.
## Follow-up diagnosis and final GREEN evidence

The initial downstream checkbox failures were traced to fixture rows not meeting the seeded mode roster constraints: V3 adds the captain to the roster, so Kuroko 3v3 needs one additional non-captain nickname, while generated Flashpeak 5v5 rows need four non-captain nicknames. The admin/smoke single-team fixtures also reused seeded slots (`KS1`) to avoid exceeding Kuroko’s seeded participant cap.

After those fixture-only corrections:

`pnpm test:e2e:prepare`

Result: isolated E2E database reset and reseeded successfully.

`pnpm exec playwright test tests/e2e/admin-event-management.spec.ts tests/e2e/overnight-smoke.spec.ts --grep "import|publish" --reporter=line`

Final result: **5 passed** (0 failed). Captain mapping errors and unchecked preview rows are resolved.