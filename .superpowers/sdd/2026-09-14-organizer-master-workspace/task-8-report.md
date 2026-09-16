# Task 8 — combined result and statistics workspace

Base: `465192fa8527b6463bccaee1ff0f27443292a9b7`. Implementation and verification in the isolated release worktree; independent review pending. No Task 9/completion feature, schema change, production operation, or protected release-report edit.

## Implemented contract

- Canonical match route uses URL-backed result/statistics/history views with master enabled; master disabled preserves legacy workspace routing.
- Result input reuses ResultControls/authoritative engine and ordered persisted MatchGame values for BO1/BO3/BO5. Reopen is an explicit correction edit mode: published values remain until existing result_correct succeeds; cancel does not mutate. Existing readiness, deadline, override start and delay operations remain available.
- Shared captain/organizer parser enforces Flashpeak scores in [0,10] with at most one decimal or null, goal/assist/passing/defense, played-game alignment and roster membership. Existing reader-only aliases do not add singular/plural values together. No new Flashpeak blocks/tackles writes.
- Captain writes remain pending and do not publish PlayerStat rows. Resubmission clears former review metadata. Organizer save/approve/reject all use one guarded core, including legacy callers with preserved signatures.
- The approved server expansion uses existing event-version lock and CompetitionAuditLog receipt, no second result engine. Actual actor role/ownership/password and event/match/submission relationships are rechecked inside Serializable transactions. Pending submission CAS occurs before PlayerStat mutation. Event/result/submission stale versions and competing reviewers fail without partial writes; exact actor/fingerprint operation replay is safe. Unknown client outcomes retain the same original operation for explicit retry and lock competing UI writes.
- Complete ID/EN labels, guides, inline field errors, correction confirmation, bounded roster/history tables, Miracle V3 tokens/Montserrat, 44px controls and keyboard focus.

## RED/GREEN evidence

Initial empty-payload/pre-CAS tests failed (2) before fixes. Guarded authorization/version/replay tests failed (9) before core implementation. Action contract tests failed (12), reader tests failed (2), workspace tests failed (11), route tests failed (2), inline validation tests failed (2), preserved operation test failed (1), and captain metadata regression failed (1) before their corresponding fixes. Stateful transaction regression injects PlayerStat storage failure after pending claim and verifies submission/event rollback. Final self-inspection added two failing ID/EN event-timezone regressions, fixed by passing the event timezone into submission/review cards. Required latest focused command passes 5 files / 322 tests.

## Browser and static evidence

Production component bundle, real CSS/font/next-intl and OrganizerMasterShell, injected action transport only: 110 cases pass. ID/EN at 360/390/768/1024/1440, three URL views and BO1/BO3/BO5 (90); scheduled/live controls at all widths/locales (20). Checks: no document overflow, no visible controls below44px, Montserrat, tab navigation, invalid score/no mutation/field focus, canonical payload, rejection-note focus, mobile drawer initial/trapped/restored focus, Escape, URL navigation/back. Twelve screenshots retained locally; desktop English result and mobile Indonesian statistics visually inspected. Harness/artifacts are local evidence, not application routes.

Typecheck passes, including after the timezone/helper fixes. Scoped ESLint: zero errors, four pre-existing unused-symbol warnings in repository source/tests; latest component/E2E lint has no warnings. Prisma validate passes, schema unchanged. Diff whitespace check passes. Latest full suite before the final two timezone tests: 179 files passed / 2 skipped, 2020 tests passed / 6 skipped. No full suite on final committed HEAD yet: the user requested a low-limit handoff, so no further broad runs were started.

## Guarded E2E and investigation

Non-production preflight passed against the configured Delicate test branch; no connection secrets recorded. Planned chromium project command was attempted and cannot resolve because existing config has only unnamed project; unchanged config uses established Edge channel. Initial master-OFF suite22/22 passed. Initial master-ON run16 passed/6 failed: five tests expected correction controls before the newly approved explicit reopen step; tests now follow that UI. Latest master-ON23-story run22 passed/1 failed; all canonical result/correction/readiness/delay and new organizer-save/captain-review stories passed.

Legacy failure root cause confirmed: trace shows the expected unique input selected, but actual DOM and submitted multipart field already contain 0; action 303 and authoritative DB readback agree. Existing HydrationGate makes inputs inert until hydration while the old test only waits for visible text. Minimal Edge reproduction: fill 4 while inert resolves but retains 0/no focus; after readiness it becomes 4/focused. Master-OFF pre-fix repetitions reproduced the same failure (8 passed / 1 failed). Approved test-only fillGoal helper waits the relevant submit enabled, fills once and asserts input value. All authoritative DB checks remain; no sleeps or mutation retries.

Corrected master-ON targeted repetitions: 9/9 pass. Final full master-ON specs: 23/23 pass (5.9m), including the canonical organizer-save/captain-review story. The chained master-OFF full specs remain running in shell session 59639 at handoff. This same command will finish after OFF, without starting any further run. Browser matrix rerun after timezone fix: 110/110 pass. Locale parity: 85 keys and 28 reused-control translations match.

## Handoff

Production implementation commit: 2a7a70ef53d30580ed3a5227a06f9ded8f2ecf05. Follow-up focused commits contain timezone regression/fix, E2E flows/readiness correction and this evidence. Final HEAD is reported by the handoff response. Independent review is still pending; Task 8 is not marked reviewed complete.

Next action: collect session 59639 completion (master-OFF expected 22 applicable stories plus one explicit master-only skip), record its actual result, then run the required focused command and full unit/static verification on final committed HEAD when budget permits. Request independent Task 8 review and address findings before starting Task 9. Do not modify the protected untracked release report. Browser harness and machine-readable results are retained alongside this report; screenshots remain local only.

## Limits

Unit race/rollback tests use stateful injected Prisma transaction boundaries, not proof of every real PostgreSQL interleaving. Guarded E2E exercises actual writes/readback/audit and engine correction against the non-production database; no stress/concurrency claim. Browser matrix mocks mutation transport; E2E provides the real transport/storage evidence. This task does not certify full release readiness.
