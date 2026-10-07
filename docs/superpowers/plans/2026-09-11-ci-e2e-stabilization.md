# CI E2E Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore all 52 Playwright E2E tests under the complete Miracle V3 feature-flag configuration without weakening registration, responsive-layout, publication, or revision behavior.

**Architecture:** Keep the current V3 application behavior and repair stale browser fixtures/assertions at their boundaries. Make one production change in the shared event workspace shell so its mobile stepper fits a 360px viewport; keep the desktop navigation unchanged from the existing 700px breakpoint upward. Treat the `next-intl` message as a separate evidence-gathering path and change the not-found boundary only if a focused reproduction fails.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, next-intl, Prisma/PostgreSQL, Playwright, Vitest, pnpm.

## Global Constraints

- All E2E tests run with `FEATURE_FLAG_UI_V3_FOUNDATION`, `FEATURE_FLAG_ORGANIZER_WORKSPACE_V3`, `FEATURE_FLAG_REGISTRATION_WORKSPACE_V3`, `FEATURE_FLAG_COMPETITION_OPERATIONS_V3`, and `FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3` set to `true` by `scripts/e2e-dev.mjs`.
- Do not loosen captain IGN or captain UID requirements.
- Do not suppress genuine viewport overflow in the test.
- Do not change event publication or revision semantics.
- Do not modify unrelated worktrees, stashes, or generated CI artifacts.

---

### Task 1: Align registration-import E2E fixtures with the V3 captain identity contract

**Files:**
- Modify: `tests/e2e/admin-event-management.spec.ts`
- Modify: `tests/e2e/overnight-smoke.spec.ts`
- Modify: `tests/fixtures/late-import-after-lock.csv`

**Interfaces:**
- Consumes: `suggestRegistrationMapping(headers, {maxRosterSize})` and the server action requirement for `teamName`, `captainIgn`, and `captainUid`.
- Produces: CSV inputs whose headers map to all required V3 captain identity fields.

- [ ] **Step 1: Preserve the existing failing E2E evidence**

Run:

```powershell
pnpm exec playwright test tests/e2e/admin-event-management.spec.ts tests/e2e/overnight-smoke.spec.ts --grep "import|publish" --reporter=line
```

Expected: FAIL with `Mapping wajib belum ditemukan: captain IGN, captain UID.`

- [ ] **Step 2: Update inline CSV headers and rows**

Use this header in both specs:

```ts
const csvHeader = "event_slug,team_name,team_tag,captain_name,captain_contact,captain_ign,captain_uid,Player 1 Nickname";
```

Every generated row must insert a stable captain IGN and UID before the player nickname, for example:

```ts
`${slug},Team ${number},T${String(number).padStart(2, "0")},Captain ${number},captain${number}@team.test,Captain${number},UID-${number},Player ${number}`
```

Update `tests/fixtures/late-import-after-lock.csv` to the same eight-column shape with `LateCaptain` and `UID-LATE`.

- [ ] **Step 3: Run the affected registration E2E tests**

Run the same command from Step 1.

Expected: the mapping error is absent and the import assertions pass.

- [ ] **Step 4: Commit the fixture repair**

```powershell
git add tests/e2e/admin-event-management.spec.ts tests/e2e/overnight-smoke.spec.ts tests/fixtures/late-import-after-lock.csv
git commit -m "test(e2e): align registration fixtures with captain identity"
```

### Task 2: Align the organizer lifecycle test with the V3 wizard

**Files:**
- Modify: `tests/e2e/v3-organizer-lifecycle.spec.ts`

**Interfaces:**
- Consumes: `EventDraftForm` navigation links and the visible Indonesian form labels rendered for `/id`.
- Produces: a lifecycle test that fills required data through the real five-step workflow and still verifies autosave, readiness, preview revocation, and publication.

- [ ] **Step 1: Keep the reproduced failure as RED evidence**

Run:

```powershell
pnpm exec playwright test tests/e2e/v3-organizer-lifecycle.spec.ts --grep "create, autosave" --reporter=line
```

