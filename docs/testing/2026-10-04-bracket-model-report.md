# Bracket Social V3 — model and public reader report

Implemented the shared presentation model and readers in the isolated `codex/bracket-social-v3` worktree. No changes were made to the parent E: checkout, and no database migration was executed.

## Changed files

- `src/lib/bracket/model.ts` and `model.test.ts`: team identities by ID, readable source labels, explicit links, official result status, BO games, bye and legacy projections, league standings champion, and hidden-source filtering.
- `src/lib/bracket/read.ts` and `read.test.ts`: public-only active/completed graph reader, draft exclusion, authorized organizer preview, and legacy fallback.
- `src/app/events/[slug]/bracket/bracket-page-content.tsx` and `page.test.ts`: V3 elimination pages render the shared social board. Legacy flag-off and league standings routes remain available.

## Verification

Tests were written before implementation and observed failing for the missing model/reader, V3 page routing, private draft leak, hidden parent slot, league match display, per-round legacy slots, and organizer legacy preview. Fresh focused run: 42 tests across 3 files passed. Combined TypeScript check passed. Changed-file ESLint passed with no warnings; scoped diff check passed.

## Decisions and limits

Organizer preview returns `null` when access fails and checks access before reading competition rows. It uses the shared workspace authorization policy, which allows the event owner plus administrator exceptions, and marks all preview models as previews. Public draft phases return an empty allowlisted model without reading team or match rows. The legacy league adapter renders round-robin fixtures but leaves champion null because only the typed graph standings projection provides a complete, untied official title decision.

The review correction now derives legacy labels and future-round BO settings from the complete internal bracket depth, while the public model contains only visible matches. Published 24-team opening rounds are labeled Play-in in ID/EN. A finished league with a complete tie for first has no champion. The current competition engine uses one grand final with no reset; the model follows its placement mapping without adding a speculative reset.
