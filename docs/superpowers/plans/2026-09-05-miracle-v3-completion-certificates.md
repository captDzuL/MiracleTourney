# Miracle V3 Completion and Certificates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for each implementation task and `verification-before-completion` before marking the plan complete.

**Goal:** Complete tournaments safely, lock an auditable podium and awards, and generate seven premium, verifiable certificate types with explicit team-logo and character-art placement.

**Architecture:** A format-aware completion service evaluates immutable readiness facts, then snapshots podium and award decisions. Certificate jobs render versioned assets from the snapshot; public publication happens only after the organizer approves the generated set.

**Tech Stack:** Prisma/PostgreSQL, TypeScript, React, Sharp/Puppeteer certificate pipeline, Vercel Blob, QRCode, Vitest, Playwright.

**Global Constraints:** Completion requires all required official results, no active competitive dispute, deterministic podium, and validated source statistics for individual awards. Team certificates use the team logo as the hero and no character art. Individual certificates use character art as the hero and the team logo as a secondary badge. Output is 1080x1920 portrait with fixed protected zones. Generated files are versioned and verifiable.

## Scope boundary

This plan owns completion readiness, podium/award snapshots, certificate rendering and publication. The adaptive public presentation is implemented in the public-event plan.

## Task 1: Replace the one-certificate data model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260905_v3_completion_certificates/migration.sql`
- Create: `src/lib/completion/schema-contract.test.ts`

- [ ] Add `TournamentCompletion`, `PodiumPlacement`, `EventAward`, `AwardDecision`, and `CompletionAuditEntry`.
- [ ] Change `Event.certificate` to `Event.certificates` and remove the unique `Certificate.eventId` constraint.
- [ ] Add certificate type, recipient kind/id/name, version, template version, asset manifest, status, verification code, published URL, generated/published timestamps, and superseded version.
- [ ] Migrate existing champion certificates as version 1 `champion` team certificates without breaking current verification URLs.
- [ ] Run `pnpm prisma validate` and schema tests.
- [ ] Commit: `git commit -am "feat(completion): add podium awards and versioned certificates"`

## Task 2: Implement format-aware completion readiness

**Files:**
- Create: `src/lib/completion/readiness.ts`
- Create: `src/lib/completion/readiness.test.ts`
- Create: `src/lib/completion/podium.ts`
- Create: `src/lib/completion/podium.test.ts`

- [ ] Derive Single Elimination podium from Final and Third Place Match.
- [ ] Derive Double Elimination podium from Grand Final and Lower Bracket Final.
- [ ] Derive League podium from locked standings and Group + Playoffs podium from the playoff phase.
- [ ] Return explicit blockers for unofficial results, active disputes, unresolved final ties, or missing validated award statistics.
- [ ] Test every format, insufficient semifinal structure, corrected result, unresolved league tie, and active dispute.
- [ ] Commit: `git commit -am "feat(completion): derive readiness and podium"`

## Task 3: Implement award decisions and tournament completion

**Files:**
- Create: `src/lib/completion/awards.ts`
- Create: `src/lib/completion/awards.test.ts`
- Create: `src/lib/completion/complete.ts`
- Create: `src/lib/completion/complete.test.ts`
- Create: `src/lib/actions/completion-v3-actions.ts`

- [ ] Calculate candidates for MVP, Top Scorer, Top Defender, and Top Assist from published statistics only.
- [ ] Require an organizer decision and reason for unresolved ties; record candidates and actor in the audit entry.
- [ ] Snapshot Champion, Runner-up, Third Place, and four individual awards in one idempotent completion transaction.
- [ ] Reject later competitive edits until completion is explicitly reopened with an audit reason.
- [ ] Test duplicate submission, tie resolution, reopen, changed stats after snapshot, and transaction rollback.
- [ ] Commit: `git commit -am "feat(completion): lock audited podium and awards"`

## Task 4: Build the gated Completion workspace

**Files:**
- Create: `src/app/[locale]/organizer/events/[eventId]/completion/page.tsx`
- Create: `src/components/v3/completion/ReadinessChecklist.tsx`
- Create: `src/components/v3/completion/AwardReview.tsx`
- Create: `src/components/v3/completion/PodiumPreview.tsx`
- Create: `src/components/v3/completion/completion.test.tsx`

- [ ] Match the approved completion mockup with Readiness, Awards, E-certificates, and Publication views.
- [ ] Keep blockers actionable and link each one to its repair surface.
- [ ] Show source statistics and tie explanations before an organizer chooses a recipient.
- [ ] Test blocked/ready/completed/reopened states and responsive behavior.
- [ ] Commit: `git commit -am "feat(organizer): build tournament completion workspace"`

## Task 5: Add the premium certificate template system

**Files:**
- Modify: `src/lib/certificate/template.ts`
- Modify: `src/lib/certificate/renderer.ts`
- Modify: `src/lib/certificate/generate.ts`
- Create: `src/lib/certificate/templates/miracle-v3.ts`
- Create: `src/lib/certificate/templates/miracle-v3.test.ts`
- Modify: `src/lib/certificate/renderer.test.ts`
- Modify: `src/lib/certificate/generate.test.ts`

- [ ] Define protected identity, award, recipient, date, certificate ID, QR verification, hero, and secondary-badge zones at 1080x1920.
- [ ] Render podium types with team logo hero and individual types with character-art hero plus team logo badge.
- [ ] Provide a branded fallback for missing character art without moving protected zones.
- [ ] Keep cyan, violet, cream, and logo variants legible across the light identity header and dark award field.
- [ ] Test all seven types, long names, transparent/opaque logos, missing art, safe-zone overlay exclusion, and deterministic output hashes.
- [ ] Commit: `git commit -am "feat(certificates): add premium v3 templates"`

## Task 6: Build Certificate Studio and publishing

**Files:**
- Create: `src/app/[locale]/organizer/events/[eventId]/certificates/page.tsx`
- Create: `src/components/v3/certificates/CertificateStudio.tsx`
- Create: `src/components/v3/certificates/AssetPlacement.tsx`
- Create: `src/components/v3/certificates/CertificateSetStatus.tsx`
- Create: `src/components/v3/certificates/certificate-studio.test.tsx`
- Modify: `src/lib/certificate/service.ts`
- Modify: `src/lib/certificate/service.test.ts`

- [ ] Let organizers inspect the seven generated records, position allowed assets inside safe zones, regenerate a new version, compare versions, and publish the approved set.
- [ ] Never overwrite a published file; supersede it and preserve verification history.
- [ ] Keep safe-zone guides editor-only.
- [ ] Test type switching, upload validation, regenerate retry, partial generation failure, publication, and supersession.
- [ ] Commit: `git commit -am "feat(certificates): build certificate studio"`

## Task 7: Completion verification gate

**Files:**
- Create: `tests/e2e/organizer-v3-completion.spec.ts`
- Create: `tests/e2e/organizer-v3-certificates.spec.ts`

- [ ] Complete one event for each release format and verify its podium source.
- [ ] Resolve an award tie, generate all seven certificates, publish them, verify QR targets, and confirm a superseded version remains valid.
- [ ] Capture 1080x1920 output dimensions and run a visual inspection for logo and character safe zones.
- [ ] Run `pnpm lint`, focused unit tests, both E2E specs, and `pnpm build`.
- [ ] Commit: `git commit -am "test(completion): verify awards and certificates"`

