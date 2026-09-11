# Adaptive Public Event Scroll-Spy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Adaptive Public Event section navigation clearly indicate the active destination during click, deep-link, and manual scrolling.

**Architecture:** Add one focused client component that owns hash navigation and IntersectionObserver state while the existing server composition continues to own event data. Existing content components expose stable section IDs and shared scroll/highlight hooks without moving business logic client-side.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- Scope is limited to Adaptive Public Event V3 registration composition.
- Preserve `#summary`, `#participants`, `#requirements`, and `#organizer` deep links.
- Use Miracle cyan, violet, and cream tokens with Montserrat.
- Exactly one navigation link receives `aria-current="location"`.
- Real anchors, keyboard focus styles, 44 px touch targets, and browser back/forward must remain functional.
- Respect `prefers-reduced-motion`.
- Do not alter registration business data, CTA decisions, legacy rendering, or Ongoing/Finished rendering.
- All browser verification uses `.env.test` and Neon Delicate; production database is forbidden.

---

### Task 1: Active section navigation component

**Files:**
- Create: `src/components/v3/public-event/PublicEventSectionNav.tsx`
- Create: `src/components/v3/public-event/PublicEventSectionNav.test.tsx`

**Interfaces:**
- Consumes: localized labels `{ summary, participants, requirements, organizer }`.
- Produces: `PublicEventSectionNav({ labels }: { labels: Record<PublicEventSectionId, string> })` and stable `PUBLIC_EVENT_SECTION_IDS`.

- [ ] **Step 1: Write failing component tests**

Cover default Summary state, valid initial hash, click updates active state and hash, observer updates active state, `aria-current`, focus-visible styling, and reduced-motion scroll behavior. Stub `IntersectionObserver`, `matchMedia`, `scrollIntoView`, and `history.pushState` only at browser boundaries.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
pnpm vitest run src/components/v3/public-event/PublicEventSectionNav.test.tsx
```

Expected: failure because `PublicEventSectionNav` does not exist.

- [ ] **Step 3: Implement the client component**

Use a `"use client"` component with this section contract:

```ts
export const PUBLIC_EVENT_SECTION_IDS = [
  "summary",
  "participants",
  "requirements",
  "organizer",
] as const;

export type PublicEventSectionId = typeof PUBLIC_EVENT_SECTION_IDS[number];
```

On mount, accept a valid `window.location.hash`, otherwise select `summary`. Observe every target using a top-biased root margin. On click, prevent the default jump, update the active ID immediately, push the hash, scroll the destination using `smooth` unless reduced motion is requested, and add a temporary `data-section-highlighted="true"` marker. Listen to `hashchange`/`popstate` so browser navigation restores the section.

Render real anchor links in a sticky, horizontally scrollable nav. Give the active anchor cyan text, a violet bottom border, and `aria-current="location"`; give every anchor a visible focus ring and minimum height of 44 px.

- [ ] **Step 4: Run focused tests**

Run the Task 1 test until all cases pass.

- [ ] **Step 5: Commit**

```powershell
git add src/components/v3/public-event/PublicEventSectionNav.tsx src/components/v3/public-event/PublicEventSectionNav.test.tsx
git commit -m "feat(ui): add adaptive event scroll spy"
```

### Task 2: Wire destinations and browser verification

**Files:**
- Modify: `src/components/v3/public-event/AdaptiveRegistrationEventPage.tsx`
- Modify: `src/components/v3/public-event/RegistrationOverview.tsx`
- Modify: `src/components/v3/public-event/OrganizerPublicCard.tsx`
- Modify: `src/components/v3/public-event/AdaptiveRegistrationEventPage.test.tsx`
- Modify: `tests/e2e/v3-adaptive-public-registration.spec.ts`
- Modify: `public/plan.md`
- Modify: `public/snapshot.md`

**Interfaces:**
- Consumes: `PublicEventSectionNav` and the four stable target IDs.
- Produces: visible active-state feedback, offset-safe destinations, and browser-tested deep links.

- [ ] **Step 1: Add failing composition tests**

Assert that the adaptive page renders `PublicEventSectionNav`, all four target IDs, shared `scroll-mt-*` offset classes, and no duplicate navigation. Assert the organizer target surrounds the organizer content rather than an empty spacer.

- [ ] **Step 2: Run focused component tests and confirm failure**

```powershell
pnpm vitest run src/components/v3/public-event/AdaptiveRegistrationEventPage.test.tsx
```

Expected: failure until the new navigation and target hooks are wired.

- [ ] **Step 3: Wire the component and destination feedback**

Replace the static nav in `AdaptiveRegistrationEventPage` with `PublicEventSectionNav`. Add a shared class to each target:

```text
scroll-mt-32 transition-[border-color,box-shadow] data-[section-highlighted=true]:border-[var(--color-brand-cyan)] data-[section-highlighted=true]:shadow-[0_0_0_1px_var(--color-brand-cyan)]
```

For `requirements`, apply the target attributes to a containing section while preserving its two-column card layout. For Organizer, apply them to the card section that contains the organizer identity and contact.

- [ ] **Step 4: Extend adaptive browser coverage**

In the existing unique-fixture spec, click Persyaratan and assert its anchor has `aria-current="location"`, the hash is `#requirements`, and the target receives the highlight marker. Scroll Organizer into view and assert observer-driven `aria-current`. Load a direct `#participants` URL and test browser back/forward. Keep the existing 360 px document-width assertion.

- [ ] **Step 5: Update canonical handoff documentation**

Record scroll-spy behavior and verification in `public/plan.md` and `public/snapshot.md`. Do not mark any other lifecycle composition complete.

- [ ] **Step 6: Run final gates**

```powershell
pnpm vitest run src/components/v3/public-event/PublicEventSectionNav.test.tsx src/components/v3/public-event/AdaptiveRegistrationEventPage.test.tsx
pnpm lint
pnpm playwright test tests/e2e/v3-adaptive-public-registration.spec.ts --reporter=line
git diff --check
```

Expected: all focused tests pass, TypeScript passes, five existing adaptive scenarios plus scroll-spy assertions pass serially, and diff check is clean.

- [ ] **Step 7: Commit and push**

```powershell
git add src/components/v3/public-event tests/e2e/v3-adaptive-public-registration.spec.ts public/plan.md public/snapshot.md
git commit -m "test(ui): verify adaptive event section navigation"
git push origin feature/ui/adaptive-public-event-v3
```
