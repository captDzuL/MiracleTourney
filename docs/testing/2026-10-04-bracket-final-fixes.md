# Bracket Social V3 — final review fixes (2026-10-04)

The four Important findings in [the final integration review](2026-10-04-bracket-final-review.md) are addressed in the isolated `codex/bracket-social-v3` worktree, without a commit.

- Legacy elimination results now keep aligned `Live`, `delayed`, and `postponed` states. Bye and official completed-result precedence remain intact.
- The organizer board disables both PNG buttons while appearance settings differ from the saved version, a local artwork file is selected, or a save/reset request is pending. It shows a localized save-first hint. Round navigation remains available; successful save/reset re-enables export.
- Both adaptive and legacy V3 league pages retain their standings or fixture table and show shared PNG controls when a public social model exists. A localized round selector supports partial export; the selected round is sent to the public PNG endpoint. The standalone controls resolve V3 color tokens outside the social board.
- The selected-final champion panel is constrained to the 272 px match-card width, inside the observed 279 px mobile scrollport at a 390 px viewport. Full-board width accounts for its hero. The trophy is a clean stroked SVG.

The PNG now includes a localized line/status/winner legend. Its export height budget reserves room for the legend while retaining the 16,000 px side and 64 MP caps.

## Verification

- Initial regression run: 9 expected failures across legacy statuses, dirty editor export, league actions, mobile hero geometry, and PNG legend. The league round selector added 3 expected failures; the stronger 390 px hero constraint added 1 expected failure. Each was observed before its corresponding fix.
- Focused bracket tests: **60 passed across 7 files**. Neighboring layout, reader, route, and adaptive-board tests: **19 passed across 5 files**. TypeScript `--noEmit`: exit 0. ESLint on the final changed source and tests: exit 0, no errors. The wider changed-file lint run had one existing plain-`img` optimization warning and a CSS configuration warning.
- Root's live Edge check confirmed the 390 px final hero ends at x=324 inside the mobile scrollport ending at x=327; both right corners are visible. It also confirmed unsaved slider changes disable both PNG buttons, the localized save-first hint appears, round navigation works, and returning the slider to the saved value re-enables export.
- Actual `PLAYWRIGHT_CHANNEL=msedge` renderer outputs were regenerated and visually inspected: [full public](artifacts/bracket-social-v3/full-public.png) 1110×948, [selected final](artifacts/bracket-social-v3/final-public.png) 480×534, [draft preview](artifacts/bracket-social-v3/draft-preview.png) 1110×948, and [custom background](artifacts/bracket-social-v3/custom-background.png) 1110×948. The last uses `/logo/miracle-preview.png` as the bracket background and shows it behind readable cards and the champion panel.

No database was configured for an authenticated upload → save → public page → PNG run. The unused uploaded asset after a later database-upsert failure remains the deferred Minor finding from the review. No migration, seed, database copy, or environment copy was performed here. The root agent is running the final full suite and production build separately.
