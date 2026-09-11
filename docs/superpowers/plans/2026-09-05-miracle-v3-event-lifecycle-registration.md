# Miracle V3 Event Lifecycle and Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for each implementation task and `verification-before-completion` before marking the plan complete.

**Goal:** Let an organizer create, autosave, privately preview, publish, and manage registration for an event without losing direction or data.

**Architecture:** Introduce structured event timing, organizer identity, draft readiness, and revocable preview tokens in the domain layer. Compose a contextual organizer workspace over the existing actions and registration import services, migrating one use case at a time behind feature flags.

**Tech Stack:** Next.js Server Actions, Prisma/PostgreSQL, Zod, React 19, Vitest, Playwright, ExcelJS, csv-parse.

**Global Constraints:** Drafts always autosave. Private preview links open without login but are unguessable, revocable, and read-only. Timezone defaults to `Asia/Jakarta` (WIB). Venue name is sufficient; address is optional. Registration start/end and event start date are structured values. Existing supported games remain the available catalog. Organizers may run overlapping events, including the same game.

## Scope boundary

This plan owns organizer profile, event draft and publishing readiness, private preview, direct registration review, XLS/CSV import, and pagination. Competition generation starts in the competition plan.

## Task 1: Add lifecycle flags and schema

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260905_v3_event_lifecycle/migration.sql`
- Create: `src/lib/events/schema.test.ts`

- [ ] Add flags `organizer_workspace_v3` and `registration_workspace_v3`, both defaulting to `false`.
- [ ] Add `OrganizerProfile` with organization name, contact channel/value, and verification fields.
- [ ] Add structured `registrationOpensAt`, `registrationClosesAt`, `eventStartsAt`, `timezone`, optional `venueAddress`, draft revision, publication timestamp, and preview revision to `Event` while retaining legacy strings during migration.
- [ ] Add hashed, expiring, revocable `EventPreviewToken`; store no raw token.
- [ ] Write migration and schema-contract tests, then run `pnpm prisma validate` and the focused tests.
- [ ] Commit: `git commit -am "feat(events): add v3 lifecycle schema"`

## Task 2: Implement autosave and publish-readiness services

**Files:**
- Create: `src/lib/events/event-draft.ts`
- Create: `src/lib/events/event-draft.test.ts`
- Create: `src/lib/events/publish-readiness.ts`
- Create: `src/lib/events/publish-readiness.test.ts`
- Create: `src/lib/actions/event-v3-actions.ts`

- [ ] Define a Zod draft schema that accepts incomplete drafts and a publish schema that requires public essentials.
- [ ] Implement revision-aware autosave so stale browser tabs receive a conflict response rather than overwriting newer content.
- [ ] Return field-level save state and the exact incomplete readiness items.
- [ ] Keep overlapping dates valid; add a non-blocking informational overlap notice only.
- [ ] Test partial saves, zero-value fees, optional venue address, WIB default, stale revision, retry idempotency, and publish gating.
- [ ] Run focused tests and `pnpm lint`.
- [ ] Commit: `git commit -am "feat(events): add reliable draft autosave"`

## Task 3: Implement private no-login preview links

**Files:**
- Create: `src/lib/events/preview-token.ts`
- Create: `src/lib/events/preview-token.test.ts`
- Create: `src/app/[locale]/preview/events/[token]/page.tsx`
- Create: `src/app/[locale]/preview/events/[token]/page.test.tsx`
- Modify: `src/lib/actions/event-v3-actions.ts`

- [ ] Generate a cryptographically random raw token, persist its hash, and show the raw value only in the generated URL.
- [ ] Validate event ownership for create/revoke actions and token expiry/revocation for public reads.
- [ ] Render the draft through the same public event view model with a persistent “Private preview” banner and no write controls.
- [ ] Test valid, expired, revoked, malformed, and replaced links.
- [ ] Commit: `git commit -am "feat(events): add revocable private previews"`

## Task 4: Build the contextual organizer workspace

**Files:**
- Create: `src/app/[locale]/organizer/events/new/page.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/layout.tsx`
- Create: `src/app/[locale]/organizer/events/[eventId]/overview/page.tsx`
- Create: `src/components/v3/events/EventDraftForm.tsx`
- Create: `src/components/v3/events/DraftStatus.tsx`
- Create: `src/components/v3/events/PublishReadiness.tsx`
- Create: `src/components/v3/events/event-draft-form.test.tsx`

- [ ] Match the approved contextual and multiformat creation references: clear next action, autosave state, prominent registration dates/contact, poster upload with separate compact event logo, and private preview.
- [ ] Show contextual sections in an event sidebar; avoid a mandatory linear wizard.
- [ ] Keep advanced format controls collapsed until a format is selected.
- [ ] Test keyboard completion, autosave feedback, retry, unload recovery, preview creation, and publish readiness.
- [ ] Commit: `git commit -am "feat(events): build contextual organizer workspace"`

## Task 5: Recompose direct registration and imports

**Files:**
- Create: `src/app/[locale]/organizer/events/[eventId]/registration/page.tsx`
- Create: `src/components/v3/registration/RegistrationQueue.tsx`
- Create: `src/components/v3/registration/ImportReviewTable.tsx`
- Create: `src/components/v3/registration/RegistrationEmptyState.tsx`
- Modify: `src/lib/imports/registration-intake.ts`
- Modify: `src/lib/imports/registration-intake.test.ts`
- Create: `src/components/v3/registration/registration-workspace.test.tsx`

- [ ] Reuse the existing direct request and XLS/CSV intake rules through one normalized review queue.
- [ ] If no teams exist, expose both “Register team” and “Import XLS/CSV” actions.
- [ ] Implement server-backed pagination with 10, 25, and 50 row choices; preserve page size in the URL.
- [ ] Show invalid/duplicate rows with repair guidance before commit and make batch commit idempotent.
- [ ] Test empty, mixed-validity, duplicate, paginated, retried, and committed imports.
- [ ] Commit: `git commit -am "feat(registration): add v3 review and import workspace"`

## Task 6: End-to-end lifecycle gate

**Files:**
- Create: `tests/e2e/organizer-v3-event-lifecycle.spec.ts`
- Create: `tests/e2e/organizer-v3-registration.spec.ts`
- Modify: `messages/id.json`
- Modify: `messages/en.json`

- [ ] Cover create draft, refresh recovery, preview without login, token revocation, publish gating, direct registration, CSV import, 10/25/50 pagination, approval, and rejection.
- [ ] Verify 360px mobile and desktop without horizontal overflow.
- [ ] Run `pnpm lint`, focused unit tests, both E2E specs, and `pnpm build`.
- [ ] Commit: `git commit -am "test(events): verify v3 lifecycle and registration"`

