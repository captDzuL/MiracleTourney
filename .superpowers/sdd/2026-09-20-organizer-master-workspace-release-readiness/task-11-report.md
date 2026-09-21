# Task 11 — Organizer release journey verification

## Outcome: PARTIAL

The deterministic Playwright collection, fixture seams, accessibility contract, and release journey are implemented in the seven requested source files plus `playwright.config.ts`, with a focused static contract test. Static verification is GREEN; runtime browser/visual verification is **BLOCKED** at environment loading because this isolated worktree has no authorized `.env.test`/Neon credentials. No credentials were copied, guessed, or written, and no required test was converted to a skip.

## Round 2 fix disposition

The five confirmed round-2 findings are addressed in the working-tree fix wave:

| Finding | Evidence in the fix wave | Result |
| --- | --- | --- |
| Shared event transitions and receipts | The shared serial journey now starts from draft/pending state, performs CSV preview/commit, payment approval, QRIS save/publish, official result, statistics save/review, completion, seven certificate generations, and two publications; each step reads back IDs/status/version from the same event and match. | Addressed |
| Base config isolation and flag servers | `playwright.config.ts` is restored to one default server/project. `playwright.release.config.ts` owns the explicit `organizer-release-on`/`organizer-release-off` servers and projects; the full tagged journey runs on the true/on server and the off server runs the matrix. | Addressed |
| Exact locale copy and absence | `LOCALE_COPY` supplies exact ID/EN headings, controls, feedback, dialog names, and verification statuses; assertions use exact names and reject the opposite-locale sentinel. | Addressed |
| Named dialog | Escape coverage requires exactly one modal dialog with `aria-modal="true"` and the expected localized accessible name, then verifies Escape closure and trigger focus restoration. | Addressed |
| Reduced motion before screenshot suppression | Navigation first uses `prefers-reduced-motion: reduce` and verifies the application has zero running animations; font readiness is checked next, and screenshot-only CSS suppression is injected afterward. | Addressed |

The fix wave is static/configuration-complete. Credentialed browser, database, and screenshot evidence remain **BLOCKED** at the existing `.env.test` boundary; no runtime result is represented as a pass.

## Round 2 verification evidence

