# Certificate fixture-budget fix implementer report

Date: 2026-09-25 (Asia/Jakarta)
Base SHA: `35f5fc9f4b54dc64ed5f75c8615a97c9bd1491e5`
Implementation commit: `6ab62b7` (`test: slim certificate publication fixture`)
Status: `DONE_WITH_CONCERNS`

## Root cause

The certificate publication-history test spent most of its 90-second budget replaying seven serial certificate-generation workflows, one initial publication workflow, and a second champion-generation workflow before it assigned the test cleanup handle. The retained CI trace therefore showed setup consuming about 66.62 seconds before the first browser action. This was a fixture-budget and cleanup-registration defect; the retained evidence did not establish a product or hydration defect.

## Correction

- `prepareCertificateFixture()` now accepts `onBaseFixtureReady` and invokes it inside the helper's cleanup-protected region immediately after `prepareCompletionFixture()` returns.
- The test wrapper assigns that exact-scope cleanup handle before completion mutation, certificate enrichment, login, or navigation, and retains the final fixture handle for `afterEach`.
- The helper keeps the real completion prerequisite, then persists seven version-1 `miracle-v3` certificate rows, one champion version-2 row, their terminal generation mutation rows, and publication revision 1 in one bounded transaction. The persisted rows use `getMiracleV3CertificateManifest()` and the existing schema contracts.
- The focused test keeps the real UI publication action and exact response waiter (POST route, `Next-Action`, event ID, and HTTP 200), then verifies revision 2, seven current certificates, superseded version-1 champion history, and localized historical/current verification pages.
- Named `test.step` boundaries cover fixture setup, organizer login, certificate navigation, and publication.

## RED/GREEN evidence

RED contract run (before implementation):

```text
& .\node_modules\.bin\vitest.CMD run tests/competition/certificate-fixture-budget.static.test.ts
exit 1
2 tests failed: missing onBaseFixtureReady, persisted certificate createMany/mutation createMany, and named setup boundaries.
```

GREEN focused browser run:

```text
pnpm exec playwright test tests/e2e/organizer-v3-certificates.spec.ts --config=playwright.ci-default.config.ts --grep 'publishes all seven certificates' --workers=1 --retries=0
exit 0
1 passed (test body 35.8s; run wall time about 1.2m including dev-server startup)
```

The brief's anchored `--grep "^publishes all seven certificates and preserves superseded verification history$"` form was also attempted, but this Playwright runner matches the full displayed title path (including the spec filename), so it returned `No tests found` before execution. A list-only check confirmed the exact title, and the successful substring-filtered run selected exactly that one test. No second browser execution was started after the single GREEN run.

## Gates and durations

| Gate | Command/result |
| --- | --- |
| Focused browser | One test passed; 35.8s test body, about 1.2m wall including server startup; workers 1; retries 0 |
| Affected unit/static | `pnpm exec vitest run tests/competition/certificate-fixture-budget.static.test.ts tests/competition/completion-e2e-fixture.test.ts` — exit 0, 2 files / 3 tests passed, 1.16s final run |
| TypeScript | `pnpm exec tsc --noEmit` — exit 0 |
| Changed-file ESLint | `pnpm exec eslint tests/e2e/helpers/completion.ts tests/e2e/organizer-v3-certificates.spec.ts tests/competition/certificate-fixture-budget.static.test.ts` — exit 0 |
| Diff check | `git diff --check` — exit 0 (only normal Git LF/CRLF conversion warnings) |

The test source now exposes named step boundaries, but the non-JSON line reporter did not emit an individual `fixture setup` duration. Therefore the exact setup-before-first-browser-action duration is not independently observable from this single permitted GREEN run; the only fresh timing evidence is the 35.8-second test-body duration. This is the remaining reporting concern, not an assertion or fixture failure.

Skips: 0. Flakes/retries: 0. The anchored-filter “no tests found” result was a command-selection issue before test execution, not a browser failure.

## Cleanup proof

The callback receives the base fixture's exact `cleanup` handle immediately after base creation. It is assigned to the spec-level `fixture` variable before `completeTournament`, logo creation, direct certificate/mutation/publication persistence, login, or navigation. The helper catch path also invokes the same event-scoped `deleteMany` cleanup, and `afterEach` invokes it for ordinary failures and Playwright teardown; the operation is idempotent and constrained by both event ID and slug. No global delete, sweep, reset, or seed was added.

## Changed files

- `tests/e2e/helpers/completion.ts`
- `tests/e2e/organizer-v3-certificates.spec.ts`
- `tests/competition/certificate-fixture-budget.static.test.ts`
- This report (force-added separately because `.superpowers/` is ignored)

## Self-review

- Publication-history assertions, localized verification assertions, exact response predicates, and HTTP 200 assertion remain intact.
- No product code, timeout, retry, `test.slow()`, Playwright config, workflow, auth, rate-limit, seed/reset, sleep, skip, forced interaction, or push change was made.
- The direct rows preserve exactly seven current certificate types, revision-1 history, champion version 2, canonical render/asset manifests, and eight terminal generation mutation records expected by the focused case.
- The three protected pre-existing untracked roots were not staged or edited:
  - `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
  - `public/certificates/e2e-completion-single_elimination-release-journey-en/`
  - `public/certificates/e2e-completion-single_elimination-release-journey-id/`

No database reset, seed, full certificate file/profile, timeout/retry change, production action, or push was performed.
