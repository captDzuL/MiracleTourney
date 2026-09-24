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
