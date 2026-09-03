# Match statistics recording status

## Approved behavior

The admin/organizer Results & Statistics section shows recording progress independently of the match's `Completed` status:

- `unrecorded`: Belum dicatat / Not recorded, gray; no persisted rows for the current roster.
- `partial`: Sebagian tercatat / Partially recorded, amber; some persisted rows, but both team rosters are not complete.
- `recorded`: Tercatat / Recorded, green; both rosters are nonempty and every displayed player has all configured numeric statistics persisted. Zero counts.
- `notRequired`: Selesai / Completed for modes without configured statistics.

Each team editor displays its own status. Empty rosters show Lengkapi roster / Complete roster and instructions to add players. Saved statistics remain editable. Public bracket status and result scoring are unchanged.

## Implementation

`stat-recording.ts` owns the pure completeness rules. `stat-recording-repository.ts` reads current roster IDs and persisted PlayerStat rows in two batch queries scoped to the authorized active event and its completed matches. Statistics are grouped by match and team; cards and editor badges share the resulting status map.

Direct admin/organizer writes, approved captain submissions, and legacy persisted rows count equally. Pending/rejected submissions do not create PlayerStat rows and are not read for completeness. Rejecting a newer submission does not erase previously saved valid statistics.

The dashboard only loads selected-match details for a match present in its authorized lists. Status is recomputed on each render; existing save/approval actions already invalidate the layout. No schema migration, backfill, public API change, or new finalization button is required.

Current roster membership determines completeness. Adding a player can return a recorded team to partial. An interrupted save that persists only some players cannot count as complete. Existing saved data remains the source of truth if a later edit fails.

## Verification

- Pure tests: absent rows, partial players/columns, numeric zero, malformed values, roster changes, missing rosters, and modes without statistics.
- Repository tests: two scoped batch queries, team/match separation, legacy/admin/captain rows, fresh reads after changes, and empty inputs.
- Browser tests: automatic status changes for both teams, editing, reload, Indonesian/English, mobile badge bounds, actual captain approval, pending/rejected submissions, and empty rosters.
- Browser verification uses the explicit `.env.test` environment and dedicated test fixtures without changing the database schema or production environment files.
- Full typecheck currently reports pre-existing missing imports in `src/lib/certificate/service.ts` (`@/lib/db`, `@/lib/repository`).
