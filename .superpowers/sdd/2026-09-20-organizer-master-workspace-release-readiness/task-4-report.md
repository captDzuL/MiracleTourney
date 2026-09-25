# Task 4 report — Certificate Studio hydration, controls, and publication

Base: `24d458cd23b5dc920cc5858512ceb72c46d97d5d`

## Delivered

- `HydrationGate` now forwards native `HTMLAttributes<HTMLDivElement>`, preserves the pre-hydration inert/pointer-events guard, and exposes `data-hydration-ready="false|true"`.
- The organizer Certificate Studio page is wrapped in a labeled hydration gate.
- Publication renders disabled in pre-hydration markup, waits for the client-ready effect, awaits one server action, exposes the committed revision, and returns `revision` at the action boundary while retaining the existing publication payload for compatibility.
- Certificate upload file controls now have the 44px minimum target; the unit contract checks every visible Studio control.
- Serial E2E contract coverage waits for readiness, checks one publication click, localized ID/EN feedback, revision 2, seven published links, historical verification, and 1440×900 / 390×844 geometry.

## RED/GREEN evidence

| Contract | RED | GREEN |
| --- | --- | --- |
| HydrationGate native props/readiness | `node node_modules/vitest/vitest.mjs run src/components/HydrationGate.test.tsx` — 1 test failed, exit 1, 1.00s | same command — 1 passed, exit 0, 0.90s |
| Publication action revision | `node node_modules/vitest/vitest.mjs run src/lib/actions/certificate-v3-actions.test.ts` — 1 of 6 failed, exit 1, 1.70s | same command — 6 passed, exit 0, 1.00s |
| Page hydration wrapper | `node node_modules/vitest/vitest.mjs run "src/app/[locale]/organizer/events/[eventId]/certificates/page.test.tsx"` — 1 of 3 failed, exit 1, 0.55s | included in final suite — 3 passed |
| 44px interactive controls | `node node_modules/vitest/vitest.mjs run src/components/v3/certificates/certificate-studio.test.tsx` — 1 of 18 failed, exit 1, 2.28s | same command — 18 passed, exit 0, 1.81s |
| Returned revision in Studio | same component command — 1 of 18 failed, exit 1, 1.80s | same command — 18 passed, exit 0, 1.81s |
| Pre-hydration publication disabled | same component command — 1 of 19 failed, exit 1, 1.83s | same command — 19 passed, exit 0, 1.89s |

The final focused command was:

```text
node node_modules/vitest/vitest.mjs run src/components/HydrationGate.test.tsx "src/app/[locale]/organizer/events/[eventId]/certificates/page.test.tsx" src/lib/actions/certificate-v3-actions.test.ts src/lib/certificate/studio-schema.test.ts src/lib/certificate/studio-repository.test.ts src/components/v3/certificates/certificate-studio.test.tsx
```

Result: 6 files, 44 tests passed, exit 0, 2.16s.

## Verification

- `pnpm lint` (`tsc --noEmit`): exit 0, 8.5s on the final run.
- Focused ESLint over Certificate Studio implementation files: exit 0, 7.5s. It reports one existing warning at `CertificateStudio.tsx:156` for the existing `<img>` preview (`@next/next/no-img-element`), with zero errors.
- `git diff --check`: exit 0.
- The requested `pnpm exec vitest run ...` shim is unavailable in this isolated install (`'vitest' is not recognized`, exit 1); the installed Vitest entry point above produced the fresh passing evidence.

## Blocked runtime evidence

`pnpm test:e2e:preflight` was attempted once and exited 1 because the isolated worktree has no authorized `.env.test` (`.env.test was not found`). Database reset/seed and Playwright were not retried or fabricated. Therefore seven-certificate publication, revision persistence, localized browser feedback, historical verification, screenshots, and 1440×900 / 390×844 geometry remain **BLOCKED** pending the authorized shared-Neon runtime profile.

No credentials, secrets, or PII were read or copied.

## Fix Round 1

Review findings addressed:

1. Added a real `flushSync` component interaction test. It commits the actual Certificate Studio, attempts a button click before the readiness effect, and asserts the injected publication callback remains untouched. A controlled removal of the `hydrated` guard produced the expected RED result: `node node_modules/vitest/vitest.mjs run src/components/v3/certificates/certificate-studio.test.tsx -t "does not submit"` — 1 failed, 19 skipped, exit 1, 1.49s (React act warnings are emitted only by the deliberate mutation). Restoring the guard and running `... -t "returns the committed|does not submit"` produced 2 passed, 24 skipped, exit 0, 1.53s.

2. Replaced the optional intersection result with the recursive discriminated `CertificatePublicationActionResult`: published results require `revision`, nested `already_applied` results are normalized, and non-published branches do not expose a false optional revision. `CertificateStudio` now consumes that exact callback result type. A controlled legacy-field mutation produced the expected RED: `node node_modules/vitest/vitest.mjs run src/lib/actions/certificate-v3-actions.test.ts` — 1 failed, 5 passed, exit 1, 0.99s. The final implementation returns the exact published shape `{ status: "published", revision, publishedAt }`.

Fresh Fix Round 1 verification:

- Focused certificate suite: 7 files, 107 tests passed, exit 0, 2.34s.
- `pnpm lint` / TypeScript: exit 0, 9.7s.
- Focused ESLint: exit 0, 8.9s, zero errors and the same existing `<img>` warning.
- `git diff --check`: exit 0.
- Serial Neon/Playwright acceptance remains **BLOCKED** by the missing authorized `.env.test`; no guarded runtime retry was made.
