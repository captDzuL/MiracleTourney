# Miracle Public Visual System and AI Event Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Miracle's game-skinned street-sport public experience and a reviewed, durable GPT Image 2 artwork pipeline without blocking existing tournament functionality.

**Architecture:** Deliver three independently shippable milestones: the public visual system, organizer-managed visual revisions, and asynchronous AI generation. Public pages resolve one approved `EventVisualAsset`, fall back to the legacy event background during migration, and finally render a deterministic typographic poster; AI generation runs after the event request through Vercel Workflow and never runs during a public page render.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9, Tailwind CSS 4, next-intl, Prisma 6/PostgreSQL, Vercel Blob/Image Optimization/Workflow, OpenAI JavaScript SDK with GPT Image 2, Sharp, Vitest, and Playwright.

## Global Constraints

- The authoritative design is `docs/superpowers/specs/2026-08-22-public-visual-system-and-ai-event-art-design.md`.
- Phase one redesigns only the homepage, event listing, and event detail; bracket, participants, leaderboard, and standings keep data-first content and inherit only the shell/type/event header.
- Primary audience is players and gaming communities; the primary CTA explores a real event.
- Canvas is `#080c0e`, text is `#f3f0e8`, and Miracle's dominant accent is `#caff38`.
- Use Teko weights 600/700 for event wordmarks and numerals; use Chakra Petch weights 500/600/700 for navigation, metadata, controls, and body copy.
- Typography remains semantic DOM text. Generated artwork must not contain the only event name, status, or action label.
- Render at most one prioritized full-width artwork in the homepage initial viewport.
- Hero delivery budget is 300 KB desktop and 200 KB mobile; each displayed event tile is at most 120 KB.
- Decorative grain/halftone assets total at most 10 KB and must be CSS/SVG rather than raster textures.
- AI output uses an original genre-inspired character. Named heroes, game logos, trademarks, UI text, and close character likenesses are prohibited in prompts.
- Exact official game characters are allowed only through an organizer upload with a recorded rights attestation.
- Organizer approval is mandatory before AI artwork becomes public.
- Never scrape, hotlink, or choose random internet images as fallback.
- Never include participant, captain, contact, or other personal data in generation prompts.
- Generation limit is three attempts per event in a rolling 24-hour window; platform admins may override it.
- Feature flags `public_visual_v2` and `ai_event_art` are disabled by default and independently reversible.
- Preserve all existing localized URLs and event navigation behavior.
- Use TDD for each task and commit only the files named by that task.

---

## Milestone boundaries

1. **Milestone A — Pitch-ready visual system:** Tasks 1-5. This is demoable with existing organizer artwork and deterministic fallbacks; it has no OpenAI dependency.
2. **Milestone B — Organizer visual revisions:** Tasks 6-7. Uploads, approval, rejection, rollback, focal points, and provenance work without AI.
3. **Milestone C — AI generation:** Tasks 8-10. GPT Image 2 and Vercel Workflow add reviewed automatic fallback generation.
4. **Release gate:** Task 11. Accessibility, byte budgets, feature-flag rollback, and full regression verification.

## File map

### New focused modules

- `src/lib/platform/event-visual-assets.ts` — visual asset domain types, status constants, safe error codes, and prompt input allowlist.
- `src/lib/platform/event-visual-assets.test.ts` — pure resolver, prompt, and error classification tests.
- `src/lib/platform/openai-visual-generation.ts` — `VisualGenerationProvider` implementation for GPT Image 2 only.
- `src/lib/platform/openai-visual-generation.test.ts` — SDK response/error mapping tests with a mocked OpenAI client.
- `src/lib/platform/generate-event-visual.ts` — dependency-injected generation service used by the durable step.
- `src/lib/platform/generate-event-visual.test.ts` — idempotency, Blob, decoded-image, and failure-state tests.
- `src/workflows/generate-event-visual.ts` — thin `"use workflow"` orchestrator and full-Node `"use step"` generation step.
- `src/components/public-v2/EventVisual.tsx` — optimized artwork/fallback renderer with focal-point support.
- `src/components/public-v2/PublicHomeV2.tsx` — featured-event poster, match ticker, and event-drop rail.
- `src/components/public-v2/PublicEventsV2.tsx` — filterable poster-slice event listing.
- `src/components/public-v2/PublicEventDetailV2.tsx` — event poster header and existing detail sections.
- `src/components/public-v2/public-v2.test.tsx` — semantic/source inspection tests for the three server components.
- `src/components/admin/EventVisualAssetsPanel.tsx` — organizer revisions, generation state, approval, rejection, upload, and rollback controls.
- `tests/e2e-smoke/public-visual-v2.smoke.spec.ts` — database-free public fallback, accessibility, and feature-flag smoke tests.
- `tests/e2e/admin-event-visual-assets.spec.ts` — authenticated upload/generate/approve/rollback flow against the E2E database.
- `prisma/migrations/20260822000000_event_visual_assets/migration.sql` — table, relations, indexes, and legacy background backfill.

### Existing modules to modify

