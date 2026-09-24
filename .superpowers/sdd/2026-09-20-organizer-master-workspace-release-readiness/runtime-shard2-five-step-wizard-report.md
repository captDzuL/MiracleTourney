# Runtime shard 2 five-step wizard contract repair

## Scope

This change repairs only the three stale contracts in `tests/e2e/v3-organizer-lifecycle.spec.ts`:

- `organizer can create, autosave, preview, revoke, and publish an event`
- `workspace navigation labels fit without overlap at id tablet widths`
- `workspace navigation labels fit without overlap at en tablet widths`

No production code, authentication, existing test timeout, retry, skip, or Failure 6 artifacts were changed. The pre-existing protected certificate/report artifacts were left untouched.

## Contract repair

- Added a focused static contract test at `tests/competition/v3-organizer-lifecycle.static.test.ts`.
- Re-entered the canonical `/{locale}/organizer/events/{eventId}/edit` five-step wizard after creation instead of treating `/overview` as the editor.
- Updated the Indonesian lifecycle controls and labels to the current accessible names: `Kembali`, `Lanjut`, `Langkah N dari 5`, and `Acara dimulai`.
- Preserved the lifecycle's autosave, reload persistence, preview, revoke, publication, and public-page assertions. Publication is verified through the durable workspace metadata contract `Publikasi` → `Diterbitkan`, followed by the public event heading.
- Kept the existing 700/768/980 px tablet geometry assertions and added the valid canonical editor navigation contract: one outer navigation with one `aria-current="step"` link.
- Moved event ownership tracking into a test-scoped `lifecycleTest` fixture. Its teardown has an isolated 30,000 ms fixture budget, while the existing 90,000 ms test budgets remain unchanged.

## TDD evidence

Focused static command:

```powershell
.\node_modules\.bin\vitest.CMD run tests/competition/v3-organizer-lifecycle.static.test.ts
```

The initial static contract ran RED against the stale source (4 failing expectations). Two subsequent focused RED checks caught the stale Indonesian `Event dimulai` label and the fabricated post-publication review status locator (1 failure each). For this review fix, the new fixture-placement contract ran RED with 1 failure because no `lifecycleTest` teardown fixture existed. After the minimal test-only repair, the same command ran GREEN with 1 file and 4 tests passed.

## Browser verification

The focused browser run was executed serially against the current guarded database, with no reset or seed command:

```powershell
$env:FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3='true'; & .\node_modules\.bin\playwright.CMD test tests/e2e/v3-organizer-lifecycle.spec.ts --config playwright.config.ts --grep 'organizer can create, autosave, preview, revoke, and publish an event|workspace navigation labels fit without overlap at'
```

Result: **3 passed, 0 skipped** (lifecycle 42.4s; ID tablet 6.7s; EN tablet 6.3s; total 1.6m).

The first diagnostic run confirmed the blocking stale locator: `getByLabel('Event dimulai')` waited from approximately 64.859s until the unchanged 90s test timeout. The current Indonesian editor exposes `Acara dimulai`. The Prisma engine error reported during that timed-out run was secondary cleanup failure after the test had consumed its timeout, not a product or fixture diagnosis. The final run completed cleanup normally.

The transient failure-path probe used the same lifecycle test with `LIFECYCLE_CLEANUP_PROBE=true` and injected an error immediately after the draft creation redirect. The intentional Playwright result was 1 failed test at the injected line with exact slug `v3-lifecycle-1790223071198-b4id1v`; this failure is not present in the final source. A guarded Prisma lookup for that exact slug returned `null` after the run, proving fixture teardown removed the created event despite the test failure.

## Cleanup proof

Each of the three focused tests registers its generated event with the test-scoped `lifecycleTest` fixture. Fixture teardown runs after the test body—even on failure—with its own 30,000 ms budget. `cleanupCreatedOrganizerEvent`:

1. Resolves the seeded organizer by the exact email `organizer-a@miraclefc.gg`.
2. Looks up only the event's exact generated slug.
3. Refuses deletion if the event owner does not match that organizer.
4. Deletes only the matching event ID, slug, and `organizerUserId`.
5. Asserts exactly one row was deleted and that a post-delete count is zero.

