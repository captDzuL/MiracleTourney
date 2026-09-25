# CI shard-2 fast-lane implementation report

Date: 2026-09-26 (Asia/Jakarta)
Branch: `codex/organizer-release-readiness`
Base SHA: `5b23fd4`
Implementation commit: the local marked commit containing this report; final SHA is recorded in the implementation handoff.

## Scope and result

Implemented the temporary diagnostic choice only inside the existing `E2E Tests`
job. Lint/typecheck and unit jobs remain unconditional; the E2E job keeps its
existing dependency list, `vars.E2E_ENABLED == 'true'` gate, timeout, shared
Neon concurrency lock, setup, and normal fail-closed dependency behavior.

The diagnostic step is enabled only when all three conditions match:

- `github.event_name == 'push'`
- `github.ref_name == 'codex/organizer-release-readiness'`
- head commit message contains the exact marker `[ci:shard2-only]`

The normal E2E step uses the logical inverse of that complete predicate. The
diagnostic sequence is exactly preflight, prepare, then default Playwright
shard `2/2` with `--fail-on-flaky-tests`. Playwright evidence uploads on normal
failure or every marked diagnostic attempt, retaining only the existing report
paths for seven days.

## TDD and verification evidence

- RED after adding the seven source-contract tests: exact command
  `pnpm exec vitest run src/e2e-ci.test.ts`; **13 tests total, 4 failed and 9
  passed**, duration **38 ms**. The failures were the intentionally absent
  branch-bound full/diagnostic conditions and marked-attempt artifact policy.
- GREEN regression: exact command
  `pnpm exec vitest run src/e2e-ci.test.ts src/playwright-config.test.ts tests/competition/ci-36147449749-budget-split.static.test.ts`;
  **3 files, 26 tests passed**, duration **750 ms**.
- Whitespace check: `git diff --check` exited **0**. Git emitted only the
  repository's normal LF-to-CRLF normalization warnings.
- No E2E, database, seed/reset, browser, or push command was run.

## Changed files

- `.github/workflows/ci.yml`
- `src/e2e-ci.test.ts`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/ci-shard2-fast-lane-implementer-report.md`

## Caveat and protected roots

This is a temporary workflow mechanism and has not been runtime-validated in
GitHub Actions. The release owner must verify the marked push's exact shard
inventory and artifact contents, then remove the temporary step conditions and
run one normal full CI as specified by the brief.

The following pre-existing untracked roots were not staged, edited, or deleted:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`
