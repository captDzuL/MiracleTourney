# CI 36147449749 Brief C budget split and targeted shard-2 harness report

Date: 2026-09-25
Branch: `codex/organizer-release-readiness`
Implementation commit: `1f7cecd` (`test: split shard 2 harness budgets`)
Review-round static contract commit: `de2486c90fe16b6a3f5a11987fbedd0d309d216d` (`test: harden shard 2 contract mutations`)
Review-round-2 lifecycle contract commit: `2ca7cdcf6812eb3c8e543a6306f590d52f04b647` (`test: enforce lifecycle assertion ordering`)
Review-round-3 lifecycle DB assertion commit: `ec74880c830110fc9e98b91ad225af9549331f71` (`test: protect lifecycle result completion assertion`)

## Scope and result

Implemented Brief C as test-harness restructuring only. No `src/**` product code, database schema, seed/reset/preflight script, browser run, CI profile, timeout, retry, skip, sleep, forced interaction, or assertion weakening was added.

The overnight seeded-event lookup and exact three-delete preparation now run in a file-level browser-independent hook. Global setup prewarms the exact public/admin/organizer route families and consumes every discarded response body. Public discovery records home response status and requires exactly one public event surface before reading its source attribute. The adaptive lifecycle caches one initial competition version, advances it from each operation receipt, tracks in-flight operations at describe scope, drains them with `Promise.allSettled` before exact event/user deletion, and groups the existing browser assertions into three named steps. The review-round static contract now protects permanent-URL revisit counts, score/team assertions, certificate readiness/count assertions, add-before-await and delete-after-looped-drain ordering, exact CI ignore/worker/retry settings, and the exact shard-2 argument list/order through negative mutation checks.

## Evidence

- RED: the new `ci-36147449749-budget-split.static.test.ts` contract first ran through the bundled Vitest entrypoint with **7 failed / 7 tests**, identifying the absent hook, prewarms, explicit discovery outcome, receipt cache, in-flight drain, and step markers. The prescribed `pnpm exec vitest` alias was unavailable in this worktree and failed before test loading; no browser or database was started.
- GREEN: new static contract **7/7 passed**.
- Regression guards: `overnight-smoke.static.test.ts`, `v3-public-discovery-static-contract.test.ts`, `ci-36125458721-server-action-settlement.static.test.ts`, and the new contract: **4 files, 25/25 tests passed**.
- Review-round RED/GREEN mutation evidence: each removed permanent-URL, team, score, certificate-readiness/count, receipt, drain, add-after-await, delete-before-drain, worker, ignore, retry, timeout, and shard-order candidate was rejected by the static contract; the unmutated source is GREEN at 7/7.
- Review-round-2 mutation evidence: add-before-await < await < finally < delete ordering is enforced; delete-before-await and each removed initial-heading, duplicate Template/TBD, registration/drawing/ongoing/finished, next-match, Podium, winner, score, certificate-readiness, and certificate-count assertion candidate was rejected; the four-file guard set remains GREEN at 25/25.
- Review-round-3 mutation evidence: the exact `expect(await prisma.match.count({ where: { eventId, resultVersion: 0 } })).toBe(0);` assertion is required; removal and a `resultVersion: 1` mutation were rejected; the four-file guard set remains GREEN at 25/25.
- TypeScript: `pnpm lint` / `tsc --noEmit` **passed**. The first sandboxed attempt could not update the existing incremental `tsconfig.tsbuildinfo` (`EPERM`); the same check passed with the required repository filesystem approval.
- ESLint: changed-file ESLint **passed** for all five changed files. The `pnpm exec eslint` alias was unavailable, so the installed ESLint entrypoint was used.
- Whitespace: `git diff --check` **passed** (only the repository’s normal LF-to-CRLF normalization warnings were emitted).

## Readiness boundary

- **Code/static readiness:** GREEN for the source contracts and local type/lint/diff checks listed above.
- **Combined runtime gate:** intentionally pending. This change did not run the focused seven-test browser proof, database preparation, or shard-2 `44/44` command; those remain the implementation owner’s authorized clean-database validation steps. This report makes no combined runtime-gate or full-CI claim.

## Changed files

- `tests/competition/ci-36147449749-budget-split.static.test.ts` (new seven-test mutation-resistant static contract)
- `tests/e2e/overnight-smoke.spec.ts`
- `tests/e2e/global-setup.ts`
- `tests/e2e/v3-public-discovery.spec.ts`
- `tests/e2e/v3-public-event-lifecycle.spec.ts`
- `.superpowers/sdd/2026-09-20-organizer-master-workspace-release-readiness/ci-36147449749-C-budget-split-report.md`

## Protected roots and retained contracts

The following pre-existing untracked paths were not staged, edited, or deleted:

- `docs/testing/task11-release-runtime-accessibility-report-2026-09-23.md`
- `public/certificates/e2e-completion-single_elimination-release-journey-en/`
- `public/certificates/e2e-completion-single_elimination-release-journey-id/`

The seven affected test identities, current budgets (90s, 240s, 180s, 120s, and existing defaults), `workers: 1`, `retries: 0`, shard membership, fail-closed CI ordering, exact redirects, public routes, six sort transitions, organizer response matcher/settlement, import receipt, Completion assertion, and existing cleanup allowlists remain intact.
