# CI 36191361055 Semantic Settlement Implementation Report

Date: 2026-09-26
Branch: `codex/organizer-release-readiness`
Commit marker: `[ci:failing4-only]`

## Outcome

Implemented the targeted Miracle V3 CI correction from `ci-36191361055-root-cause-tdd-brief.md`.

- QRIS publication now settles through `runAndSettleServerActionUi` with the exact registration POST pathname and `?view=qris` search, then requires localized `qrisPublished` feedback before the existing published-status/version receipt.
- Official-result submission now settles through the same helper with the exact match-detail POST pathname and empty search, then requires the mode-appropriate localized saved feedback before the existing result-version, score, status, and revision receipts. Legacy mode uses `Saved. Updating workspace.` / `Tersimpan. Memperbarui ruang kerja.`.
- The public lifecycle is three serial tests with independent 120-second budgets: registration/drawing, ongoing/result, and finished/certificates. The shared fixture and teardown remain describe-scoped; the finished test performs a fresh admin login and consumes the persisted completion/podium state.
- The `[ci:failing4-only]` workflow lane remains preflight-only for database setup and now targets the two organizer part-A locale tests plus the three public lifecycle tests (exactly five cases).
- No retries, skips, sleeps, forced clicks, timeout increases, prepare/seed/reseed steps, listener-limit changes, or product code changes were added.

## TDD evidence

1. RED: added `tests/competition/ci-36191361055-semantic-settlement.static.test.ts` and updated the public budget contract. Before implementation, the organizer contract suite reported 4 failures for the missing QRIS/result settlement boundaries; the public budget contract reported 1 failure because the old combined terminal test was still present.
2. GREEN: implemented only the two settled action blocks and the public three-test split. The mutation assertions reject removal of exact search matching, localized UI settlement, and authoritative receipts.

### Review follow-up

The P2 review identified that the budget contract did not reject an extra fourth lifecycle test or an additional timeout control. The contract now isolates the adaptive describe body, requires exactly the three approved test titles, normalizes the three approved `test.setTimeout(120_000)` lines, and rejects any remaining timeout/slow/skip/fixme, sleep, or retry control. RED was confirmed when the new fourth-test, `test.setTimeout(180_000)`, and `test.slow()` mutations passed the old contract; GREEN was confirmed after tightening the assertions.

### Second review follow-up

The follow-up review found two remaining mechanical escapes. Declaration parsing now accepts double-, single-, and template-quoted test titles while requiring exactly the three approved declarations. The contract also requires exactly one approved `test.describe.configure({ timeout: 120_000 })`, normalizes it with the three per-test budgets, and rejects any remaining describe configure or timeout-bearing property. RED was confirmed with single-quoted, template-quoted, and extra-describe-timeout mutations; GREEN was confirmed after the parser and normalization update.

## Browser-free verification

The repository's PowerShell `pnpm exec` shim did not resolve the local Vitest binary (`'vitest' is not recognized`), although `node_modules/.bin/vitest.cmd` was present. The equivalent local binaries were used for the same checks.

| Check | Result | Duration |
| --- | --- | ---: |
| Targeted static contracts: semantic settlement, budget split, shared response settlement, Task 11 release contracts, and CI lane | 5 files, 74 tests passed, 0 failed | 1.39s Vitest-reported at final HEAD |
| Focused review-follow-up budget contract | 1 file, 8 tests passed, 0 failed | 326ms Vitest-reported |
| Typecheck (`tsc --noEmit --incremental false`) | exit 0 | ~16.5s wall |
| Targeted ESLint | 0 errors | ~4.4s wall |
| `git diff --check` | exit 0 | <1s |

The live browser/GitHub gate was not run in this browser-free implementation pass, and no push was performed.

## Protected workspace state

The pre-existing untracked roots were preserved unchanged:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

## Blockers

Only the local `pnpm exec` resolution issue above remains an environment-level verification note. No implementation blocker was found.
