# Miracle V3 Rollout Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute the linked implementation plans in order, use `requesting-code-review` at each phase gate, and use `verification-before-completion` before enabling a production flag.

**Goal:** Deliver the approved Miracle V3 experience incrementally with reviewable releases, safe data migration, measurable parity, and a clean retirement path for legacy compositions.

**Architecture:** Five independently flagged workstreams share the approved architecture blueprint. Each workstream lands schema and domain behavior before UI activation, keeps existing routes as rollback paths, and advances only after focused and full-story verification.

**Tech Stack:** The existing Miracle Next.js/React/Prisma/Vitest/Playwright stack.

**Global Constraints:** Organizer is the first product priority, followed by Public and Captain. No release may strand a user between V2 and V3, expose draft data, duplicate the canonical Event Page, or delete legacy fields before successful backfill and parity verification.

## Source of truth

- Product architecture: `docs/snapshots/product-ux-redesign-2026-09/miracle-v3-product-architecture.md`
- Design foundation: `docs/superpowers/plans/2026-09-05-miracle-v3-design-foundation.md`
- Event lifecycle and registration: `docs/superpowers/plans/2026-09-05-miracle-v3-event-lifecycle-registration.md`
- Competition operations: `docs/superpowers/plans/2026-09-05-miracle-v3-competition-operations.md`
- Completion and certificates: `docs/superpowers/plans/2026-09-05-miracle-v3-completion-certificates.md`
- Adaptive public Event Page: `docs/superpowers/plans/2026-09-05-miracle-v3-adaptive-public-event.md`

## Phase 0: Establish baselines

- [ ] Record current unit, E2E smoke, build, and key organizer/public/captain flow results.
- [ ] Capture current production schema row counts for events, matches, registrations, stats, and certificates without copying personal contact data into artifacts.
- [ ] Document rollback owners and feature-flag values for every environment.
- [ ] Confirm all approved mockups referenced by the architecture file exist.

## Phase 1: Ship design foundation dark

- [ ] Execute `2026-09-05-miracle-v3-design-foundation.md`.
- [ ] Review public/operator shells in dark, light, and system themes.
- [ ] Enable `ui_v3_foundation` in a non-production environment and run the complete smoke suite.
- [ ] Gate: official logo, Montserrat, three-color palette, responsive navigation, copyright/social footer, and accessibility checks pass.

## Phase 2: Ship organizer event creation and registration

- [ ] Execute `2026-09-05-miracle-v3-event-lifecycle-registration.md`.
- [ ] Backfill structured dates and WIB timezone while retaining legacy display fields.
- [ ] Enable `organizer_workspace_v3` for internal organizers, then `registration_workspace_v3` after direct/import parity.
- [ ] Gate: draft autosave recovery, no-login private preview, publication readiness, and 10/25/50 import review work end to end.

## Phase 3: Ship competition operations by format

- [ ] Execute `2026-09-05-miracle-v3-competition-operations.md`.
- [ ] Run deterministic engine fixtures against seeded examples before migrating active events.
- [ ] Activate Single Elimination first, then League, Group + Playoffs, and Double Elimination under the same flag after each format passes its routing suite.
- [ ] Gate: official scores transactionally update progression and schedules; stats drafts never block; correction safety prevents invalid downstream rewrites.

## Phase 4: Ship completion and certificates

- [ ] Execute `2026-09-05-miracle-v3-completion-certificates.md`.
- [ ] Migrate existing champion certificates and verify old links before enabling new generation.
- [ ] Gate: all formats derive correct podiums, tied awards are audited, seven 1080x1920 types render, and versioned verification works.

## Phase 5: Make the public Event Page adaptive

- [ ] Execute `2026-09-05-miracle-v3-adaptive-public-event.md`.
- [ ] Enable `adaptive_public_event_v3` only after published competition/completion read models are available.
- [ ] Gate: one permanent URL correctly serves Registration, Ongoing, and Finished; no separate live/recap content competes with it.

## Phase 6: Production rollout and observation

- [ ] Roll out each flag to internal events, selected organizers, then all events.
- [ ] Monitor autosave conflicts, preview-token failures, import row errors, result transaction rollbacks, schedule recalculation time, completion blockers, certificate generation failures, and public-page latency.
- [ ] Define rollback as disabling the affected composition flag while retaining new data; do not reverse schema migrations during incident response.
- [ ] Keep each phase observable for at least one complete representative tournament before expanding the next phase.

## Phase 7: Retire compatibility paths

- [ ] Remove legacy UI compositions only after V3 parity is verified and the rollback observation window closes.
- [ ] Backfill and validate every legacy string field before dropping it in a separate migration.
- [ ] Remove compatibility facades from `src/lib/tournament/engine.ts`, `src/lib/actions.ts`, and `src/lib/platform/repository.ts` only after all callers move to domain modules.
- [ ] Run `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` on the cleanup change.
- [ ] Update `public/plan.md`, `public/snapshot.md`, and the architecture blueprint with the production state and final route map.

