# Miracle V3 Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for each implementation task and `verification-before-completion` before marking the plan complete.

**Goal:** Establish the approved Miracle V3 visual language, responsive shells, navigation, organizer theme control, official branding, and reusable primitives without breaking the existing UI.

**Architecture:** Add a token layer and composable V3 components beside the current shells. Route composition switches through one feature flag, so the current experience remains the rollback path until V3 parity is verified.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, next-intl, Lucide, Vitest, Playwright.

**Global Constraints:** Montserrat is the UI typeface. Dark is the default. Organizer pages retain dark/light/system modes. The only chromatic brand colors are cyan `#49D1EC`, violet `#AA8BFF`, and cream `#F6DFB1`; semantic states use icons and labels as well as color. Use official assets in `public/logo`. Every shell must work at 360px and desktop widths. Preserve `Copyright © Miracle` and social contacts in the footer.

## Scope boundary

This plan owns tokens, primitives, brand assets, global shells, navigation, theme behavior, and accessibility. It does not migrate event business logic.

## Task 1: Protect rollout with a V3 foundation flag

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`

- [ ] Add `ui_v3_foundation` to `FeatureFlag` with a default of `false`.
- [ ] Add tests for the default and `FEATURE_FLAG_UI_V3_FOUNDATION=true` override.
- [ ] Run `pnpm vitest run src/lib/feature-flags.test.ts` and confirm it passes.
- [ ] Commit: `git commit -am "feat(ui): add v3 foundation feature flag"`

## Task 2: Install Montserrat and define design tokens

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/styles/miracle-v3-tokens.css`
- Modify: `src/app/globals.css`
- Create: `src/styles/miracle-v3-tokens.test.ts`

- [ ] Add `@fontsource/montserrat` and load weights 400, 500, 600, 700, and 800.
- [ ] Define dark and light neutral surfaces, the three brand colors, text roles, borders, focus rings, spacing, radii, content widths, elevation, and motion as CSS custom properties under `.miracle-v3`.
- [ ] Keep success, warning, and error values scoped to feedback components; never use them as decorative palette colors.
- [ ] Add a source test that asserts the three approved chromatic tokens and Montserrat family.
- [ ] Run `pnpm vitest run src/styles/miracle-v3-tokens.test.ts` and `pnpm lint`.
- [ ] Commit: `git commit -am "feat(ui): add miracle v3 tokens and Montserrat"`

## Task 3: Build the official brand and primitive components

**Files:**
- Create: `src/components/v3/BrandLogo.tsx`
- Create: `src/components/v3/Button.tsx`
- Create: `src/components/v3/Surface.tsx`
- Create: `src/components/v3/StatusBadge.tsx`
- Create: `src/components/v3/EmptyState.tsx`
- Create: `src/components/v3/Tooltip.tsx`
- Create: `src/components/v3/primitives.test.tsx`

- [ ] Write failing tests for horizontal/symbol logo variants, button hierarchy, non-color status labels, empty-state action, keyboard tooltip access, and visible focus.
- [ ] Use `public/logo/miracle-horizontal.svg` and `public/logo/miracle-symbol.svg`; do not recreate the logo with an icon.
- [ ] Implement primitives with typed variants and no hard-coded page colors.
- [ ] Run `pnpm vitest run src/components/v3/primitives.test.tsx`.
- [ ] Commit: `git commit -am "feat(ui): add v3 brand primitives"`

## Task 4: Build public and operator shells

**Files:**
- Create: `src/components/v3/PublicShell.tsx`
- Create: `src/components/v3/OperatorShell.tsx`
- Create: `src/components/v3/EventWorkspaceShell.tsx`
- Create: `src/components/v3/SiteFooter.tsx`
- Create: `src/components/v3/shells.test.tsx`
- Modify: `src/components/shell.tsx`
- Modify: `messages/id.json`
- Modify: `messages/en.json`

- [ ] Test centered primary navigation, centered event title region, responsive sidebar/drawer, skip link, active route, compact verified-organizer identity, copyright, and social contacts.
- [ ] Build `PublicShell` for discovery and public event pages.
- [ ] Build `OperatorShell` for organizer/captain/admin with a desktop sidebar and mobile drawer.
- [ ] Build `EventWorkspaceShell` with contextual event navigation and a persistent next-action region.
- [ ] Switch `src/components/shell.tsx` through `ui_v3_foundation`; preserve the current shell when disabled.
- [ ] Run `pnpm vitest run src/components/v3/shells.test.tsx src/components/shell.test.tsx`.
- [ ] Commit: `git commit -am "feat(ui): add responsive v3 shells"`

## Task 5: Preserve and restyle organizer theme control

**Files:**
- Modify: `src/components/panel/PanelThemeToggle.tsx`
- Modify: `src/components/panel/PanelShell.tsx`
- Modify: `src/lib/theme/panel-theme.test.ts`
- Modify: `tests/e2e-smoke/panel-theme.smoke.spec.ts`

- [ ] Retain the current storage contract and dark/light/system choices.
- [ ] Default new sessions to dark without overwriting an existing saved choice.
- [ ] Apply V3 token values to both themes and prevent a flash of the wrong theme.
- [ ] Verify reload persistence and system-theme changes in the smoke test.
- [ ] Run `pnpm vitest run src/lib/theme/panel-theme.test.ts` and `pnpm playwright test tests/e2e-smoke/panel-theme.smoke.spec.ts`.
- [ ] Commit: `git commit -am "feat(ui): align panel themes with miracle v3"`

## Task 6: Visual and accessibility gate

**Files:**
- Create: `tests/e2e-smoke/v3-foundation.smoke.spec.ts`
- Modify: `docs/snapshots/product-ux-redesign-2026-09/miracle-v3-product-architecture.md`

- [ ] Test public, organizer, captain, and admin shells at 360x800, 768x1024, and 1440x900.
- [ ] Assert no document-level horizontal overflow, keyboard access to navigation, visible focus, correct logo asset, footer content, and dark default.
- [ ] Compare against the approved mockups and record only intentional differences in the architecture document.
- [ ] Run `pnpm lint`, `pnpm test`, and `pnpm playwright test tests/e2e-smoke/v3-foundation.smoke.spec.ts`.
- [ ] Commit: `git commit -am "test(ui): verify miracle v3 foundation"`

