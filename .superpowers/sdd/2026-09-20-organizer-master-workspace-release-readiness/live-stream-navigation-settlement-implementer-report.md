# Live-stream navigation settlement fix implementer report

Date: 2026-09-25 (Asia/Jakarta)
Base SHA: `b3d3f4aae97a57b27e0888fa236f51126ae205a8`
Implementation commit: `9cf397ddc0ccb03a73c9c79d3f8209dc9517f6aa` (`test: settle live-stream redirect navigation`)
Status: `DONE_WITH_CONCERNS`

## Root cause

The live-stream Save test clicked the Server Action form and only then began
waiting for the redirect URL. The action's HTTP 303/redirect can commit near
the assertion boundary, so the post-click URL assertion could observe the
pre-save `/en/admin?phase=prepare` URL even though the write and redirect were
successful. The retained CI trace in the brief identifies this as a test
synchronization race; production action and redirect behavior were left alone.

## Correction

- `page.waitForURL` is now registered before the Save click.
- Its predicate requires the localized `/en/admin` pathname and the exact
  `success=stream-updated` query value, with `waitUntil: "domcontentloaded"`.
- The waiter and UI click are awaited together with `Promise.all`.
- The existing final success URL assertion remains in place.

No timeout, retry, sleep, `test.slow()`, skip, forced interaction, seed/reset,
production action, or success-contract weakening was added.

## RED/GREEN evidence

The brief's exact command was attempted first. In this checkout,
`pnpm exec` required the existing local `node_modules/.bin` directory on PATH;
after that environment correction, the anchored grep selected zero tests because
this Playwright runner matches the full displayed title path, including the
`admin event management` describe prefix. The command therefore exited 1 with
`No tests found` before browser execution.

The equivalent pre-change focused selection (`--grep "admin can update live
stream URL"`) did execute one test and passed, so the historical race was not
reproducible in this local run. It exited 0 with a 16.4s test body and
53.311s measured process duration (workers 1, retries 0). The retained CI
failure and trace described in the brief remain the RED evidence for the race:
the `Next-Action` POST returned HTTP 303 after 5,065.445ms, the redirected RSC
GET to `/en/admin?success=stream-updated` returned HTTP 200 in 117.112ms, and
the assertion observed `/en/admin?phase=prepare` even though the final trace
snapshot already contained the success URL.

Post-change GREEN used the same equivalent substring selection to exercise the
actual test:

```text
pnpm exec playwright test tests/e2e/admin-event-management.spec.ts --config=playwright.ci-default.config.ts --grep "admin can update live stream URL" --workers=1 --retries=0
exit 0
1 passed; test body 18.1s; 57.0s Playwright run; 58.220s measured process duration
```

The passing pre-armed predicate verified the committed URL as
`/en/admin?success=stream-updated` (host omitted). No retries or skips occurred.

## Gates and durations

| Gate | Result |
| --- | --- |
| Focused browser GREEN | 1 passed, exit 0; workers 1; retries 0; 18.1s body; 58.220s measured process |
| Changed-file ESLint | `pnpm exec eslint tests/e2e/admin-event-management.spec.ts` — exit 0; 4.661s |
| TypeScript | `pnpm exec tsc --noEmit` — exit 0; 4.958s (elevated only to permit its normal incremental-cache write) |
| Diff check | `git diff --check` — exit 0; 0.116s; normal LF/CRLF conversion warning only |

The first sandboxed TypeScript invocation exited 2 because the sandbox blocked
the existing `tsconfig.tsbuildinfo` cache write; the exact command then passed
with the required filesystem permission and no source/config flag change.

## Self-review and scope proof

- The diff contains only the pre-armed URL waiter and `Promise.all` settlement
  change in the target E2E test, plus this report.
- The exact success query and localized path are asserted by the new waiter;
  the existing final assertion is retained.
- No application source, Playwright config, workflow, timeout, retry policy,
  database preparation, seed/reset, or full E2E command was changed or run.
- The three protected pre-existing untracked roots were preserved and were not
  staged or edited:
  - `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
  - `public/certificates/e2e-completion-single_elimination-release-journey-en/`
  - `public/certificates/e2e-completion-single_elimination-release-journey-id/`

## Changed files

- `tests/e2e/admin-event-management.spec.ts`
- This report
