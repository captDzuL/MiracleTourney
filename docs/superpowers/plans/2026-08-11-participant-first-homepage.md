# Participant-First Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the homepage into a participant-first demo lobby that encourages visitors to explore public tournament pages before registering.

**Architecture:** Keep the existing server-rendered Next.js homepage and event repository calls. Add localized copy keys for the demo lobby, then reshape the hero and quick-link area around the first filtered public event.

**Tech Stack:** Next.js App Router, React server components, next-intl messages, Tailwind CSS, Vitest source assertions, Playwright locale smoke coverage.

## Global Constraints

- Target files are `src/app/home-page-content.tsx`, `messages/id.json`, `messages/en.json`, and focused homepage tests.
- Preserve existing event data, localization, routing, `GameArt`, and event-card status CTA behavior.
- Do not add dependencies or backend data.
- The homepage must not make "Register Your Team" / "Daftarkan Tim" the dominant hero action.
- The first visible event acts as the demo showcase when events exist.

---

### Task 1: Lock Participant-First Homepage Expectations

**Files:**
- Modify: `tests/e2e/locale-switcher.spec.ts`
- Modify: `src/app/events/page.test.ts`

**Interfaces:**
- Consumes: existing homepage route `/id` and `/en`
- Produces: failing expectations for the new localized headline and source-level quick links

- [ ] **Step 1: Update the Playwright locale test**

```ts
await expect(page.getByRole("heading", { name: "Lihat Turnamen Komunitas yang Lagi Berjalan" })).toBeVisible();
await expect(page.getByRole("heading", { name: "Explore Live Community Tournaments" })).toBeVisible();
```

- [ ] **Step 2: Add a source assertion for demo-lobby actions**

```ts
const source = fs.readFileSync(path.resolve(__dirname, "../home-page-content.tsx"), "utf8");
expect(source).toContain("featuredEvent");
expect(source).toContain("quickLinks");
expect(source).not.toContain('href="/register"');
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run: `pnpm vitest run src/app/events/page.test.ts`

Expected: FAIL because the homepage has not been updated yet.

### Task 2: Add Localized Demo-Lobby Copy

**Files:**
- Modify: `messages/id.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces home copy keys used by `HomePageContent`: `viewDemoEvent`, `exploreDemo`, `quickLinks`, `bracketShortcut`, `participantsShortcut`, `leaderboardShortcut`, `standingsShortcut`, `joinNext`, `registrationNote`, `featuredEvent`

- [ ] **Step 1: Replace generic headline and description**

Indonesian:
```json
"headline": "Lihat Turnamen Komunitas yang Lagi Berjalan",
"description": "Cek bracket, peserta, klasemen, dan statistik match dari event demo Miracle League."
```

English:
```json
"headline": "Explore Live Community Tournaments",
"description": "Check brackets, participants, standings, and match stats from a Miracle League demo event."
```

- [ ] **Step 2: Add the new action labels**

Indonesian:
```json
"viewDemoEvent": "Lihat Demo Event",
"exploreDemo": "Jelajahi Demo",
"quickLinks": "Jalur cepat demo",
"bracketShortcut": "Bracket",
"participantsShortcut": "Peserta",
"leaderboardShortcut": "Leaderboard",
"standingsShortcut": "Klasemen",
"joinNext": "Mau ikut turnamen berikutnya?",
"registrationNote": "Pendaftaran peserta diarahkan lewat organizer saat event dibuka.",
"featuredEvent": "Event demo unggulan"
```

English:
```json
"viewDemoEvent": "View Demo Event",
"exploreDemo": "Explore Demo",
"quickLinks": "Demo quick paths",
"bracketShortcut": "Bracket",
"participantsShortcut": "Participants",
"leaderboardShortcut": "Leaderboard",
"standingsShortcut": "Standings",
"joinNext": "Want to join the next tournament?",
"registrationNote": "Participant registration is coordinated by the organizer when an event opens.",
"featuredEvent": "Featured demo event"
```

- [ ] **Step 3: Run JSON parsing through the test command**

Run: `pnpm vitest run src/app/events/page.test.ts`

Expected: still FAIL until the component consumes the keys.

### Task 3: Reshape the Homepage Hero

**Files:**
- Modify: `src/app/home-page-content.tsx`

**Interfaces:**
- Consumes: `filteredEvents[0]`, `getGameForEvent`, `getDefaultModeLabel`, `ctaHref`
- Produces: `featuredEvent` hero and direct public demo links

- [ ] **Step 1: Import icons for quick links**

```ts
import { BarChart3, CalendarDays, ListTree, Shield, Trophy, Users } from "lucide-react";
```

- [ ] **Step 2: Derive featured event data**

```ts
const featuredEvent = filteredEvents[0];
const featuredGame = featuredEvent ? getGameForEvent(featuredEvent) : null;
const featuredMode = featuredEvent ? getDefaultModeLabel(featuredEvent.gameModeId, featuredEvent.gameId) : null;
```

- [ ] **Step 3: Replace the generic hero CTA**

Use `featuredEvent ? ctaHref(featuredEvent) : "/events"` for the primary button and `/events` as the secondary button. Do not render a `/register` hero link.

- [ ] **Step 4: Add quick links only when `featuredEvent` exists**

Render links to:
```ts
`/events/${featuredEvent.slug}`
`/events/${featuredEvent.slug}/bracket`
`/events/${featuredEvent.slug}/participants`
`/events/${featuredEvent.slug}/leaderboards`
`/events/${featuredEvent.slug}/standings`
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/app/events/page.test.ts`

Expected: PASS.

### Task 4: Verify Localized Homepage Smoke Coverage

**Files:**
- Modify: `tests/e2e/locale-switcher.spec.ts`

**Interfaces:**
- Consumes: running Next.js app via Playwright config
- Produces: proof that localized homepage headings still toggle

- [ ] **Step 1: Run type check**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 2: Run the focused Playwright spec if the app can start**

Run: `pnpm exec playwright test tests/e2e/locale-switcher.spec.ts`

Expected: PASS with Indonesian and English homepage headings visible.
