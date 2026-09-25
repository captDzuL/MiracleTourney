# CI 36147449749 Brief B CSV preview settlement observability report

Date: 2026-09-26 (Asia/Jakarta)  
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`  
Branch: `codex/organizer-release-readiness`  
Base SHA: `85f958e9a213bbc860400aba53edaa1494eb3577`  
Implementation SHA: `934d17f` (`test: instrument CSV preview settlement boundaries`)

## Outcome

Brief B is implemented as bounded, redacted action/route observability. The
CSV preview action now records one correlated request ID across named milestones
around the existing awaits, and the revalidated registration route records its
entry, event-context, import-history, and return boundaries. The existing
action result, preview persistence, `revalidatePath()` call, and response EOF
contract are unchanged.

Action milestones:

```text
action_enter
access_gate_done
event_context_done
source_parsed
users_resolved
bracket_lock_done
preview_batch_saved
revalidation_requested
action_return
```

Route milestones:

```text
route_enter
route_context_done
route_history_done
route_return
```

Each stage contains only an allowlisted locale, hashed event identifier,
bounded counts/status, stage, duration, and request correlation ID. Milestone
error codes are allowlisted. CSV contents, filenames, form data, email
addresses, credentials, cookies, tokens, URLs, raw user IDs, database details,
and dependency exception text are not emitted. Unexpected gate/revalidation or
route-read failures emit a terminal failed milestone and rethrow the original
error; known preview failures return the same blocked action result while
emitting a terminal failed `action_return`.

## TDD and verification evidence

### RED

- The new static/action/route tests initially failed against the uninstrumented
  source: **8 failed, 59 passed** in the approved focused run. Failures were
  the absent action/route milestones, missing logger helper, absent terminal
  failure event, and deferred dependency assertions.
- The additional access-gate terminal test then failed as expected (**1 failed,
  28 passed**) before its guarded catch was added.
- The additional route ownership terminal test failed as expected (**1 failed,
  15 passed**) before its guarded auth/ownership catches were added.
- The first sandboxed Vitest invocation was blocked by Windows `spawn EPERM`
  while Vite bundled its config; the same read-only commands were rerun with
  the repository's approved process access. No browser, database, seed, reset,
  retry, or timeout change was used.

### GREEN

```text
Focused logger/action/route/static suite:
  4 files, 69 tests passed, 0 failed

Direct registration/action-settlement regressions:
  4 files, 21 tests passed, 0 failed

TypeScript:
  .\node_modules\.bin\tsc.cmd --noEmit --incremental false
  passed

ESLint:
  changed implementation/test/static files
  passed

Whitespace:
  git diff --check
  passed (only normal LF/CRLF normalization warnings)
```

The deferred tests prove that a pending preview persistence dependency emits
neither `preview_batch_saved` nor `action_return` early, and that
`revalidation_requested` follows the durable preview save. Failure tests prove
that persistence and access-gate failures produce terminal failed milestones
without leaking the dependency message. The route deferred-history test proves
that `route_return` waits for history completion.

The static contract retains the non-redirect helper's `status < 400` plus
`await response.finished()`/EOF assertion, retains redirect headers plus
navigation without `response.finished()`, rejects headers-only settlement, and
rejects timeout, retry, sleep, or payload logging additions. Existing import
commit/readiness, receipt, and downstream journey assertions were not changed.

## Scope and protected roots

Changed implementation/test paths:

- `src/lib/observability/logger.ts`
- `src/lib/observability/logger.test.ts`
- `src/lib/actions/registration-v3-actions.ts`
- `src/lib/actions/registration-v3-actions.test.ts`
- `src/app/[locale]/organizer/events/[eventId]/registration/page.tsx`
- `src/app/[locale]/organizer/events/[eventId]/registration/page.test.ts`
- `tests/competition/ci-36147449749-csv-preview-settlement.static.test.ts`
- this report

The following pre-existing untracked protected roots were not edited, staged,
or deleted:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

No browser or live database command was run. No seed/reset/preflight, CI rerun,
timeout increase, retry, sleep, response interception, response-header-only
settlement, or change to the redirect helper was made. ID and EN remain one
shared CSV preview settlement defect pending runtime milestone evidence.

## Commit receipt

The implementation commit is `934d17f`; the final receipt is verified with
`git show --stat --oneline` and `git status --short` below.
