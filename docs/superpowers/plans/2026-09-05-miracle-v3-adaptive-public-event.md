# Miracle V3 Adaptive Public Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for each implementation task and `verification-before-completion` before marking the plan complete.

**Goal:** Turn the permanent public Event Page into the single informative destination that adapts across Registration, Ongoing, and Finished states while retaining focused detail routes.

**Architecture:** A server-side event view-model builder converts domain state into an explicit lifecycle discriminated union. The route renders one stable identity shell plus lifecycle-specific compositions. Detail pages reuse the same read models for participants, schedules/results, brackets, standings, leaderboards, awards, and certificates.

**Tech Stack:** Next.js 15 App Router, React 19 Server Components, Prisma read models, next-intl, Vitest, Playwright.

**Global Constraints:** The canonical URL stays `/[locale]/events/[slug]`. Do not add separate Live Match Center or Final Public Recap routes. Public pages must explain status, dates, format, participation, organizer identity, contacts, and the next action in plain language. No authentication is required for published public information. Desktop and mobile are equal targets.

## Scope boundary

This plan owns public read models, lifecycle composition, metadata, and detail navigation. Organizer writes and competition calculations remain in their respective plans.

## Task 1: Add the adaptive public rollout flag and lifecycle contract

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`
- Create: `src/lib/public-event/types.ts`
- Create: `src/lib/public-event/types.test.ts`

- [ ] Add `adaptive_public_event_v3` with default `false`.
- [ ] Define `registration`, `ongoing`, and `finished` view-model variants with a shared identity, organizer trust block, contacts, and contextual navigation.
- [ ] Require each variant to expose a human-readable status explanation and primary action.
- [ ] Test exhaustive variant handling and invalid domain-state combinations.
- [ ] Commit: `git commit -am "feat(public): add adaptive event lifecycle contract"`

## Task 2: Build the server-side public event view model

**Files:**
- Create: `src/lib/public-event/load.ts`
- Create: `src/lib/public-event/load.test.ts`
- Create: `src/lib/public-event/derive-lifecycle.ts`
- Create: `src/lib/public-event/derive-lifecycle.test.ts`

- [ ] Load event identity, visuals, structured dates, organizer profile, contacts, registration capacity, teams, schedule/results, format-specific context, published statistics, podium, awards, and published certificates.
- [ ] Derive lifecycle from publication/completion and timing facts; do not depend on display strings.
- [ ] Return registration guidance and capacity for Registration; live/current/next match and notices for Ongoing; champion, podium, final journey, awards, and certificates for Finished.
- [ ] Cache only published read models and tag them by event so official results and publication actions invalidate the correct page.
- [ ] Test missing optional fields, timezone formatting, group/league/elimination context, unpublished stats, and unavailable certificates.
- [ ] Commit: `git commit -am "feat(public): build adaptive event read model"`

## Task 3: Build the shared public event identity and navigation

**Files:**
- Create: `src/components/v3/public-event/EventIdentity.tsx`
- Create: `src/components/v3/public-event/EventContextNav.tsx`
- Create: `src/components/v3/public-event/OrganizerTrustBlock.tsx`
- Create: `src/components/v3/public-event/EventEssentials.tsx`
- Create: `src/components/v3/public-event/shared.test.tsx`

- [ ] Keep event title and contextual event navigation visually centered where space allows.
- [ ] Give poster a clear hero position and event logo a smaller identity role.
- [ ] Make organizer name, verification state, and contact actions readable without competing with event description.
- [ ] Add explanatory tooltips only for unfamiliar competition terms and make them keyboard/touch accessible.
- [ ] Test long titles, missing poster/logo, unverified organizer, multiple contacts, and 360px layout.
- [ ] Commit: `git commit -am "feat(public): add event identity and trust components"`

## Task 4: Build Registration composition

**Files:**
- Create: `src/components/v3/public-event/RegistrationEventView.tsx`
- Create: `src/components/v3/public-event/RegistrationWindow.tsx`
- Create: `src/components/v3/public-event/RegistrationEventView.test.tsx`

- [ ] Prioritize description, registration opens/closes, event start date, WIB label, fee, capacity, roster rules, registration guidance, venue name, organizer contact, and registration CTA.
- [ ] Explain closed, full, upcoming, and open registration states with text and actions.
- [ ] Route captains to the existing or V3 direct-registration flow based on its feature flag.
- [ ] Test every registration state and missing optional venue address.
- [ ] Commit: `git commit -am "feat(public): add registration event composition"`

## Task 5: Build Ongoing composition

**Files:**
- Create: `src/components/v3/public-event/OngoingEventView.tsx`
- Create: `src/components/v3/public-event/LiveMatchCard.tsx`
- Create: `src/components/v3/public-event/ScheduleNotice.tsx`
- Create: `src/components/v3/public-event/OngoingEventView.test.tsx`

- [ ] Show live match and series state, next match, official recent results, public schedule changes, bracket or standings context, leaderboard access, and organizer announcements.
- [ ] Display “live” only from authoritative match state; otherwise use scheduled/delayed/awaiting-result copy.
- [ ] Render group qualification cutlines or bracket dependencies based on format.
- [ ] Test no-live-match, delayed match, simultaneous rooms, official correction, and unpublished statistics.
- [ ] Commit: `git commit -am "feat(public): add ongoing event composition"`

## Task 6: Build Finished composition as the final recap

**Files:**
- Create: `src/components/v3/public-event/FinishedEventView.tsx`
- Create: `src/components/v3/public-event/ChampionStory.tsx`
- Create: `src/components/v3/public-event/Podium.tsx`
- Create: `src/components/v3/public-event/AwardsGrid.tsx`
- Create: `src/components/v3/public-event/FinishedEventView.test.tsx`

- [ ] Present champion story, full podium, Grand Final or decisive league result, champion journey, final bracket/standings, four individual awards, and the seven published certificates.
- [ ] Suppress unpublished certificate files and state clearly when certificates are being prepared.
- [ ] Support League completion without inventing a Grand Final.
- [ ] Test every release format, partial certificate publication, missing optional character art, and reopened completion.
- [ ] Commit: `git commit -am "feat(public): turn finished event into final recap"`

## Task 7: Compose the canonical route and retain details

**Files:**
- Modify: `src/app/[locale]/events/[slug]/page.tsx`
- Modify: `src/app/events/[slug]/page.tsx`
- Modify: `src/app/events/[slug]/bracket/page.tsx`
- Create: `src/app/[locale]/events/[slug]/schedule/page.tsx`
- Create: `src/app/[locale]/events/[slug]/awards/page.tsx`
- Create: `src/app/[locale]/events/[slug]/certificates/page.tsx`
- Modify: `messages/id.json`
- Modify: `messages/en.json`

- [ ] Compose the V3 view under `adaptive_public_event_v3` and preserve the existing Event Page when disabled.
- [ ] Keep participant, schedule/results, bracket, standings, leaderboards, awards, and certificates as deeper destinations; hide irrelevant links by format/state.
- [ ] Generate lifecycle-aware metadata, Open Graph description, canonical URL, and JSON-LD event dates from structured fields.
- [ ] Redirect any experimental live/recap aliases to the canonical Event Page rather than publishing competing content.
- [ ] Commit: `git commit -am "feat(public): compose canonical adaptive event page"`

## Task 8: Public information and regression gate

**Files:**
- Create: `tests/e2e/public-v3-adaptive-event.spec.ts`
- Modify: `tests/e2e-smoke/public-shell.smoke.spec.ts`
- Modify: `tests/e2e-smoke/public-visual-v2.smoke.spec.ts`

- [ ] Seed one Registration, Ongoing, and Finished event plus league/group/elimination variants.
- [ ] Verify stable URL through lifecycle transitions, no authentication prompt, correct primary information, format-aware links, organizer contact, footer, and published-only awards/certificates.
- [ ] Test 360x800, 768x1024, and 1440x900 with no document-level overflow.
- [ ] Run `pnpm lint`, focused unit tests, public E2E tests, `pnpm test:e2e:smoke`, and `pnpm build`.
- [ ] Commit: `git commit -am "test(public): verify adaptive event experience"`

