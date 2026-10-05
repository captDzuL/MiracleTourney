# Bracket Social V3 Implementation Plan
> For agentic workers: Use superpowers:subagent-driven-development; implement and review each bounded task.
Goal: Deliver the approved bracket redesign, organizer background settings and PNG export on the real V3 event.
Architecture: A shared allowlisted SocialBracketModel feeds the client board and PNG template. A separate appearance record stores uploaded background and display settings; results remain derived from official competition data.
Tech Stack: Next.js 15, React 19, Prisma 6, Vitest 4, existing Sharp/image uploader, existing Chromium screenshot renderer.
## Global Constraints
- Worktree: C:/Users/dzulf/.codex/worktrees/bracket-social-v3/MiracleTourney-gitnative; baseline 894ad59; branch codex/bracket-social-v3. Parent dirty checkout is protected.
- Montserrat, navy surfaces, cyan/violet accents, cream champion; readable solid team slots; ID/EN.
- Upload PNG/JPEG/WebP <=5 MiB, actual decoding validation; same-origin ownership checks before writes/uploads.
- Public export never includes draft. Preview requires organizer ownership and has watermark.
- PNG <=16,000 px per side and 64,000,000 pixels; oversize full export offers round selection.
- All match connections use explicit source IDs, never names or array proximity.
- No production database migrations, reseeding, pushes, or deployments in this task.
- Test first for behavior; run focused and neighboring tests, typecheck and lint. Review before finish.

## Shared interfaces
Types are defined in src/lib/bracket/types.ts. No consumer changes the shape without notifying the controller.
readPublicSocialBracket(slug: string, locale: "id" | "en"): Promise<SocialBracketModel | null>
readOrganizerSocialBracket(eventId: string, locale: "id" | "en"): Promise<SocialBracketModel | null> (ownership enforced before return)
getBracketAppearance(eventId: string): Promise<BracketAppearance>
SocialBracketBoard({ model, exportHref?, showControls? }: { model: SocialBracketModel; exportHref?: string; showControls?: boolean })
BracketAppearanceEditor({eventId,locale,initial,previewModel?}) uses API /api/organizer/events/[eventId]/bracket-appearance.
GET /api/events/[slug]/bracket.png?locale=id&round=ROUNDKEY (public-only); organizer preview separate authorized endpoint if provided.

## Task 1: Identity, topology, results and public reader
Files: src/lib/bracket/model.ts, read.ts and tests; src/app/events/[slug]/bracket/bracket-page-content.tsx and tests.
- [x] Write tests with independently constructed graph/results: completed final returns champion ID; incomplete/tied final and upper-final do not; logo lookup uses ID; explicit sources survive; private graph does not leak seeds.
Example assertion: expect(model.champion?.id).toBe("winner-team"); expect(pending.champion).toBeNull().
- [x] Run pnpm exec vitest run src/lib/bracket/model.test.ts src/lib/bracket/read.test.ts; confirm RED.
- [x] Implement graph and legacy adapters; preserve games/BO, bye, group playoff and double-elimination reset semantics; use complete official standings for league champion.
Implementation boundary: export async function readPublicSocialBracket(slug: string, locale: "id" | "en"): Promise<SocialBracketModel | null>.
- [x] Route V3 to shared board for elimination while preserving legacy flag-off and existing league/standings behavior. Make organizer preview enforce ownership before reading draft data.
- [x] Run focused tests and existing bracket page tests; submit changed-file report for independent review.

## Task 2: Saved appearance, upload, organizer editor
Files: Prisma EventBracketAppearance model/relation and additive migration; src/lib/bracket/appearance.ts; organizer appearance API/tests; client BracketAppearanceEditor/tests; organizer competition page integration.
- [x] Write route tests: wrong organizer and foreign origin cannot upload/save, fake file and size limit fail, reset clears background, position/overlay validation, success persists returned URL.
Example: expect(response.status).toBe(403) for an owned-by-other event; read fresh appearance and assert saved positionX===25.
- [x] Verify RED before production implementation.
- [x] Implement getBracketAppearance(eventId), defaults {backgroundUrl:null,positionX:50,positionY:50,overlay:35}; schema/table scoped to event; reuse uploadImageAsset with validationMode:"throw"; rights attestation for new artwork.
- [x] Implement local preview, positions, overlay, save/reset/error UI in V3 tokens and ID/EN; mount in real organizer competition page with same board preview; UI reports save failure while keeping persisted model.
- [x] Generate isolated Prisma client, no db migration execution. Run focused route/editor tests; report changes for review.

## Task 3: Shared V3 board, topology layout and PNG
Files: src/components/v3/public-event/SocialBracketBoard.tsx, social-bracket.css, related focused layout helpers/tests; src/lib/bracket/export.ts/tests; public PNG API/tests.
- [x] Write layout/render tests: two distinct slots, real/fallback logo, waiting source labels, winner badge, official champion, LIVE, bounded mobile round selector; no guessed edges.
Example: expect(renderToStaticMarkup(<SocialBracketBoard model={fixture}/>)).toContain("JUARA TURNAMEN").
- [x] Verify RED then implement fixed-height compact cards plus detail overlays, explicit SVG connections, optional champion node, navy/cyan/violet/cream styling with contrast.
- [x] Write export tests: public data only, round subset includes final champion, dimensions limits; injected screenshot dependencies observe real generated HTML; text is escaped.
- [x] Render a bounded server PNG using same card/layout model. Wait for fonts/images, fallback broken assets, block private-network/unsanctioned browser requests. Route accepts only locale and existing round keys, never URLs or raw HTML.
- [x] Verify export round and full output includes offscreen cards, no controls; run focused tests and report for review.

## Final verification and integration
- [x] Independently review model, appearance and board/export diffs; resolve important findings.
- [x] Run all focused/nearby tests, TypeScript, lint changed files, git diff --check.
- [x] Browser verify ID/EN at desktop and 390 px, no page overflow, upload/save/public/export in isolated test data where available. If live database unavailable, use dev-only preview fixture route guarded by environment and document limitations accurately.
- [x] Save report and commit only feature/spec/plan/report files. Leave worktree attached for review; do not integrate into dirty parent checkout automatically.
