# Public Visual System and AI Event Art Design

**Status:** Approved in brainstorming on 2026-08-22

## Goal and success criteria

Miracle's public experience must feel like a live community tournament brand rather than a generic SaaS landing page. The first release is optimized for a player/community pitch: visitors should feel the event's energy, recognize the featured game, and enter a real event flow within seconds.

Success means:

- The homepage, event listing, and event detail share one recognizable visual language.
- Event artwork can change with the featured game without losing Miracle's identity.
- Event names read as distinctive wordmarks while remaining easy to scan.
- The organizer controls which approved artwork revision is active, whether it is uploaded or AI-generated.
- AI fallback artwork is original, reviewed before publication, generated once, and never created during a public page request.
- The redesigned first viewport meets explicit image-delivery and accessibility budgets.

## Selected visual direction

Use a **game-skinned street-sport** system:

- A near-black public canvas (`#080c0e`) with warm off-white text (`#f3f0e8`).
- One dominant Miracle accent (`#caff38`) per screen. Status colors and a game-specific secondary accent may appear only in small functional areas.
- Self-hosted Teko 600/700 for event wordmarks and large numerals; self-hosted Chakra Petch 500/600/700 for navigation, metadata, buttons, and body copy.
- Condensed athletic wordmarks, issue numbers, match tickers, clipped CTA geometry, controlled asymmetry, and low-opacity print texture.
- Texture comes from lightweight CSS/SVG halftone, grain, scan lines, and poster framing. It must not depend on full-resolution texture bitmaps.
- Each composition gets one expressive gesture. Glitch, multiple outlines, competing neon colors, heavy rotation, and texture must not all be active at once.

Typography remains real DOM text. Artwork never contains the only copy of an event name or action label.

### Page behavior

- **Homepage:** behaves like the poster for the featured event. It contains one prioritized hero artwork, event wordmark, metadata, primary event CTA, live/next match ticker, and a textured event-drop rail.
- **Event listing:** presents events as poster slices using the same artwork, wordmark, status, and numbering system. Filters remain straightforward and readable.
- **Event detail:** gives one event a full game skin while preserving direct paths to bracket, participants, leaderboard, and standings.
- **Bracket, participants, leaderboard, and standings:** retain calm data-first layouts. They inherit the public shell, display type, palette, and event header but do not receive dense poster compositions.
- **Organizer and captain surfaces:** stay outside this visual redesign in phase one.

## Event artwork system

### Source precedence

Public artwork resolves in this order:

1. The organizer-selected asset referenced by `activeVisualAssetId`, provided it is approved.
2. The legacy `gameImageUrl` during migration when no active asset pointer exists.
3. A deterministic typographic poster generated from the game's configured palette, event initials, event name, and format.

Miracle must never scrape, hotlink, or select random internet images as a runtime fallback.

One landscape master artwork is reused for the homepage hero, event tiles, and detail header through responsive sizing and art-directed cropping. Miracle framing, texture, wordmarks, and match data remain HTML/CSS/SVG overlays.

### Data model

Add an `EventVisualAsset` record with:

- `id`, `eventId`, and nullable `createdByUserId`
- `source`: `organizer_upload` or `ai_generated`
- `status`: `generating`, `ready_for_review`, `approved`, `rejected`, or `failed`
- `url`, `mimeType`, `width`, and `height` when generation/upload succeeds
- normalized focal point coordinates `focalX` and `focalY`, defaulting to `0.5`
- nullable `provider`, `model`, `promptVersion`, and safe `errorCode`
- nullable `sourceUrl` for provenance and `rightsAttestedAt` for organizer-uploaded artwork
- `approvedAt`, `createdAt`, and `updatedAt`

Add nullable `Event.activeVisualAssetId`. Public routes only render the referenced active asset. Approving another revision atomically changes this pointer; older revisions remain available for rollback.

Backfill every existing `Event.gameImageUrl` as an approved `organizer_upload` asset and set it active. Keep `gameImageUrl` readable during the migration window, then route all new code through the visual resolver.

### Public interfaces

Expose a server-only visual resolver:

```ts
type ResolvedEventVisual = {
  source: "organizer_upload" | "ai_generated" | "typographic";
  url?: string;
  accentColor: string;
  focalPoint: { x: number; y: number };
};

resolveEventVisual(event): ResolvedEventVisual
```

Expose a provider boundary:

```ts
type GenerateEventArtworkInput = {
  eventId: string;
  eventName: string;
  gameName: string;
  gameGenre: string;
  format: string;
  palette: string[];
  promptVersion: string;
};

interface VisualGenerationProvider {
  generate(input: GenerateEventArtworkInput): Promise<{
    bytes: Uint8Array;
    mimeType: "image/png" | "image/webp";
    width: number;
    height: number;
    model: string;
  }>;
}
```

GPT Image 2 is the first provider. The initial output is one landscape image, targeting 1536×1024 at medium quality. Prompt templates request an original game-genre character and environment, reserve negative space for Miracle's wordmark, and prohibit named heroes, logos, trademarks, UI text, or close character likenesses.

### Generation and approval flow

