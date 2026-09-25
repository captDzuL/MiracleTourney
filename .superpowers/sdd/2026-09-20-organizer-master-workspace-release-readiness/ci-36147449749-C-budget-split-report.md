# CI 36147449749 Brief C budget split and targeted shard-2 harness report

Date: 2026-09-25
Branch: `codex/organizer-release-readiness`
Implementation commit: `1f7cecd` (`test: split shard 2 harness budgets`)

## Scope and result

Implemented Brief C as test-harness restructuring only. No `src/**` product code, database schema, seed/reset/preflight script, browser run, CI profile, timeout, retry, skip, sleep, forced interaction, or assertion weakening was added.

The overnight seeded-event lookup and exact three-delete preparation now run in a file-level browser-independent hook. Global setup prewarms the exact public/admin/organizer route families and consumes every discarded response body. Public discovery records home response status and requires exactly one public event surface before reading its source attribute. The adaptive lifecycle caches one initial competition version, advances it from each operation receipt, tracks in-flight operations at describe scope, drains them with `Promise.allSettled` before exact event/user deletion, and groups the existing browser assertions into three named steps.

## Evidence

- RED: the new `ci-36147449749-budget-split.static.test.ts` contract first ran through the bundled Vitest entrypoint with **7 failed / 7 tests**, identifying the absent hook, prewarms, explicit discovery outcome, receipt cache, in-flight drain, and step markers. The prescribed `pnpm exec vitest` alias was unavailable in this worktree and failed before test loading; no browser or database was started.
- GREEN: new static contract **7/7 passed**.
- Regression guards: `overnight-smoke.static.test.ts`, `v3-public-discovery-static-contract.test.ts`, `ci-36125458721-server-action-settlement.static.test.ts`, and the new contract: **4 files, 25/25 tests passed**.
- TypeScript: `pnpm lint` / `tsc --noEmit` **passed**. The first sandboxed attempt could not update the existing incremental `tsconfig.tsbuildinfo` (`EPERM`); the same check passed with the required repository filesystem approval.
- ESLint: changed-file ESLint **passed** for all five changed files. The `pnpm exec eslint` alias was unavailable, so the installed ESLint entrypoint was used.
- Whitespace: `git diff --check` **passed** (only the repository’s normal LF-to-CRLF normalization warnings were emitted).
- No focused seven-test browser proof or shard-2 `44/44` run was performed; those remain the implementation owner’s authorized clean-database validation steps.

## Changed files

- `tests/competition/ci-36147449749-budget-split.static.test.ts` (new seven-test mutation-resistant static contract)
- `tests/e2e/overnight-smoke.spec.ts`
- `tests/e2e/global-setup.ts`
- `tests/e2e/v3-public-discovery.spec.ts`
- `tests/e2e/v3-public-event-lifecycle.spec.ts`

## Protected roots and retained contracts

The following pre-existing untracked paths were not staged, edited, or deleted:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

The seven affected test identities, current budgets (90s, 240s, 180s, 120s, and existing defaults), `workers: 1`, `retries: 0`, shard membership, fail-closed CI ordering, exact redirects, public routes, six sort transitions, organizer response matcher/settlement, import receipt, Completion assertion, and existing cleanup allowlists remain intact.
