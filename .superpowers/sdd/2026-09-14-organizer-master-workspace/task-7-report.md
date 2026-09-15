# Task 7 implementation report

Base: 135802f9db49e657c89059fb707ce5299b71cd0e.
Task 5 integration fix: 19c871011d49a57b252ca10448a0d438ecc26cae.
Status: implemented and verified; independent review pending.

## Scope

- Master flag composes focused Competition, Schedule and Match Control screens through the existing shared workspacePage boundary used by the three canonical route pages. The route wrappers already forward all props, so no no-op route edits were needed.
- Competition displays drawing, authoritative format phases, bounded standings/brackets and qualification context. League never invents a final. Drawing locks use the authoritative event status plus active-phase publication and official/terminal matches.
- Schedule displays bounded fixture rows, phase/group/round/event-local calendar-day filters, publication version and the existing schedule form. Filtered override controls preserve the complete input state and existing engine commands; publication remains explicit and requires published drawing.
- Match Control supplies live/next/needs-result/readiness/action/incident/delayed/completed filters, priority badges, 12-row pagination, stable URL-selected match summary, readiness and guarded start through the existing versioned action, and the canonical match detail link. Result/statistics/history forms remain Task 8 and existing match detail is unchanged.
- All new interface copy uses organizerOperations next-intl messages. An adapter obtains existing drawing/schedule control labels from the same namespace without replacing their operations. Engine scheduling diagnostics are presented as localized code-based explanations.
- Reader adds serializable event.status, drawingPublished (active authoritative phases), and per-match scheduleVersion. Existing authorization, repeatable-read transaction, polling, CAS and idempotency behavior remain intact.
- Master composition reuses the event shell without a second navigation rail. Explicit inherited font variables preserve Montserrat for headings/table text despite the legacy global heading font rule.

## Test-first evidence

- Initial required four-file RED: 15 failures / 68 passed (missing query/selection/queue/status/lifecycle behavior).
- Initial GREEN: 4 files / 83 tests.
- Active legacy publication / schedule version / action reason RED: 4 failures; GREEN: 87 tests.
- Draft drawing publication + Indonesian scheduling diagnostics RED: 1 failure; GREEN included below.
- Active legacy drawing locked without drawing-order record RED: 1 failure; GREEN included below.
- Final required command: 4 files / 90 passed.
- Full unit suite before commit: 176 files passed / 2 skipped; 1,971 tests passed / 6 skipped.
- Typecheck passed. Changed-source ESLint: 0 errors, one pre-existing unused isSafeStatToken warning in actions.ts:317. Diff check passed (existing CRLF normalization notices only).

## Browser and end-to-end evidence

- The local production-component browser harness was run against the final source: 120 cases (ID/EN × 360/390/768/1024/1440 × Competition/Schedule/Match Control × four formats). All passed with no document overflow, undersized targets, or page errors. Keyboard filter navigation, URL selection/highlight, back navigation and needs-result filtering passed. Reduced motion was enabled. Desktop Match Control and Indonesian mobile Schedule screenshots were inspected.
- Harness: .superpowers/sdd/2026-09-14-organizer-master-workspace/task-7-browser.mjs. Generated screenshots/results remain ignored and are not committed.
- Guarded .env.test preflight passed against the non-production Delicate branch.
- The exact planned command with --project=chromium failed because playwright.config.ts currently defines only an unnamed project. The configuration was not changed; that mismatch belongs to Task 11.
- With existing unnamed configuration and installed msedge channel, the same spec passed 10/10 with --fail-on-flaky-tests in 2.9m (existing composition).
- Repeated with FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3=true: 10/10 passed in 3.5m. No flaky retry. The flag survives the guarded environment loader.

## Authorized integration correction

The first real E2E prewarm exposed an earlier Task 5 defect: src/lib/actions.ts directly re-exported registration actions from a use-server module, which Next rejected and caused /en/login HTTP 500. Controller approved a narrow fix. Six explicit async wrappers preserve the shared implementations, names, arguments and results. A server-export AST compatibility regression failed first; it and the existing actions/registration suites passed 170 tests. Real E2E compilation and all 10 stories then passed. No registration business logic changed.

## Limits and remaining release work

No production database, deployment, production flag, schema or migration was changed. Test fixtures used the existing guarded non-production lifecycle. The protected untracked release verification report remains untouched. Task 8 forms, Task 9+ work and final release approval are outside this task. The named Chromium project mismatch remains documented for Task 11.

Committed-HEAD full verification is run after this report/source commit and returned in the task handoff.
