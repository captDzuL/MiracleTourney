# Bracket Social V3 — final integration review (2026-10-04)

Scope: baseline 894ad59 to the uncommitted codex/bracket-social-v3 feature diff, including the approved design, implementation plan, task reports, and shared model, readers, routes, editor, board, renderer, and tests. This review made no source edits and did not rerun reported checks.

## Strengths

- Public and organizer readers have separate authorization paths; the public graph reader returns an empty allowlisted model for an unpublished draft before reading match/team rows (src/lib/bracket/read.ts:29-45, 68-81). The public PNG route consumes only that public reader. Organizer GET/POST and preview PNG check ownership, and POST checks same origin before upload or persistence.
- The model uses team IDs, explicit source match IDs, official completed results, and a complete untied league projection for champion decisions. The board and PNG share the same escaped markup and layout. Export bounds, controlled asset sources, network blocking in Chromium, and fallback initials address the main public-data and rendering risks.
- Upload validation checks type, signature, size, and full pixel decoding before storage. Migration is additive. The implementation follows V3 typography and navy/cyan/violet/cream tokens, with localized status text.

## Issues

### Critical (must fix)

None found in the reviewed diff.

### Important (should fix before merge)

1. **Legacy live and schedule states disappear.** src/lib/bracket/model.ts:153 maps every non-bye, non-completed legacy match to scheduled, although the aligned result carries status and scheduleStatus and the graph adapter already recognizes live, delayed, and postponed. Existing legacy elimination events rendered by the new board and PNG therefore lose the required LIVE/delayed/postponed indicators. Apply the same state mapping to the aligned legacy result, preserving bye and completed precedence, and test all three states through buildLegacySocialBracket.

2. **An unsaved organizer preview downloads the previously saved appearance.** src/components/v3/organizer/BracketAppearanceEditor.tsx:26-28,81 renders the draft settings or selected local Blob image in SocialBracketBoard, while its active PNG controls call the organizer endpoint, which re-reads persisted appearance (src/app/api/organizer/events/[eventId]/bracket.png/route.ts:15-22). Changing a slider or selecting artwork, then clicking Download before Save, silently produces a PNG with the old appearance. Disable export while appearance is dirty and show a save-first hint, or deliberately export the saved board appearance until save completes. Include a UI test for the unsaved state.

3. **League public pages have no visible PNG action.** In src/app/events/[slug]/bracket/bracket-page-content.tsx:481-515, V3 routes round_robin to AdaptiveBracketBoard, while the download controls are only supplied by SocialBracketBoard. The public PNG API does support a league model, but a visitor has no way to invoke it from the league bracket page. Add localized PNG controls beside the existing league/standings presentation, keeping that presentation intact; cover the adaptive and legacy V3 branches.

4. **Selected-round champion panel clips on a 390 px mobile screen.** src/lib/bracket/markup.ts:69 sizes the selected-round cream panel with min(420px, calc(100vw - 64px)), while src/lib/bracket/layout.ts:84 permits a 300 px canvas and src/components/v3/public-event/social-bracket.css:2,24 constrains the local scroll area and positions the panel absolutely. The observed final-round panel extends beyond the inner scroll width at 390 px, cutting off its right edge. Make the selected canvas wide enough for its champion panel, or size the panel against the actual canvas/scrollport; verify the final round at 390 px and in PNG.

### Minor (actionable or deferred)

1. **The PNG lacks the planned short legend.** src/lib/bracket/export.ts:120 composes only the header, canvas, and optional watermark. The approved design calls for a short legend in the export. Add a small localized legend for status/connection semantics within the capped export dimensions if that requirement remains in scope.
2. **Unused asset after a later database failure (deferred).** src/app/api/organizer/events/[eventId]/bracket-appearance/route.ts:51-63 uploads and records an approved asset before the appearance upsert. If the upsert fails, the saved appearance is unchanged but the new asset/object remains unused. A later cleanup path or transactional database write plus object cleanup can address this without blocking the visual feature.
3. **Trophy artwork warrants a visual polish pass (deferred).** The compact SVG path embedded at src/lib/bracket/markup.ts:69 appeared malformed in the root browser review. Replace it with a verified, accessible trophy icon after checking the final mobile and PNG render; no champion-decision logic depends on the icon.

## Verification and rollout limits

The root agent reports the final full suite passing (238 files passed, 2 skipped; 2650 tests passed, 6 skipped) and a current production build passing. Both PNG route traces contain shared CSS and three Montserrat font files. No database is configured in this review environment, so an actual authenticated upload → save → public page → PNG flow has not been exercised. The development preview is guarded by NODE_ENV and cannot substitute for that flow. Apply the additive migration before deploying code that calls EventBracketAppearance; no migration or seed was run here. The current engine uses one grand final with no reset, and this implementation follows that behavior.

## Assessment

**Ready to merge: No, pending the four Important fixes and final checks.** The security and data boundaries are sound in the reviewed code, but these visible integration gaps leave required behavior inconsistent across existing competitions, organizer preview, league pages, and mobile.