No prefix deletion, database reset, or seed step is used. Guest preview contexts remain closed in the lifecycle test's `finally` block. The final three-test run passed, and the injected failure probe's exact-slug lookup returned `null`; unrelated pre-existing V3 lifecycle rows and the protected artifacts were not touched.

## Final verification

All required checks passed on branch `codex/organizer-release-readiness`:

```powershell
.\node_modules\.bin\tsc.CMD --noEmit
.\node_modules\.bin\eslint.CMD tests/e2e/v3-organizer-lifecycle.spec.ts tests/competition/v3-organizer-lifecycle.static.test.ts
git diff --check
```

Final diff scope is limited to the lifecycle E2E contract, its focused static contract test, and this report. The change is test-only and was committed without pushing.

## Review round 2: mode-aware route contract

### TDD RED/GREEN

The focused static command was:

```powershell
.\node_modules\.bin\vitest.CMD run tests/competition/v3-organizer-lifecycle.static.test.ts
```

After adding the mode-aware static expectations but before changing the E2E source, RED was **2 failed, 2 passed, 0 skipped**, duration **316 ms**. The failures were the missing `FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3` mode constant and the missing off/on route destination assertions in the lifecycle and tablet blocks.

After the minimal route change, the same command was GREEN at **4 passed, 0 skipped**, duration **273 ms**. Adding the legacy publication/no-outer-nav assertions then produced a focused RED of **1 failed, 3 passed, 0 skipped** in **299 ms**; the final static GREEN was **4 passed, 0 skipped** in **402 ms**.

The final source derives `eventEditorRoute` from the actual flag: off mode visits `/overview`, while flag-on visits `/edit`. The lifecycle keeps all five-step, autosave, reload, preview, revoke, publish, and public-page checks. Publication uses the durable master-shell metadata in flag-on and the durable legacy `Acara sudah diterbitkan` state in off mode. Tablet geometry assertions for the five-link active-step navigation remain unchanged under flag-on; off mode explicitly verifies the legacy setup controls and the absence of that mode-inapplicable outer navigation.

### Dual-profile browser proof

The controller confirmed the guarded database baseline before browser access: 7 seeded events, `suspiciousCount: 0`, and the two exact overnight-smoke residues removed and verified absent. Both final browser runs used one worker, no reset/seed command, and no retries:

Default/off profile, with the flag explicitly unset:

```powershell
Remove-Item Env:FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3 -ErrorAction SilentlyContinue; & .\node_modules\.bin\playwright.CMD test tests/e2e/v3-organizer-lifecycle.spec.ts --config playwright.ci-default.config.ts --grep 'organizer can create, autosave, preview, revoke, and publish an event|workspace navigation labels fit without overlap at'
```

Result: **3 passed, 0 skipped** (lifecycle **35.9s**, ID tablet **7.4s**, EN tablet **5.8s**, total **1.5m**).

Flag-on profile:

```powershell
$env:FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3='true'; & .\node_modules\.bin\playwright.CMD test tests/e2e/v3-organizer-lifecycle.spec.ts --config playwright.config.ts --grep 'organizer can create, autosave, preview, revoke, and publish an event|workspace navigation labels fit without overlap at'
```

Result: **3 passed, 0 skipped** (lifecycle **38.7s**, ID tablet **6.8s**, EN tablet **6.0s**, total **1.5m**).

An initial off-mode diagnostic run before the mode-aware publication and navigation branches failed all three cases only at those mode-mismatched assertions; its fixture teardown left zero new lifecycle rows, confirmed by a read-only guarded query before the successful retry. No final run flaked or retried.

### Self-review

- `git diff` is limited to the test spec, its static contract, and this report; no product code, auth, worker, retry, skip, or existing test timeout changed.
- The exact owner/slug/ID cleanup predicate and 30-second fixture teardown budget remain intact for success and failure paths.
- The temporary failure probe is absent from the final source; only its prior exact-slug `null` proof remains documented.
- The protected certificate/report artifacts remain untouched, and no push was performed.