- `prisma/schema.prisma` — `EventVisualAsset`, creator relation, and `Event.activeVisualAssetId`.
- `src/lib/platform/types.ts` — public `EventVisualAsset` and active asset fields on `Event`.
- `src/lib/platform/repository.ts` — relation mapping, revision lifecycle, rate limit, and atomic activation.
- `src/lib/platform/repository.test.ts` — lifecycle and authorization tests.
- `src/lib/platform/visuals.ts` and `.test.ts` — source precedence and deterministic poster model.
- `src/lib/actions.ts` and `.test.ts` — upload, generate, approve, reject, and activate actions.
- `src/lib/feature-flags.ts` — both new flags.
- `src/app/[locale]/layout.tsx`, `src/app/globals.css`, `src/components/shell.tsx` — font variables and street-sport shell.
- `src/app/home-page-content.tsx`, `src/app/events/page.tsx`, `src/app/events/[slug]/event-detail-page.tsx` — flag-gated V2 composition.
- `src/app/admin/page.tsx` — mount the visual asset panel and load revisions.
- `messages/id.json` and `messages/en.json` — public and organizer visual copy.
- `next.config.ts` — Workflow wrapper and Vercel Blob image host.
- `.env.example` — OpenAI model/key and feature flags.
- `package.json` and `pnpm-lock.yaml` — `workflow`, `openai`, `sharp`, and Fontsource dependencies.

---