Expected: FAIL because `Complete before publishing` is not rendered while step 1 is active.

- [ ] **Step 2: Navigate to review before checking initial readiness**

After the overview URL assertion, click the real navigation link and assert the incomplete state:

```ts
await page.getByRole("link", { name: "Tinjau & Terbitkan" }).click();
await expect(page.getByRole("heading", { name: "Complete before publishing" })).toBeVisible();
```

- [ ] **Step 3: Fill each required section through its V3 navigation**

Navigate to `Identitas`, fill `Deskripsi singkat`, then navigate to `Format & Jadwal` and fill `Event dimulai` plus `Pelaksanaan`. Navigate to `Registrasi` and fill `Pendaftaran dibuka` plus `Pendaftaran ditutup`. Use the existing save-status assertion with `/Tersimpan|Saved/`, then return to `Tinjau & Terbitkan` and assert `Ready to publish`.

- [ ] **Step 4: Preserve preview, revoke, and publish assertions**

Keep the existing private-preview URL, guest visibility, revoked-token 404, publish status, and public event-heading checks. Scope action buttons to the active review section if duplicate controls appear.

- [ ] **Step 5: Run the lifecycle behavior test**

Run the command from Step 1.

Expected: PASS through public publication.

- [ ] **Step 6: Commit the wizard-aligned scenario**

```powershell
git add tests/e2e/v3-organizer-lifecycle.spec.ts
git commit -m "test(e2e): follow the v3 organizer wizard"
```

### Task 3: Make the V3 event stepper fit a 360px viewport

**Files:**
- Modify: `src/components/v3/EventWorkspaceShell.tsx`
- Test: `tests/e2e/v3-organizer-lifecycle.spec.ts`

**Interfaces:**
- Consumes: `ShellNavigationItem[]`, the existing 700px responsive breakpoint, and `aria-current="step"`.
- Produces: one responsive navigation DOM tree with five equal mobile columns, 44px-or-larger step targets, compact mobile labels, and full desktop labels.

- [ ] **Step 1: Verify the existing mobile regression test fails**

Run:

```powershell
pnpm exec playwright test tests/e2e/v3-organizer-lifecycle.spec.ts --grep "360px" --reporter=line
```

Expected: FAIL with descendants of the `min-w-[42rem]` ordered list extending past 360px.

- [ ] **Step 2: Implement the minimal mobile-first stepper**

Replace the fixed-width-with-scroll layout with one grid that fits its container:

```tsx
<nav aria-label={t("eventNavigation")} className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 min-[700px]:p-3">
  <ol className="grid min-w-0 grid-cols-[repeat(var(--setup-step-count),minmax(0,1fr))] gap-1 min-[700px]:gap-2" style={{ "--setup-step-count": effectiveNavigation.length } as React.CSSProperties}>
```

Use a centered `min-h-11 min-w-0` link on mobile, restore left alignment and spacing at 700px, and give the label span `sr-only min-[700px]:not-sr-only min-[700px]:whitespace-nowrap`. Keep the number circle and `aria-current` behavior unchanged.

- [ ] **Step 3: Run the mobile regression test**

Run the corrected path:

```powershell
pnpm exec playwright test tests/e2e/v3-organizer-lifecycle.spec.ts --grep "360px" --reporter=line
```

Expected: PASS with an empty overflow array.

- [ ] **Step 4: Run the shell component tests**

```powershell
pnpm test src/components/v3/shells.test.tsx
```

Expected: PASS with navigation semantics unchanged.

- [ ] **Step 5: Commit the responsive fix**

```powershell
git add src/components/v3/EventWorkspaceShell.tsx tests/e2e/v3-organizer-lifecycle.spec.ts
git commit -m "fix(ui): fit event workspace steps on mobile"
```

### Task 4: Make the published-revision assertion unambiguous

**Files:**
- Modify: `tests/e2e/v3-published-event-revision.spec.ts`