- Focused static contract: `vitest` — **4/4 passed**, exit 0, 332 ms test duration.
- Base configuration comparison: `git diff --quiet 7868462 -- playwright.config.ts` — **matched**, exit 0, 106 ms.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — exit 0, 21,331 ms.
- ESLint: direct ESLint over the modified config/helpers/fixture/lifecycle/static-contract files — exit 0, zero errors/warnings, 4,757 ms.
- Secret scan: modified Task 11 files/report contained 0 private-key/API-key/database-URL/Neon-URL matches, exit 0, 124 ms.
- Diff hygiene: `git diff --check` — exit 0, 89 ms (only Git's normal LF→CRLF notices).

## Coverage matrix

| Dimension | Implemented matrix | Runtime result |
| --- | --- | --- |
| Locale | ID (`id`) and EN (`en`) | BLOCKED before browser startup |
| Viewport | 360×800, 390×844, 768×900, 1024×900, 1440×900 | BLOCKED before browser startup |
| Feature flag | Separate `organizer-release-on` and `organizer-release-off` Playwright projects, servers on 3101/3102, explicit `true`/`false` server env, project `baseURL` mapping, and mode-specific Match Control assertions | BLOCKED before browser startup |
| Owner role | Organizer owner completes the shared serial journey in both locales | BLOCKED before browser startup |
| Shared workspace role | Admin can open the organizer registration queue | BLOCKED before browser startup |
| Non-owner role | Organizer B receives an error and cannot see the fixture event or ID | BLOCKED before browser startup |
| Baseline screenshots | 2 locales × 5 viewports × 2 flag modes = **20** named `release-accessibility-{on|off}-{locale}-{viewport}.png` baselines | 0 captured; credentials are required |

The release profile accessibility matrix is 2 × 5 × 2 = **20 serial locale/viewport/flag cases**. The full release test is one serial test that traverses **17 logical milestones** in each locale: login, registration queue, import, payment review, QRIS, competition, schedule, Match Control, score/result, statistics, history, Completion, the seven-certificate set, publication revision, publication, historical verification, and current verification.

## Accessibility and deterministic contracts

Implemented in one shared helper and reused by the lifecycle journey:

1. bounded horizontal overflow;
2. actual `Tab` and `Shift+Tab` sequence matching visual top/left order;
3. valid `aria-sort` values plus one required sortable target and two state transitions;
4. visible main controls at least 44px high;
5. `prefers-reduced-motion: reduce`;
6. zero running animations in reduced-motion mode;
7. visible `:focus-visible` indication;
8. focused control visible;
9. focused control inside the viewport;
10. focused control not obscured at its center point by sticky UI.

The Escape helper requires a visible trigger, exactly one named `role="dialog"` with `aria-modal="true"`, Escape closure, and focus restoration. Login setup installs Playwright’s frozen clock at `2026-09-21T00:00:00.000Z`, normalizes reduced motion, waits for `document.fonts.ready`, sets the deterministic clock header, timezone, locale, and test-client address. Screenshots explicitly disable animations only after reduced-motion and font assertions. Fixture dates derive from a fixed `RELEASE_FIXTURE_NOW`; payment/import/QRIS/match/stat/review/history state is read back by the same event ID. Artifact text checks reject the test password and fixture email strings before an attachment can be produced.

Completion parity covers ID at 390px and EN at 1440px. Certificate parity covers ID and EN at 768px, seven certificate cards, hydration, publication revision, and historical/current verification. Match Control parity covers ID at 390px and EN at 1440px, operations visibility, overflow, control sizing, `aria-sort`, and visible keyboard focus.

## TDD and static evidence

- **RED (fix round):** `node node_modules/vitest/vitest.mjs run tests/competition/task11-release-static-contract.test.ts` — 2/2 expected failures: missing separate flag projects/ports and missing real Tab/Shift+Tab/dialog/fonts/fixture/revision contracts.
- **GREEN:** the same focused static contract — 2/2 tests passed.
- **GREEN:** `node node_modules/typescript/bin/tsc --noEmit --incremental false` — exit **0** (17.3s).
- **GREEN:** direct ESLint over the config, helpers, four named specs, and focused contract — exit **0**, zero errors/warnings.
- **GREEN:** unstaged and staged `git diff --check` are clean (no whitespace errors).
- Source scan found no private keys, live API-key prefixes, `DATABASE_URL=`, or Neon secret values. The only credential-like strings are the pre-existing synthetic E2E login values and the new fixture-only bcrypt input required to build deterministic test data; they are never rendered into screenshots or report output.

## Runtime blocker (exact commands and inputs)

The following were attempted once from the isolated worktree and stopped at the authorized environment boundary:

```text
pnpm test:e2e:preflight
exit 1 — Error: E2E environment file .env.test was not found at
C:\Users\dzulf\.codex\worktrees\organizer-release-readiness\MiracleTourney-gitnative\.env.test.

pnpm test:e2e:prepare
exit 1 — same missing .env.test error.

node node_modules/@playwright/test/cli.js test tests/e2e/v3-organizer-lifecycle.spec.ts --list
exit 1 — config loading stopped at scripts/e2e-env.mjs:30 with the same missing .env.test error.
```

The requested `pnpm exec playwright test ... --fail-on-flaky-tests --workers=1` wrapper also cannot resolve the worktree-local Playwright binary (`'playwright' is not recognized`); the direct Node CLI above was used for the safe parser/list attempt. No server, browser, database, visual baseline, or credential-dependent test ran. Runtime status for every matrix row is therefore **BLOCKED**, not skipped or passed.
