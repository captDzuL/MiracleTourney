# Task 11 — Organizer release journey verification

## Outcome

The deterministic Playwright collection, fixture seams, accessibility contract, and release journey are implemented in the seven requested source files plus `playwright.config.ts`. Runtime browser verification is **BLOCKED** at environment loading because this isolated worktree has no authorized `.env.test`/Neon credentials. No credentials were copied, guessed, or written, and no required test was converted to a skip.

## Coverage matrix

| Dimension | Implemented matrix | Runtime result |
| --- | --- | --- |
| Locale | ID (`id`) and EN (`en`) | BLOCKED before browser startup |
| Viewport | 360×800, 390×844, 768×900, 1024×900, 1440×900 | BLOCKED before browser startup |
| Feature flag | `FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3=true` (on) and unset/false (off); config records mode and the matchday contract covers both branches | BLOCKED before browser startup |
| Owner role | Organizer owner completes the shared serial journey in both locales | BLOCKED before browser startup |
| Shared workspace role | Admin can open the organizer registration queue | BLOCKED before browser startup |
| Non-owner role | Organizer B receives an error and cannot see the fixture event or ID | BLOCKED before browser startup |
| Baseline screenshots | 2 locales × 5 viewports × 2 flag modes = 20 requested combinations; lifecycle source emits 10 locale/viewport paths, with targeted parity paths in completion, certificates, and Match Control | 0 captured; credentials are required |

The primary accessibility matrix is 2 × 5 = **10 serial locale/viewport cases**. The full release test is one serial test that traverses **17 logical milestones** in each locale: login, registration queue, import, payment review, QRIS, competition, schedule, Match Control, score/result, statistics, history, Completion, the seven-certificate set, publication revision, publication, historical verification, and current verification.

## Accessibility and deterministic contracts

Implemented in one shared helper and reused by the lifecycle journey:

1. bounded horizontal overflow;
2. keyboard tab order matching visual top/left order;
3. valid `aria-sort` values;
4. visible main controls at least 44px high;
5. `prefers-reduced-motion: reduce`;
6. zero running animations in reduced-motion mode;
7. visible `:focus-visible` indication;
8. focused control visible;
9. focused control inside the viewport;
10. focused control not obscured at its center point by sticky UI.

The Escape helper adds three assertions: dialog opens, Escape closes it, and focus returns to the trigger. Login setup normalizes reduced motion, the browser clock header, timezone, locale, and test-client address. Screenshots explicitly disable animations. Artifact text checks reject the test password and fixture email strings before an attachment can be produced.

Completion parity covers ID at 390px and EN at 1440px. Certificate parity covers ID and EN at 768px, seven certificate cards, hydration, publication revision, and historical/current verification. Match Control parity covers ID at 390px and EN at 1440px, operations visibility, overflow, control sizing, `aria-sort`, and visible keyboard focus.

## TDD and static evidence

- **RED:** the first lifecycle contract import failed collection/type checking because `normalizeReleasePage` was not yet exported from `tests/e2e/helpers/auth.ts` (`TS2305`). The helper and deterministic fixture seam were then added.
- **GREEN:** `node node_modules/typescript/bin/tsc --noEmit --incremental false` — exit **0** (17.4s).
- **GREEN:** direct ESLint over the config, helpers, and four named specs — exit **0**, zero errors/warnings.
- **GREEN:** `git diff --check` — exit **0** (Git only reported normal LF→CRLF conversion warnings).
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