1. Creating an event commits the event immediately and starts a durable workflow keyed by `eventId + promptVersion`.
2. The workflow creates or resumes one `generating` revision, composes a prompt from allowlisted non-sensitive event/game fields, calls GPT Image 2, validates the decoded image, uploads it to Vercel Blob, and marks it `ready_for_review`.
3. The organizer sees the preview and can approve, reject, regenerate, or upload replacement artwork.
4. Approval atomically sets `activeVisualAssetId`, marks the revision approved, invalidates public event caches, and leaves older revisions intact.
5. Regeneration creates a new revision; it never overwrites the active asset.
6. Organizer upload uses the existing MIME/signature/size validation, requires the organizer to attest that they have permission to publish the artwork, creates an `organizer_upload` revision, and can be approved immediately by the authorized organizer.

Use a durable Vercel Workflow rather than holding the create-event request open. Transient provider, Blob, or database errors retry at workflow step boundaries. Permanent failures store a safe error code and render the typographic fallback. The public page never waits for generation.

Organizer generation is limited to three attempts per event in a rolling 24-hour window. Platform admins may override the limit. Only an organizer authorized for the event or a platform admin can generate, approve, reject, or upload visual assets.

## Performance and delivery budgets

- Use `next/image` or `getImageProps` for dynamic artwork; do not render event artwork as an unoptimized raw `<img>` or full-resolution CSS `background-image`.
- Preload/fetch-prioritize exactly one homepage hero. Everything below the initial viewport remains lazy-loaded.
- Supply explicit aspect ratios, responsive `sizes`, Blob remote patterns, and mobile/desktop art-direction crops.
- Serve optimized WebP/AVIF variants through Vercel Image Optimization/CDN. Retain the original Blob only as the transformation source.
- Hero delivery budget: at most 300 KB desktop and 200 KB mobile.
- Event tile delivery budget: at most 120 KB per displayed tile.
- Self-host the two font families through `next/font/local`; include only the selected weights and no remote font request.
- Keep decorative grain/halftone assets below 10 KB total or generate them in CSS/SVG.
- Maintain a stable aspect ratio and placeholder for every artwork slot to prevent layout shift.

## Error, empty, and compatibility states

- **Generating/pending review:** public pages continue using the active asset or typographic fallback; admin shows a non-blocking pending state.
- **Provider moderation rejection:** mark the revision failed with a safe moderation code and offer a revised regeneration or organizer upload.
- **Provider, Blob, or database failure:** retry transient failures, then mark failed without exposing provider internals or secrets.
- **Image delivery failure:** keep the wordmark, event metadata, and CTA visible on the deterministic poster background.
- **No configured game:** use the generic Miracle palette, event initials, and format; do not call internet search.
- **Existing events:** backfilled artwork remains visually unchanged until a new asset is approved.

## Test and acceptance plan

### Unit and repository tests

- Resolver precedence for organizer upload, AI artwork, and typographic fallback.
- Asset revision creation, atomic approval, rollback, and existing `gameImageUrl` backfill.
- Authorization boundaries for organizer ownership and platform-admin override.
- Rights attestation is required for organizer uploads and provenance metadata is retained.
- Generation rate limit and prompt field allowlist.
- Idempotent workflow resume and duplicate-delivery handling.
- Provider success, moderation failure, transient retry, permanent failure, invalid image bytes, Blob failure, and database failure.

### Component and browser tests

- Homepage, event listing, and event detail at desktop and mobile breakpoints.
- Approved upload, approved AI, pending, failed, delivery-error, and no-asset states.
- Organizer preview, approve, reject, regenerate, upload override, and rollback flows.
- Wordmarks remain semantic headings; decorative artwork has appropriate alt behavior; focus-visible and reduced-motion behavior remain intact.
- Existing bracket, participants, leaderboard, and standings navigation remains functional.

### Performance acceptance

- Network assertions confirm exactly one prioritized full-width artwork in the homepage initial viewport.
- Requested image variants stay within the hero and tile byte budgets on desktop and mobile.
- No dynamic public event artwork bypasses the image optimization path.
- Layout-shift checks confirm stable artwork geometry before image decode.

## Rollout

Add disabled-by-default feature flags `public_visual_v2` and `ai_event_art` to the existing feature-flag system.

1. Deploy the schema, resolver, workflow, and approval UI with both flags off.
2. Generate and approve artwork for pitch/demo events.
3. Enable `public_visual_v2` in preview and run unit, E2E, accessibility, and network-budget gates.
4. Enable the public visual flag in production while keeping generation independently reversible.
5. Enable `ai_event_art` after provider credentials, budget alerts, retry behavior, and organizer permissions are verified.

Disabling AI generation must not disable approved artwork or the visual redesign. Disabling the public visual flag must return the three public pages to their previous rendering without deleting visual revisions.

## Assumptions and defaults

- Pitch timeline is one to two weeks.
- Phase one covers homepage, event listing, and event detail only.
- The primary audience is players and gaming communities; the primary action is exploring a real event.
- GPT Image 2 API billing is separate from ChatGPT and is accepted as an operational dependency.
- AI artwork always uses original characters; official game characters require an organizer upload or a future verified official asset pack.
- Organizer approval is mandatory before AI artwork becomes public.
- No participant, captain, contact, or other personal data is included in generation prompts.
