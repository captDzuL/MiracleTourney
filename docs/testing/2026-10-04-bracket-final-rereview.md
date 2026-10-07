# Bracket Social V3 — final fix re-review (2026-10-04)

Scope: one re-review of the findings in `2026-10-04-bracket-final-review.md` against `.superpowers/sdd/2026-10-04-bracket-social-v3/final-fix-review.diff`. No source edits or check reruns.

## Finding verdicts

1. **Legacy Live, delayed, and postponed states — ADDRESSED.** `src/lib/bracket/model.ts:153` now maps a non-bye, non-official legacy match through the aligned result's status and schedule state, retaining bye and official completed precedence. `src/lib/bracket/model.test.ts:85-95` covers all three states.
2. **Unsaved organizer appearance exporting the saved PNG — ADDRESSED.** `src/components/v3/organizer/BracketAppearanceEditor.tsx:27,82` disables both PNG controls for changed settings, a selected local file, and pending save/reset; it supplies the localized save-first hint. `src/components/v3/public-event/SocialBracketBoard.tsx:22-30,39` keeps round navigation active, and `src/components/v3/public-event/BracketPngDownloads.tsx:24-25,52-57` guards the request and displays the hint. The editor test covers dirty, pending, failed, saved, and reset states; the reported Edge check also confirmed dirty-slider navigation and re-enabling after reverting to the saved value.
3. **No visible league public PNG action — ADDRESSED.** `src/app/events/[slug]/bracket/bracket-page-content.tsx:463,507,576-577` adds the controls beside both adaptive V3 standings and the legacy V3 fixture table, preserving each presentation. `src/components/v3/public-event/BracketPngDownloads.tsx:18-22,50-54` selects an actual model round and sends its encoded key to the public PNG endpoint; the focused route and interaction tests cover both league branches and round selection.
4. **390 px selected-final champion clipping — ADDRESSED.** `src/lib/bracket/markup.ts:69-73` constrains the selected-round panel to the 272 px card width and accounts for the full-board panel in canvas width. The reported real Edge check measured the panel's right edge at x=324 inside the scrollport edge at x=327, with both corners visible; selected-final PNG was regenerated and inspected.
5. **Missing short PNG legend — ADDRESSED.** `src/lib/bracket/export.ts:109,120-121` adds localized line, LIVE, and winner semantics and reserves height; `src/components/v3/public-event/social-bracket.css:25` styles the legend. The PNG test and reported real renderer outputs cover its presence.
6. **Unused uploaded asset after a later database failure — UNADDRESSED (deferred Minor).** The fix diff does not touch `src/app/api/organizer/events/[eventId]/bracket-appearance/route.ts`; this remains the previously accepted nonblocking cleanup item.
7. **Trophy artwork — ADDRESSED.** `src/lib/bracket/markup.ts:71` replaces the suspect filled path with a simple stroked, decorative SVG. The regenerated PNGs were reported as visually inspected.

## New breakage in the fix diff

No new Critical or Important finding. The new league controls use the existing public reader and public PNG endpoint, while the organizer controls retain their organizer endpoint. The selected-round key is drawn from the returned public model. The export change retains the 16,000 px side and 64 MP checks, draft watermark, and bounded asset handling. The changed markup and CSS preserve V3 tokens and Montserrat.

## Out-of-scope observations and verification limits

The deferred unused-asset case remains outside this fix. An authenticated upload → save → public page → PNG run was not possible without a configured database; no migration or seed was run. The fix report records 60/60 focused tests, 19/19 neighboring tests, TypeScript and changed-file lint passing, four regenerated real Edge PNGs, and the 390 px browser check. The root reports the frozen-tree full suite passing (2,658 passed, 6 skipped; 239 files, 2 skipped), production build exit 0, changed-TypeScript ESLint exit 0 (0 errors, one plain-img optimization warning), and diff check exit 0. These are reported results, not checks rerun for this re-review.

## Verdict

**Fix round: all four Important findings addressed, with no new Critical or Important breakage in the scoped fix diff.** The short legend and trophy polish are addressed. The previously deferred asset cleanup remains Minor. The fix is ready for the root's final verification and merge decision, subject to the stated database-flow limit.

**Spec compliance: PASS** — the four Important gaps and requested PNG/trophy details are addressed within the reviewed scope; the authenticated database flow remains unverified in this environment.

**Code quality: APPROVED** — no new Critical or Important issue found in the fix diff; the pre-existing deferred Minor asset cleanup remains open.