**Interfaces:**
- Consumes: the public page's primary `<main>` content and repeated display of the public description.
- Produces: an assertion that verifies the public version without depending on a globally unique text node.

- [ ] **Step 1: Preserve the strict-mode failure as RED evidence**

```powershell
pnpm exec playwright test tests/e2e/v3-published-event-revision.spec.ts --grep "stages, previews" --reporter=line
```

Expected: FAIL because the original description resolves to two elements.

- [ ] **Step 2: Scope the assertion to the primary public content**

Use:

```ts
const publicContent = publicPage.getByRole("main");
await expect(publicContent.getByText("Original public description for revision E2E.").first()).toBeVisible();
await expect(publicContent.getByText(updatedDescription)).toHaveCount(0);
```

- [ ] **Step 3: Run the published revision spec**

Run the command from Step 1.

Expected: PASS through private preview, public update, redirect, and lock-state coverage.

- [ ] **Step 4: Commit the locator repair**

```powershell
git add tests/e2e/v3-published-event-revision.spec.ts
git commit -m "test(e2e): scope published revision assertions"
```

### Task 5: Reproduce and handle the intl-context warning only if confirmed

**Files:**
- Inspect: `src/app/[locale]/layout.tsx`
- Inspect: `src/app/[locale]/not-found.tsx`
- Inspect: `src/app/not-found.tsx`
- Modify only if RED reproduces: `src/app/[locale]/not-found.tsx`
- Test only if RED reproduces: an existing route-level test nearest the localized not-found behavior, or a focused Playwright assertion in `tests/e2e/v3-organizer-lifecycle.spec.ts`

**Interfaces:**
- Consumes: localized unknown routes and revoked preview-token routes.
- Produces: a localized 404 that renders without requiring unavailable client intl context.

- [ ] **Step 1: Exercise both not-found paths**

Run the lifecycle behavior after Task 2 so it reaches the revoked preview assertion, then request an unknown localized route in a focused Playwright test while capturing the web-server output.

Expected: either a reproducible `No intl context found` error or clean 404 output.

- [ ] **Step 2: Branch on evidence**

If clean, make no production change and record that the original message was not causally connected to the seven failed assertions. If RED, add a route-level regression that checks the 404 heading and fails on the provider error, then replace `@/i18n/navigation` usage in the not-found boundary with a context-free anchor whose href is locale-safe for the boundary.

- [ ] **Step 3: Verify the focused 404 behavior**

Run the failing test again and confirm it passes without a server-side intl-context error.

- [ ] **Step 4: Commit only if files changed**

```powershell
git add src/app/[locale]/not-found.tsx tests/e2e/v3-organizer-lifecycle.spec.ts
git commit -m "fix(i18n): render localized not found without client context"
```

### Task 6: Full verification and delivery

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: a branch that passes typecheck, unit tests, and the complete V3-enabled E2E suite.

- [ ] **Step 1: Reset and seed the isolated E2E database**

```powershell
pnpm test:e2e:prepare
```

Expected: preflight identifies the isolated Neon test host, migrations apply, and seeding completes.

- [ ] **Step 2: Run typecheck and unit tests**

```powershell
pnpm lint
pnpm test
```

Expected: both commands exit 0.

- [ ] **Step 3: Run all 52 V3-enabled E2E tests**

```powershell
pnpm test:e2e
```

Expected: 52 tests complete with zero failures; intentional skips remain documented by Playwright.

- [ ] **Step 4: Inspect the final branch state**

```powershell
git diff --check
git status --short --branch
git log --oneline origin/feature/ui/adaptive-public-event-v3..HEAD
```

Expected: no whitespace errors, no unintended generated files, and only the documented stabilization commits ahead of origin.

- [ ] **Step 5: Push the verified branch**

```powershell
git push origin feature/ui/adaptive-public-event-v3
```

- [ ] **Step 6: Verify remote synchronization**

```powershell
git rev-list --left-right --count origin/feature/ui/adaptive-public-event-v3...feature/ui/adaptive-public-event-v3
```

Expected: `0 0`.