### Task 1: Persist visual revisions and active artwork

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822000000_event_visual_assets/migration.sql`
- Modify: `src/lib/platform/types.ts`
- Test: `src/lib/platform/repository.test.ts`

**Interfaces:**
- Produces: `EventVisualAsset`, `VisualAssetSource`, `VisualAssetStatus`, `Event.activeVisualAssetId`, and `Event.activeVisualAsset`.
- Produces database uniqueness for one active event per asset and indexes on `(eventId, createdAt)` and `(eventId, source, createdAt)`.

- [ ] **Step 1: Add a failing repository mapping test**

Add an `activeVisualAsset` object to the mocked Prisma event and assert the mapped `Event` preserves its URL, status, focal point, and source:

```ts
expect(result[0]).toMatchObject({
  activeVisualAssetId: "asset-1",
  activeVisualAsset: {
    id: "asset-1",
    eventId: "event-1",
    source: "organizer_upload",
    status: "approved",
    url: "https://assets.example/event.webp",
    focalX: 0.5,
    focalY: 0.4,
  },
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run src/lib/platform/repository.test.ts`

Expected: FAIL because `activeVisualAsset` is absent from `Event` and `mapEvent`.

- [ ] **Step 3: Add Prisma relations and TypeScript types**

Use String columns to match the repository's existing event-status convention:

```prisma
model EventVisualAsset {
  id               String   @id @default(cuid())
  eventId          String
  event            Event    @relation("EventVisualAssets", fields: [eventId], references: [id], onDelete: Cascade)
  createdByUserId  String?
  createdByUser    User?    @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  source           String
  status           String
  url              String?
  mimeType         String?
  width            Int?
  height           Int?
  focalX           Float    @default(0.5)
  focalY           Float    @default(0.5)
  provider         String?
  model            String?
  promptVersion    String?
  workflowRunId    String?
  sourceUrl        String?
  rightsAttestedAt DateTime?
  errorCode        String?
  approvedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  activeForEvent   Event?   @relation("ActiveEventVisualAsset")

  @@index([eventId, createdAt])
  @@index([eventId, source, createdAt])
}
```

Add `createdVisualAssets EventVisualAsset[]` to `User`; add these exact fields to `Event`:

```prisma
visualAssets        EventVisualAsset[] @relation("EventVisualAssets")
activeVisualAssetId String?            @unique
activeVisualAsset   EventVisualAsset?  @relation("ActiveEventVisualAsset", fields: [activeVisualAssetId], references: [id], onDelete: SetNull)
```

Define TypeScript unions exactly as:

```ts
export type VisualAssetSource = "organizer_upload" | "ai_generated";
export type VisualAssetStatus = "generating" | "ready_for_review" | "approved" | "rejected" | "failed";
```

- [ ] **Step 4: Write the SQL migration and backfill**

Create the table/foreign keys generated by Prisma, then backfill every non-null `Event.gameImageUrl`. The data portion must use this concrete shape after the table, indexes, and foreign keys exist:

```sql
INSERT INTO "EventVisualAsset" (
  "id", "eventId", "source", "status", "url", "focalX", "focalY",
  "approvedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5(e."id" || ':' || e."gameImageUrl"),
  e."id",
  'organizer_upload',
  'approved',
  e."gameImageUrl",
  0.5,
  0.5,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Event" e
WHERE e."gameImageUrl" IS NOT NULL
  AND e."activeVisualAssetId" IS NULL;

UPDATE "Event" e
SET "activeVisualAssetId" = 'legacy_' || md5(e."id" || ':' || e."gameImageUrl")
WHERE e."gameImageUrl" IS NOT NULL
  AND e."activeVisualAssetId" IS NULL;
```

Set dimensions, MIME, provenance, and rights attestation to null for migrated records; do not invent an organizer attestation for legacy data.

- [ ] **Step 5: Validate schema and migration shape**

Run: `pnpm prisma validate`

Run: `pnpm prisma generate`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the persistence foundation**

```bash
git add prisma/schema.prisma prisma/migrations/20260822000000_event_visual_assets/migration.sql src/lib/platform/types.ts src/lib/platform/repository.test.ts
git commit -m "feat: add event visual asset revisions"
```

---

### Task 2: Implement resolver precedence and atomic revision lifecycle

**Files:**
- Create: `src/lib/platform/event-visual-assets.ts`
- Create: `src/lib/platform/event-visual-assets.test.ts`
- Modify: `src/lib/platform/visuals.ts`
- Modify: `src/lib/platform/visuals.test.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/lib/platform/repository.test.ts`
- Modify: `src/lib/platform/demo-store.ts`

**Interfaces:**
- Produces: `resolveEventVisual(event): ResolvedEventVisual`.
- Produces: `listEventVisualAssets(user, eventId)`, `createEventVisualAsset(user, input)`, `approveEventVisualAsset(user, eventId, assetId)`, `rejectEventVisualAsset(user, eventId, assetId)`, `setEventVisualFocalPoint(user, eventId, assetId, focalPoint)`, and `countAiVisualAttempts(eventId, since)`.
- Consumes: Task 1 database and domain types.

- [ ] **Step 1: Write failing resolver tests**

Cover these exact cases:

```ts
expect(resolveEventVisual(approvedActive)).toMatchObject({ source: "organizer_upload", url: "https://assets.example/upload.webp" });
expect(resolveEventVisual({ ...baseEvent, activeVisualAsset: undefined, gameImageUrl: "/legacy.webp" })).toMatchObject({ source: "organizer_upload", url: "/legacy.webp" });
expect(resolveEventVisual({ ...baseEvent, activeVisualAsset: undefined, gameImageUrl: undefined })).toMatchObject({ source: "typographic", url: undefined });
expect(resolveEventVisual({ ...baseEvent, activeVisualAsset: { ...asset, status: "ready_for_review" } })).toMatchObject({ source: "typographic" });
```

- [ ] **Step 2: Write failing lifecycle tests**

Mock `$transaction` and assert approval first finds `{ id: assetId, eventId, status: { in: ["ready_for_review", "approved"] } }`, marks the revision approved, then updates only that event's active pointer. Assert an organizer cannot list or mutate another organizer's assets, an active asset cannot be rejected, and an older approved revision can be activated for rollback.

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run src/lib/platform/event-visual-assets.test.ts src/lib/platform/visuals.test.ts src/lib/platform/repository.test.ts`

Expected: FAIL on missing resolver and lifecycle functions.

- [ ] **Step 4: Implement the pure resolver**

```ts
export type ResolvedEventVisual = {
  source: "organizer_upload" | "ai_generated" | "typographic";
  url?: string;
  accentColor: string;
  focalPoint: { x: number; y: number };
};

export function resolveEventVisual(event: Pick<Event, "gameId" | "gameImageUrl" | "accentColor" | "activeVisualAsset">): ResolvedEventVisual {
  const active = event.activeVisualAsset;
  if (active?.status === "approved" && active.url) {
    return {
      source: active.source,
      url: active.url,
      accentColor: event.accentColor ?? "#caff38",
      focalPoint: { x: active.focalX, y: active.focalY },
    };
  }
  if (event.gameImageUrl) {
    return { source: "organizer_upload", url: event.gameImageUrl, accentColor: event.accentColor ?? "#caff38", focalPoint: { x: 0.5, y: 0.5 } };
  }
  return { source: "typographic", accentColor: event.accentColor ?? "#caff38", focalPoint: { x: 0.5, y: 0.5 } };
}
```

- [ ] **Step 5: Include active relations in event queries**

Introduce one reusable include constant and use it in `getEvents`, `getManageableEventsForUser`, `getPublicEvents`, `getPublishedEvents`, `getEventBySlug`, and `getPublicEventBySlug`:

```ts
const eventPublicInclude = { stream: true, activeVisualAsset: true } satisfies Prisma.EventInclude;
```

Extend `mapEvent` once; do not duplicate relation mapping across queries. Demo events remain valid without an active revision and resolve through legacy or typographic fallback.

- [ ] **Step 6: Implement lifecycle functions with authorization at the repository boundary**

Call `assertUserCanManageEvent` before every read/mutation. Use `prisma.$transaction` for approval/rollback so the asset status and `Event.activeVisualAssetId` cannot diverge. Keep previously approved revisions approved for rollback.

- [ ] **Step 7: Run focused and full unit tests**

Run: `pnpm vitest run src/lib/platform/event-visual-assets.test.ts src/lib/platform/visuals.test.ts src/lib/platform/repository.test.ts`

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 8: Commit the resolver and lifecycle**

```bash
git add src/lib/platform/event-visual-assets.ts src/lib/platform/event-visual-assets.test.ts src/lib/platform/visuals.ts src/lib/platform/visuals.test.ts src/lib/platform/repository.ts src/lib/platform/repository.test.ts src/lib/platform/demo-store.ts
git commit -m "feat: resolve and manage event visual revisions"
```

---

### Task 3: Add flags, fonts, optimized image delivery, and shell tokens

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `next.config.ts`
- Modify: `.env.example`
- Modify: `src/lib/feature-flags.ts`
- Create: `src/lib/feature-flags.test.ts`
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/shell.tsx`
- Create: `src/components/public-v2/EventVisual.tsx`
- Test: `src/app/events/page.test.ts`

**Interfaces:**
- Produces: `isFeatureEnabled("public_visual_v2")` and `isFeatureEnabled("ai_event_art")`.
- Produces: `EventVisual({ event, alt, priority, sizes, className })` using `next/image`.
- Consumes: `resolveEventVisual` from Task 2.

- [ ] **Step 1: Write failing flag and source-inspection tests**

Assert both new flags default to false, accept only the string `"true"`, and that `EventVisual.tsx` imports `next/image`, sets `sizes`, and never uses a CSS `backgroundImage` for event artwork.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/lib/feature-flags.test.ts src/app/events/page.test.ts`

Expected: FAIL because flags and `EventVisual` are absent.

- [ ] **Step 3: Install font packages**

Run: `pnpm add @fontsource/teko @fontsource/chakra-petch`

Use only these files through `next/font/local`: Teko Latin 600/700 and Chakra Petch Latin 500/600/700. Assign CSS variables `--font-display` and `--font-ui` on `<body>`; do not import every Fontsource stylesheet.

- [ ] **Step 4: Add flags and environment documentation**

Add both union members/defaults to `feature-flags.ts`. Add these exact entries to `.env.example`:

```dotenv
FEATURE_FLAG_PUBLIC_VISUAL_V2=false
FEATURE_FLAG_AI_EVENT_ART=false
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
```

- [ ] **Step 5: Configure remote artwork optimization**

Add `{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }` to `images.remotePatterns`. Keep the existing Google avatar pattern.

- [ ] **Step 6: Build `EventVisual` with deterministic fallback**

For URL artwork use `<Image fill priority={priority} sizes={sizes}>`, set `objectPosition` from normalized focal coordinates, and expose `data-event-art-source`. For typographic fallback render event initials, game label, diagonal court lines, one halftone pseudo-element, and event name as a visually hidden semantic fallback only when the caller does not already render the heading.

- [ ] **Step 7: Add global street-sport tokens without redesigning admin content**

Define `.public-visual-v2` CSS variables and utilities for canvas, ink, lime, muted text, display font, clipped buttons, poster rule, grain, and reduced motion. `AppShell` changes only its header/footer chrome when the flag is enabled; admin/captain page content retains its current components and spacing.

- [ ] **Step 8: Verify fonts and build**

Run: `pnpm lint`

Run: `pnpm build`

Expected: no type errors, local font assets are emitted, and Blob URLs are accepted by Next Image.

- [ ] **Step 9: Commit the visual foundation**

```bash
git add package.json pnpm-lock.yaml next.config.ts .env.example src/lib/feature-flags.ts src/lib/feature-flags.test.ts 'src/app/[locale]/layout.tsx' src/app/globals.css src/components/shell.tsx src/components/public-v2/EventVisual.tsx src/app/events/page.test.ts
git commit -m "feat: add public visual system foundation"
```

---

### Task 4: Build the pitch-ready homepage poster

**Files:**
- Create: `src/components/public-v2/PublicHomeV2.tsx`
- Create: `src/components/public-v2/public-v2.test.tsx`
- Modify: `src/app/home-page-content.tsx`
- Modify: `messages/id.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: the existing event/game/team/bracket data already loaded by `HomePageContent` and `EventVisual` from Task 3.
- Produces: `PublicHomeV2({ events, games, featuredEvent, featuredGame, featuredTeams, featuredBracket, gameFilter })`.

- [ ] **Step 1: Write failing semantic composition tests**

Assert the V2 component contains one `<h1>` for the featured event, a primary link to `/events/${featuredEvent.slug}`, match rows derived from `featuredBracket.slice(0, 3)`, an event rail, and exactly one `priority` EventVisual call. Assert event names are text nodes and never embedded into image alt-only content.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm vitest run src/components/public-v2/public-v2.test.tsx src/app/events/page.test.ts`

Expected: FAIL because `PublicHomeV2` is absent.

- [ ] **Step 3: Implement the featured poster**

Use this hierarchy in DOM order: issue/status line, event `<h1>`, game/mode/date/team count, primary Explore Event CTA, secondary All Events CTA, one full-bleed `EventVisual`, then the live/next match ticker. Limit the expressive typography to the event wordmark and issue numeral; body copy remains Chakra Petch with normal tracking.

- [ ] **Step 4: Implement the event-drop rail**

Render remaining events as horizontal poster slices with one muted game accent, a small status label, event name, team count/format, and lazy artwork. On mobile use horizontal overflow with snap points; on desktop use a three-column rail. Avoid rounded SaaS-card silhouettes: use square/cut corners and 1px poster rules.

- [ ] **Step 5: Gate the new homepage**

After existing data loading, return `PublicHomeV2` only when `isFeatureEnabled("public_visual_v2")`; preserve the complete current JSX as the false branch. The featured event remains `filteredEvents[0]`, preserving current business behavior.

- [ ] **Step 6: Add localized copy**

Add keys for `eventDrop`, `ongoing`, `upNext`, `exploreEvent`, `allEvents`, `teams`, and empty ticker text in both languages. Do not remove existing keys because the false flag branch still needs them.

- [ ] **Step 7: Verify unit tests and database-free rendering**

Run: `pnpm vitest run src/components/public-v2/public-v2.test.tsx src/app/events/page.test.ts`

Run in PowerShell: `$env:FEATURE_FLAG_PUBLIC_VISUAL_V2='true'; pnpm test:e2e:smoke`

Expected: homepage can use demo-store fallback and existing login/admin smoke tests remain green.

- [ ] **Step 8: Commit the homepage milestone**

```bash
git add src/components/public-v2/PublicHomeV2.tsx src/components/public-v2/public-v2.test.tsx src/app/home-page-content.tsx messages/id.json messages/en.json
git commit -m "feat: redesign public homepage as event poster"
```

---

### Task 5: Redesign event listing and event detail behind the flag

**Files:**
- Create: `src/components/public-v2/PublicEventsV2.tsx`
- Create: `src/components/public-v2/PublicEventDetailV2.tsx`
- Modify: `src/components/public-v2/public-v2.test.tsx`
- Modify: `src/app/events/page.tsx`
- Modify: `src/app/events/[slug]/event-detail-page.tsx`
- Modify: `messages/id.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: `PublicEventsV2({ events, games, teamsByEvent, filters, href })`.
- Produces: `PublicEventDetailV2({ event, game, mode, teams, bracket, leaderboard, liveView, certificate, locale })`.
- Preserves: filter query parameters, localized/non-localized links, structured data, registration CTA rules, stream, certificate, quick links, and leaderboard ordering.

- [ ] **Step 1: Add failing listing/detail tests**

Assert poster slices use `EventVisual` rather than `style={{ backgroundImage }}`, filters remain links with `game` and `status`, detail has one semantic `<h1>`, the registration CTA still requires `event.registrationUrl`, and all four quick-link paths remain present.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm vitest run src/components/public-v2/public-v2.test.tsx src/app/events/page.test.ts`

Expected: FAIL on missing V2 components and optimized artwork.

- [ ] **Step 3: Build event poster slices**

Each listing row uses a fixed aspect-ratio art region, issue number, status, game/mode, event `<h2>`, organizer, team count, date, and prize/venue. Keep the existing server-side filter function and link builder; pass their results into the component.

- [ ] **Step 4: Build the event detail header**

Replace only the V2 header composition: full-width art, wordmark, organizer/status, facts, share action, and optional registration CTA. Render existing stream, certificate, stat summary, and quick-link sections below the header with calmer dark panels. Keep JSON-LD generation outside the visual component.

- [ ] **Step 5: Gate both pages without changing route contracts**

Use the flag after data loading. The false branch must remain byte-for-byte behaviorally equivalent: same fallback event, cache calls, filters, links, and conditional CTA.

- [ ] **Step 6: Run regression tests and build**

Run: `pnpm test`

Run: `pnpm lint`

Run: `pnpm build`

Expected: all pass with both feature flags false.

- [ ] **Step 7: Commit Milestone A**

```bash
git add src/components/public-v2/PublicEventsV2.tsx src/components/public-v2/PublicEventDetailV2.tsx src/components/public-v2/public-v2.test.tsx src/app/events/page.tsx 'src/app/events/[slug]/event-detail-page.tsx' messages/id.json messages/en.json
git commit -m "feat: add game-skinned public event pages"
```

---

### Task 6: Convert organizer background uploads into approved revisions

**Files:**
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/actions.test.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/lib/platform/repository.test.ts`
- Create: `src/components/admin/EventVisualAssetsPanel.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Produces server actions: `adminUploadEventVisualAction`, `adminApproveEventVisualAction`, `adminRejectEventVisualAction`, `adminActivateEventVisualAction`, and `adminSetEventVisualFocalPointAction`.
- Consumes repository lifecycle functions from Task 2.

- [ ] **Step 1: Write failing action tests**

Cover missing session, cross-event ownership, missing `rightsAttestation=confirmed`, spoofed MIME bytes, file over 5 MiB, successful upload metadata, AI approval, rejection of the active revision, rollback to an older approved revision, and focal values outside `0..1`.

The successful upload assertion must include:

```ts
expect(createEventVisualAsset).toHaveBeenCalledWith(
  expect.objectContaining({ role: "organizer" }),
  expect.objectContaining({
    eventId: "event-safe",
    source: "organizer_upload",
    status: "approved",
    rightsAttestedAt: expect.any(Date),
  }),
);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm vitest run src/lib/actions.test.ts src/lib/platform/repository.test.ts`

Expected: FAIL on missing revision actions.

- [ ] **Step 3: Refactor image validation into a reusable helper**

Keep entity ID, size, extension, MIME, and magic-byte checks from `uploadImageAsset`. Return `{ url, mimeType, width, height }`; use `sharp(buffer).metadata()` to reject undecodable images and capture dimensions. The organizer upload remains the original transformation source in Blob.

- [ ] **Step 4: Implement upload and lifecycle actions**

Every action must call `requireAdminSession`, then the repository authorization boundary. Upload creates an approved `organizer_upload`, records `rightsAttestedAt`, activates it transactionally, dual-writes `gameImageUrl` only during the migration window, invalidates tag `events`, and revalidates the root layout.

- [ ] **Step 5: Build the organizer revisions panel**

Show the active revision first, then newest revisions. Every item displays source, status, dimensions, created date, approval date, safe error label, focal preview, and actions allowed for that state. Upload form includes this required checkbox copy: “Saya memiliki izin untuk mempublikasikan artwork ini.”

- [ ] **Step 6: Replace only the background form in `BrandAssetsSection`**

Keep event-logo and team-logo forms intact. Pass `visualAssetsByEvent` loaded with `listEventVisualAssets` into `EventVisualAssetsPanel`; do not turn the entire admin page into a client component.

- [ ] **Step 7: Verify upload/lifecycle tests**

Run: `pnpm vitest run src/lib/actions.test.ts src/lib/platform/repository.test.ts`

Run: `pnpm test`

Expected: all pass.

- [ ] **Step 8: Commit organizer revision management**

```bash
git add src/lib/actions.ts src/lib/actions.test.ts src/lib/platform/repository.ts src/lib/platform/repository.test.ts src/components/admin/EventVisualAssetsPanel.tsx src/app/admin/page.tsx
git commit -m "feat: add organizer visual revision approval"
```

---

### Task 7: Add authenticated browser coverage for upload, approval, and rollback

**Files:**
- Create: `tests/e2e/admin-event-visual-assets.spec.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: Task 6 organizer panel/actions.
- Produces: repeatable E2E fixture assets and rollback proof.

- [ ] **Step 1: Add a tiny valid WebP fixture to the test itself**

Decode a fixed base64 16×16 WebP buffer in the spec, avoiding a new binary fixture. Use the seeded Kuroko event and remove visual revisions created by this test in `beforeEach`, preserving its migration-created legacy asset.

- [ ] **Step 2: Write the upload/rollback flow**

The test must upload without the checkbox and observe an error; upload with attestation and observe `approved`; change focal point to `0.25,0.4`; upload a second revision; activate the first revision; then query Prisma and assert `activeVisualAssetId` points to the first revision while both revisions remain approved.

- [ ] **Step 3: Run the isolated E2E test**

Run: `pnpm test:e2e:preflight`

Run: `pnpm playwright test tests/e2e/admin-event-visual-assets.spec.ts`

Expected: PASS and no calls to OpenAI.

- [ ] **Step 4: Commit Milestone B**

```bash
git add tests/e2e/admin-event-visual-assets.spec.ts prisma/seed.ts
git commit -m "test: cover organizer event visual revisions"
```

---

### Task 8: Implement the GPT Image 2 provider and safe prompt builder

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/lib/platform/openai-visual-generation.ts`
- Create: `src/lib/platform/openai-visual-generation.test.ts`
- Modify: `src/lib/platform/event-visual-assets.ts`
- Modify: `src/lib/platform/event-visual-assets.test.ts`

**Interfaces:**
- Produces: `buildEventArtworkPrompt(input): string`.
- Produces: `VisualGenerationProvider.generate(input): Promise<GeneratedVisual>`.
- Produces `classifyVisualGenerationError(error): "moderation_blocked" | "rate_limited" | "provider_unavailable" | "invalid_response"`.

- [ ] **Step 1: Write failing prompt/provider tests**

Prompt tests must assert only `eventName`, `gameName`, `gameGenre`, `format`, `palette`, and `promptVersion` can enter the prompt; contacts and participant data are not accepted by the input type. Assert the prompt contains “original character”, “no text”, “no logos”, “no trademarks”, “no named heroes”, and “negative space for an HTML wordmark”.

Mock `client.images.generate` and assert this exact request:

```ts
expect(generate).toHaveBeenCalledWith({
  model: "gpt-image-2",
  prompt: expect.any(String),
  size: "1536x1024",
  quality: "medium",
  output_format: "webp",
  output_compression: 82,
  moderation: "auto",
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/lib/platform/event-visual-assets.test.ts src/lib/platform/openai-visual-generation.test.ts`

Expected: FAIL because provider and prompt builder are absent.

- [ ] **Step 3: Install server dependencies**

Run: `pnpm add openai sharp workflow`

The OpenAI SDK reads `OPENAI_API_KEY`; model defaults to `OPENAI_IMAGE_MODEL || "gpt-image-2"`.

- [ ] **Step 4: Implement provider injection**

Constructor accepts an object exposing `images.generate`, allowing unit tests without network access. Decode `result.data[0].b64_json`; return WebP bytes plus width/height read through Sharp metadata. If bytes are absent or decoding fails, throw a typed `invalid_response` error.

- [ ] **Step 5: Map errors safely**

Branch first on OpenAI `error.code === "moderation_blocked"`; map HTTP 429 to `rate_limited`, 5xx/network errors to `provider_unavailable`, and everything else to `invalid_response`. Store/log the OpenAI request ID server-side, but never display provider internals or moderation categories publicly.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run src/lib/platform/event-visual-assets.test.ts src/lib/platform/openai-visual-generation.test.ts`

```bash
git add package.json pnpm-lock.yaml src/lib/platform/openai-visual-generation.ts src/lib/platform/openai-visual-generation.test.ts src/lib/platform/event-visual-assets.ts src/lib/platform/event-visual-assets.test.ts
git commit -m "feat: add GPT Image event artwork provider"
```

---

### Task 9: Run generation through Vercel Workflow with idempotent steps

**Files:**
- Modify: `next.config.ts`
- Create: `src/lib/platform/generate-event-visual.ts`
- Create: `src/lib/platform/generate-event-visual.test.ts`
- Create: `src/workflows/generate-event-visual.ts`
- Modify: `src/lib/platform/repository.ts`
- Modify: `src/lib/platform/repository.test.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/lib/actions.test.ts`

**Interfaces:**
- Produces: `generateEventVisualWorkflow(input: { eventId: string; assetId: string; promptVersion: string }): Promise<{ assetId: string; status: string }>`.
- Produces: `adminGenerateEventVisualAction(formData)`.
- Consumes: Task 8 provider and Task 2 lifecycle persistence.

- [ ] **Step 1: Write failing service tests**

Test success, provider moderation failure, transient provider error, invalid decoded image, Blob upload failure, DB failure, duplicate step delivery, and a revision that is no longer `generating`. Duplicate delivery must return the existing terminal state without a second provider or Blob call.

- [ ] **Step 2: Write failing action/rate-limit tests**

Assert generation is blocked when `ai_event_art` is false, blocked for an unauthorized organizer, allowed for attempts 1-3, blocked on attempt 4, and allowed for platform admin override. Assert the action creates the `generating` revision before calling `start()` and stores the returned `runId`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm vitest run src/lib/platform/generate-event-visual.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts`

Expected: FAIL on missing generation service/workflow/action.

- [ ] **Step 4: Wrap Next config with Workflow**

```ts
import { withWorkflow } from "workflow/next";

export default withWorkflow(withNextIntl(nextConfig));
```

Keep the existing next-intl configuration, CSP, server action limit, and remote image patterns.

- [ ] **Step 5: Implement the dependency-injected generation service**

The service loads the revision; returns immediately unless status is `generating`; loads only allowlisted event/game fields; calls the provider once; validates WebP metadata and 1536×1024 dimensions; uploads to `event-visuals/${eventId}/${assetId}.webp`; then marks `ready_for_review`. On permanent errors mark `failed` with the safe code. Transient errors must be thrown so Workflow retries the step.

- [ ] **Step 6: Implement a thin durable orchestrator**

```ts
type GenerateWorkflowInput = {
  eventId: string;
  assetId: string;
  promptVersion: string;
};

export async function generateEventVisualWorkflow(input: GenerateWorkflowInput) {
  "use workflow";
  return runGenerationStep(input);
}

async function runGenerationStep(input: GenerateWorkflowInput) {
  "use step";
  return generateEventVisualWithProductionDependencies(input);
}
```

Do not import Prisma, OpenAI, Sharp, or Blob into the `"use workflow"` function body; those run in the full-Node step.

- [ ] **Step 7: Implement the generation action**

Build `promptVersion` as `event-poster-v1-r${attemptNumber}` so `eventId + promptVersion` identifies one attempt. Create the revision, call `start(generateEventVisualWorkflow, [{ eventId, assetId, promptVersion }])`, store `workflowRunId`, invalidate the admin page, and redirect with a non-blocking pending message.

- [ ] **Step 8: Verify workflow health locally**

Run: `pnpm lint`

Start dev server, then run: `pnpm exec workflow health`

Expected: Workflow endpoints are reachable. Do not make a live OpenAI call in automated tests.

- [ ] **Step 9: Run focused/full tests and commit**

Run: `pnpm vitest run src/lib/platform/generate-event-visual.test.ts src/lib/platform/repository.test.ts src/lib/actions.test.ts`

Run: `pnpm test`

```bash
git add next.config.ts src/lib/platform/generate-event-visual.ts src/lib/platform/generate-event-visual.test.ts src/workflows/generate-event-visual.ts src/lib/platform/repository.ts src/lib/platform/repository.test.ts src/lib/actions.ts src/lib/actions.test.ts
git commit -m "feat: generate event art with durable workflow"
```

---

### Task 10: Add AI preview, approval, rejection, and regeneration UI

**Files:**
- Modify: `src/components/admin/EventVisualAssetsPanel.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `messages/id.json`
- Modify: `messages/en.json`
- Modify: `tests/e2e/admin-event-visual-assets.spec.ts`

**Interfaces:**
- Consumes: generation and lifecycle actions from Tasks 6 and 9.
- Produces organizer-visible states: generating, ready for review, approved, rejected, and failed.

- [ ] **Step 1: Add failing source/E2E tests**

Assert the Generate button is absent when the AI flag is false; disabled with “3/3 attempts used” at the organizer limit; available to platform admin; and that `ready_for_review` exposes Approve, Reject, and Regenerate but is not public before approval.

- [ ] **Step 2: Implement generation controls**

Show attempts remaining and explain: “AI membuat karakter original yang terinspirasi genre game, bukan hero resmi.” Generation submits immediately and returns to the admin page while public pages keep the active artwork/fallback.

- [ ] **Step 3: Implement revision-state presentation**

Use polling-free server rendering for the pitch release: a “Refresh status” link reloads the admin page. Show safe localized messages for `moderation_blocked`, `rate_limited`, `provider_unavailable`, and `invalid_response`. Never show raw prompts, API keys, stack traces, or provider bodies.

- [ ] **Step 4: Extend E2E without a live provider**

Seed a `ready_for_review` AI revision directly with Prisma, verify it is not active, approve it through the UI, verify it becomes active, reject a second non-active revision, and activate the previous organizer upload to prove rollback. Keep live generation excluded from E2E.

- [ ] **Step 5: Run admin tests and build**

Run: `pnpm test:e2e:preflight`

Run: `pnpm playwright test tests/e2e/admin-event-visual-assets.spec.ts`

Run: `pnpm build`

Expected: all pass with no OpenAI request.

- [ ] **Step 6: Commit Milestone C**

```bash
git add src/components/admin/EventVisualAssetsPanel.tsx src/app/admin/page.tsx messages/id.json messages/en.json tests/e2e/admin-event-visual-assets.spec.ts
git commit -m "feat: add AI event art review controls"
```

---

### Task 11: Enforce performance, accessibility, and reversible rollout

**Files:**
- Create: `tests/e2e-smoke/public-visual-v2.smoke.spec.ts`
- Modify: `src/components/public-v2/EventVisual.tsx`
- Modify: `src/components/public-v2/PublicHomeV2.tsx`
- Modify: `src/components/public-v2/PublicEventsV2.tsx`
- Modify: `src/components/public-v2/PublicEventDetailV2.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/events/page.test.ts`
- Modify: `docs/superpowers/specs/2026-08-22-public-visual-system-and-ai-event-art-design.md` only if implementation revealed a factual interface change

**Interfaces:**
- Produces release evidence for one eager hero, image byte budgets, stable geometry, keyboard focus, reduced motion, image failure fallback, and flag rollback.

- [ ] **Step 1: Write failing browser assertions**

With `FEATURE_FLAG_PUBLIC_VISUAL_V2=true`, assert homepage has one visible `<h1>`, one `img[fetchpriority="high"]`, no second eager event image, working Explore Event navigation, keyboard-visible CTA focus, and no horizontal page overflow at 390×844 and 1440×900.

- [ ] **Step 2: Add network byte assertions**

Collect successful image responses whose URL contains `/_next/image`; use `response.body().length`. Assert the eager hero is at most 300 KiB desktop/200 KiB mobile and each event-rail image is at most 120 KiB. Fail with the URL and measured bytes so regressions are actionable.

- [ ] **Step 3: Add failure and reduced-motion assertions**

Abort the active artwork request and assert event heading, metadata, and CTA remain visible on the typographic poster. Emulate `reducedMotion: "reduce"` and assert animated status/glitch elements have zero animation duration.

- [ ] **Step 4: Fix only measured violations**

Tune `sizes`, requested render widths, image quality, focal cropping, CSS overflow, contrast, focus-visible rings, and motion media queries until the assertions pass. Keep exactly one expressive gesture per composition.

- [ ] **Step 5: Verify rollback paths**

Run smoke once with both flags false and once with only `public_visual_v2` true. Confirm `ai_event_art=false` still displays approved AI artwork but hides new generation controls; confirm `public_visual_v2=false` returns the legacy three-page rendering without deleting revisions.

- [ ] **Step 6: Run the complete release gate**

Run: `pnpm prisma validate`

Run: `pnpm lint`

Run: `pnpm test`

Run: `pnpm test:e2e:smoke`

Run: `pnpm test:e2e`

Run: `pnpm build`

Expected: every command exits 0. Record measured desktop/mobile hero bytes and largest event tile in the commit body.

- [ ] **Step 7: Review the final diff for scope and secrets**

Run: `git diff --check`

Run: `git diff --stat`

Run: `git grep -n -E "OPENAI_API_KEY=.+|sk-[A-Za-z0-9]" -- ':!plan.md' ':!.env.example'`

Expected: clean diff, no credential value, no participant/contact field in prompt code, and no public runtime fetch to OpenAI.

- [ ] **Step 8: Commit the release gate**

```bash
git add tests/e2e-smoke/public-visual-v2.smoke.spec.ts src/components/public-v2/EventVisual.tsx src/components/public-v2/PublicHomeV2.tsx src/components/public-v2/PublicEventsV2.tsx src/components/public-v2/PublicEventDetailV2.tsx src/app/globals.css src/app/events/page.test.ts
git commit -m "test: enforce public visual release budgets"
```

---

## Claude execution notes

- Execute tasks in order and stop at each commit for review.
- Do not clean, reset, or include unrelated changes from the current dirty worktree.
- Before Task 1, create an isolated worktree using the repository's preferred worktree workflow.
- Milestone A is the 1-2 week pitch target. If schedule compresses, finish Tasks 1-5 and ship with organizer upload/typographic fallback; do not weaken image budgets to squeeze in AI.
- Verify Workflow APIs against the installed `node_modules/workflow/docs/` after Task 8, because Workflow DevKit APIs are version-coupled.
- GPT Image 2 uses the Image API because this product creates one image from one prompt, not a conversational editing session. The current official model alias is `gpt-image-2`; the provider records the actual configured model on every revision.
- Never use generated art as public content until an authorized organizer explicitly approves that revision.
