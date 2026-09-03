# TikTok LIVE Card Implementation Plan

**Goal:** Apply the HTML mockup approved on 2026-09-03 to the existing event streaming slot.

**Architecture:** Keep the current Label/URL form and stream persistence. Recognize full TikTok LIVE URLs locally, then render a dedicated translated card from `LiveStreamCard`. Keep YouTube embeds and other external links on their existing path.

**Tech Stack:** Next.js, React, Tailwind CSS 4, next-intl, Vitest.

## Constraints

- Preserve existing uncommitted work in this checkout.
- No schema changes, new admin fields, network lookups, or live-status claims.
- Match the approved pale background, rounded border, TikTok mark, account heading, external CTA and availability footer.
- Support Indonesian and English, narrow screens, long handles, and keyboard focus.
- Only recognize HTTP(S) TikTok hostnames with `/@handle/live`; malformed or lookalike links keep the generic fallback.
- Retain the saved URL as the destination, including query parameters.

## Implementation and verification

- [x] Add rendered-component regression coverage in `src/components/live-stream-card.test.tsx`: account from URL, external destination, translated text, YouTube iframe, and non-LIVE/lookalike fallback.
- [x] Run the focused test and confirm the new TikTok behavior fails before implementation.
- [x] Add `src/lib/streams.ts` for full LIVE URL recognition and `src/components/TikTokLiveCard.tsx` for presentation. Route matching links from `src/components/ui.tsx`.
- [x] Add the `tiktokStream` namespace to `messages/id.json` and `messages/en.json`.
- [x] Run focused stream/component tests and TypeScript validation.
- [x] Render the actual component with the project CSS, inspect desktop and mobile, and review the bounded change.

The approved mockup is `C:/Users/dzulf/.codex/visualizations/2026/09/03/01a067bb-f7e0-7cd0-bf4b-181f5e7e8011/tiktok-stream-mockup.html`. Its preview toolbar and admin simulator are review tools and do not ship in the application.

## Verification results

- 30 focused tests passed across the stream component and tournament engine.
- Scoped TypeScript validation passed. Whole-project typecheck is blocked by existing untracked certificate service imports (`@/lib/db`, `@/lib/repository`).
- Actual component rendered with project CSS in Indonesian and English; checked desktop, 390px mobile, 320px long content, 50px CTA and keyboard focus.
- Design detector reported no findings.
- No deployment or production data changes.
