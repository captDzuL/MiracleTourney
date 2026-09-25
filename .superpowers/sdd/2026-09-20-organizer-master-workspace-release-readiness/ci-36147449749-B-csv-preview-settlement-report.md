# CI 36147449749 Brief B CSV preview settlement observability report

Date: 2026-09-26 (Asia/Jakarta)
Worktree: `C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative`
Branch: `codex/organizer-release-readiness`
Base SHA: `994c9ce9ed2cea3628b811cdee5b1c07755fd123`
Review code/tests SHA: `25e303f63d18c5a286b7ec048a82e977a9c0ba27`
Review documentation SHA: `7381cbac297139707636832a5a2acc7029239152`
Whole-delta round-4 correction SHA: `ba7b87ca616266ef459e5ed0a0aba0372100545f`

## Outcome

Brief B remains bounded to redacted, correlated action and route observability.
The CSV preview action records milestones around the existing awaits, and the
revalidated registration route records its entry, event-context, import-history,
and return boundaries. Action results, preview persistence, `revalidatePath()`,
commit/receipt behavior, and the response EOF contract are unchanged.

Action milestones, in their truthful order:

```text
action_enter
initial_gate_done
rate_limit_done
ownership_done
access_gate_done
event_context_done
source_parsed
users_resolved
bracket_lock_done
preview_batch_saved
revalidation_requested
action_return
```

`initial_gate_done` describes the outer role/session gate only. The required
`access_gate_done` is emitted only after the worker has awaited the shared rate
limiter and the second event-ownership check. Deferred tests prove that neither
access nor later preview milestones appear while either dependency is pending.
Rate-limit denial records `rate_limit_done` with status 429 and does not claim
access was completed.

Route milestones:

```text
route_enter
route_context_done
route_history_done
route_return
```

Each stage contains only the allowlisted locale, hashed event identifier,
bounded counts/status, stage, duration, and request correlation ID. Milestone
error codes are allowlisted. CSV contents, filenames, form data, email
addresses, credentials, cookies, tokens, URLs, raw user IDs, database details,
and dependency exception text are not emitted.

Unexpected outer-gate or revalidation failures emit a terminal failed
`action_return` and preserve the original rethrow. Known preview failures keep
their existing typed blocked result; operation failures are terminal failed
milestones. Route role/session and ownership checks remain outside the fallback
render catch: ownership failures emit failed `route_return` and rethrow.
Context and history read failures are inside the fallback catch: they emit a
failed `route_return` and return the existing error `RegistrationWorkspace`
render instead of rethrowing. Tests cover both read failures and distinguish
them from ownership failure.

## TDD and verification evidence

### RED

- Review tests initially failed against the prior implementation: **3 failed,
  52 passed** in the three-file focused run. The failures were the stale outer
  `access_gate_done` during the limiter stall, the same stale milestone during
  the second ownership stall, and the static ordering contract missing the new
  truthful stages.
- The initial sandboxed Vitest invocation was blocked by Windows `spawn EPERM`
  while Vite bundled its config. The same read-only suite was rerun with the
  repository's approved process access. No browser, database, seed, reset,
  retry, timeout, or sleep operation was used.

### GREEN

```text
Review-focused action/route/static suite:
  3 files, 55 tests passed, 0 failed

Expanded logger/action/route/static settlement regressions:
  5 files, 81 tests passed, 0 failed

TypeScript:
  .\node_modules\.bin\tsc.cmd --noEmit --incremental false
  passed

ESLint:
  changed implementation, route, logger, unit, and static files
  passed

Whitespace:
  git diff --check
  passed (only normal LF/CRLF normalization warnings)
```

The deferred persistence test still proves that `preview_batch_saved` and
`action_return` wait for the durable save, and `revalidation_requested` follows
that save. The new limiter and second-ownership deferred tests prove that no
later access or preview milestone is emitted early. Persistence and access
failures remain redacted and terminal as before. Context/history failure tests
prove fallback rendering plus failed `route_return`; the ownership test proves
the separate rethrow behavior.

The static contract isolates `waitForServerActionResponse`, requiring both
`status() < 400` and a completed `response.finished()` check. The redirect
helper checks its redirect header and navigation without EOF. Mutation tests
reject status-only, EOF-only, and redirect-EOF variants. Existing import
commit/readiness, receipt, ID/EN one-defect, and downstream journey assertions
were not changed.

## Scope and protected roots

Review files changed in `25e303f`:

- `src/lib/actions/registration-v3-actions.ts`
- `src/lib/actions/registration-v3-actions.test.ts`
- `src/app/[locale]/organizer/events/[eventId]/registration/page.test.ts`
- `tests/competition/ci-36147449749-csv-preview-settlement.static.test.ts`

The complete Brief B implementation also includes the already-recorded base
files:

- `src/lib/observability/logger.ts`
- `src/lib/observability/logger.test.ts`
- `src/app/[locale]/organizer/events/[eventId]/registration/page.tsx`
- this report

The following pre-existing untracked protected roots were not edited, staged,
or deleted:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

No browser or live database command was run. No seed/reset/preflight, CI rerun,
timeout increase, retry, sleep, response interception, response-header-only
settlement, or redirect-helper change was made. ID and EN remain one shared CSV
preview settlement defect pending runtime milestone evidence.

## Commit receipt

Base implementation: `994c9ce9ed2cea3628b811cdee5b1c07755fd123`

Review code/tests: `25e303f63d18c5a286b7ec048a82e977a9c0ba27`

Review documentation: `7381cbac297139707636832a5a2acc7029239152`

Whole-delta round-4 correction:
`ba7b87ca616266ef459e5ed0a0aba0372100545f`

The round-4 SHA closes the final hook-budget and competition terminal-category
findings. It does not change Brief B's CSV preview behavior or evidence.
