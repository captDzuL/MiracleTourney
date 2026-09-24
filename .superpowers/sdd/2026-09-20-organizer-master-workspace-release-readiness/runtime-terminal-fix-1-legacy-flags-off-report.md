# Runtime terminal fix 1 — legacy flags-off contract

## Status

`READY_FOR_REVIEW` — the stale legacy E2E contract is corrected with test-only
changes. A fresh independent Sol/high review must approve both specification
compliance and code quality before any visual-profile repair starts.

Base commit: `e24799d5c1b3ad7c282bb2274c4868b2783a9775`.

## Diagnosis and bounded correction

The post-memory-fix final E2E run failed all four legacy flags-off tests because
`expectV3Unavailable` still expected the authenticated organizer competition
API to return `404`. The reviewed route already implements the canonical
availability boundary: public ongoing remains `404`, while the authenticated
organizer competition reader returns `503` with exactly
`{ code: "internal_error", requestId }` and private no-store caching.

The helper in `tests/e2e-legacy/matchday-flags-off.spec.ts` now:

- keeps the public `/api/events/:slug/ongoing` assertion at `404`;
- checks the private organizer response is `503`;
- requires the exact two-field generic body and a non-empty request ID;
- rejects target/detail/data leakage through the exact-body assertion; and
- checks `Cache-Control: private, no-store, max-age=0` and `Vary` containing
  `Cookie`.

`tests/competition/legacy-flags-off.static.test.ts` is a focused static
contract that keeps those assertions load-bearing. No production code, route
behavior, feature flag, timeout, retry, worker, skip, or database setup was
changed.

## TDD evidence

### RED

After adding the focused static contract, the valid focused command was:

```text
node_modules\\.bin\\vitest.cmd run tests/competition/legacy-flags-off.static.test.ts
```

It exited `1` with 1 test failed. The expected failure was that the stale
helper contained only private `404` status checks and none of the canonical
private response/body/cache assertions (Vitest duration `288ms`).

### GREEN

After the helper-only correction, the same focused command exited `0` with 1
file and 1 test passed (Vitest duration `270ms`). The combined focused
static/unit check then passed 2 files and 4 tests:

```text
node_modules\\.bin\\vitest.cmd run tests/competition/legacy-flags-off.static.test.ts "src/app/api/organizer/events/[eventId]/competition/route.test.ts"
```

Vitest duration was `1.45s`.

## Verification

| Command | Result | Duration | Exit |
| --- | --- | ---: | ---: |
| `node_modules\\.bin\\vitest.cmd run tests/competition/legacy-flags-off.static.test.ts` (RED) | 1 failed / 1 | 0.288s Vitest | 1 |
| Same focused static command (GREEN) | 1 passed / 1 | 0.270s Vitest | 0 |
| Static + existing organizer competition route unit | 2 files, 4 tests passed | 1.45s Vitest | 0 |
| `node_modules\\.bin\\tsc.cmd --noEmit --incremental false` | No diagnostics | 16.7s wall | 0 |
| `node_modules\\.bin\\eslint.cmd tests/e2e-legacy/matchday-flags-off.spec.ts tests/competition/legacy-flags-off.static.test.ts` | No errors or warnings | 4.48s wall | 0 |
| `git diff --check` | Clean; only expected LF-to-CRLF working-copy notice | 0.41s wall | 0 |
| `pnpm exec playwright test --config playwright.legacy.config.ts --workers=1 --retries=0 --fail-on-flaky-tests` | 4 passed, 0 skipped, 0 flaky/retried | 1.2m | 0 |

The Playwright command above was invoked exactly once against the current
non-production test database. It used one worker, retries `0`, and
fail-on-flaky enabled; no reset, seed, full CI, second Playwright run, visual
run, performance run, deployment, or production command was performed. The
runner emitted only the existing `NO_COLOR`/`FORCE_COLOR` warning.

## Residue and status audits

- A read-only Prisma query for `e2e-md-round_robin-*` events returned
  `{ "count": 0, "rows": [] }` after the run.
- Final Git status contains the intended modified/new E2E/static/report paths
  plus the three pre-existing protected untracked roots: the Task 11
  accessibility report and the two certificate artifact directories. Those
  protected roots were not staged or modified.
- The concise ledger entry was appended to the existing ignored local
  `.superpowers/.../progress.md`; that ledger is intentionally not staged as a
  new tracked artifact.
- The tracked diff contains no production files, route/config changes, or
  timeout/retry/skip weakening.

## Files

- `tests/e2e-legacy/matchday-flags-off.spec.ts`
- `tests/competition/legacy-flags-off.static.test.ts`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/runtime-terminal-fix-1-legacy-flags-off-report.md`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/progress.md` (concise ledger entry)

## Concerns

- `pnpm exec vitest` was not available through the local Windows shim and the
  first un-elevated direct Vitest launch hit the sandbox's esbuild `spawn EPERM`;
  the exact focused checks were rerun with the direct local binary in the
  approved process boundary. This did not alter test semantics.
- The required independent Sol/high review is still pending. Visual-profile
  work must remain paused until that review returns both required approvals.

## Commit

To be filled after the final staged-diff audit.
