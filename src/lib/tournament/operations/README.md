# Competition operation boundary

`createCompetitionOperations(prisma).execute(...)` is the authorized write entry
point. Use `executeCompetitionOperationAction` for browser submissions: it obtains
the session, enforces organizer password-change rules and the rollout flag, and
invalidates event views after commit. Never accept an actor from a request body.
The legacy `admin` role is an administrator alias, matching repository policy.

Each request supplies `eventId`, `expectedVersion`, `idempotencyKey`, and a typed
`command`. The result contains the new competition version and the affected
resource ID. All mutations, the event compare-and-swap, and the audit receipt run
in one serializable Prisma transaction. Reusing the exact request returns its
original receipt; reusing a key with another actor or payload fails. Authorization
is checked before replay. PostgreSQL serialization conflicts retry the whole
transaction up to twice. Callers should preserve keys and payloads when retrying.

Supported commands:

- `initialize`: validates event-owned seeded teams and persists the deterministic
  graph. Existing matches/phases and any official result prevent replacement.
- `schedule_save`: runs the scheduler from persisted graph/current match state,
  saves an immutable draft (including conflicts and impact), and returns its ID.
  Manual overrides require a reason. Clients cannot supply authoritative graph,
  current assignments or lifecycle states.
- `schedule_publish`: publishes only the explicitly selected feasible draft.
  Match state changes since its review snapshot require a fresh draft. The
  selected revision's assignments and `Event.publishedScheduleVersion` update
  atomically. Unpublished saves never write match schedule columns.
- `match_timing`: records delay/postponement with a reason; live/completed matches
  cannot move. Schedule recalculation remains a subsequent draft/review/publish.
- `readiness_update`, `readiness_deadline`, `match_start`: organizer roll call,
  deduplicated critical actions, and a start guard. The v1 deadline is the
  published match start. A breach never writes an official result or walkover.
  Both participants must be ready, or the organizer must supply an audited start
  override reason. Unresolved participants cannot be overridden.
  Starting also requires a complete assignment from the currently selected
  published revision, matching the match's room, start, end and schedule version.
  A readiness override never bypasses schedule publication.
- `incident_report`, `incident_resolve`, `action_resolve`: scoped incident/action
  management; resolutions require reasons.
- `announcement_save`, `announcement_publish`, `announcement_unpublish`: saved
  announcements start as drafts and require explicit publication.
- `result_submit`: submits `matchId` and consecutive `games` containing
  `gameNumber`, `homeScore`, `awayScore`. Best-of comes only from the persisted
  graph. BO1 retains the game score and permits draws only for round robin/group
  fixtures; longer series must end exactly when one side reaches the required
  wins, and project series wins into match scores. The resource ID identifies the
  immutable result revision. No player-statistics or legacy MatchGame rows are
  written: official game detail lives in the revision and result snapshot.
- `result_correct`: requires the same score input, a nonblank `reason`, and the
  `previewToken` returned by `previewCompetitionResultCorrectionAction` (or the
  authorized service `previewResultCorrection`). Preview is read-only and includes
  version, proposed score, transitive participant impact, blocked descendants,
  standings, placements and schedule impact. Its checksum binds these contents
  and the current competition/result versions; it is a review consistency token,
  not an authorization credential. Any intervening operation requires a new
  preview. Live/completed descendants, including qualification paths, block all
  corrections. Accepted changes append revisions and invalidate changed-slot
  readiness. Identical idempotent retries return the original receipt.

Result commands recompute authoritative standings/qualification and placements
under each phase's `configuration.projection` while retaining `configuration.graph`.
Standings apply configured points and ordered tiebreakers; head-to-head compares
mini-table points among tied teams. Unresolved rank ties retain a shared rank,
raise an organizer action, and never qualify using a display-order fallback.
Qualification is released only when its group's fixtures all have official results.
An explicit tiebreak fixture/resolution workflow is a subsequent capability.

When a schedule exists, results append a newly recalculated draft with retained
planner input and fresh match review baseline. Published schedule selections and
assignments remain immutable until explicit publication. Pre-upgrade snapshots
without planner constraints yield a visible infeasible review draft requiring a
new schedule save. Result/readiness conditions are resolved; unrelated incident
actions stay open. Score snapshots whitelist result data and never include stats.

Both legacy result repository functions now serialize on the event row and
increment its competition version inside their transaction before checking for
V3 phases. Initialized V3 events are rejected even when the rollout flag is off;
legacy events retain their score/game behavior. The event version also invalidates
an initializer racing a legacy result, so the legacy path cannot bypass V3 CAS.

`readScheduleDraft(eventId, revisionId, actor)` returns the owner/admin review
details and current competition version. `readPublishedSchedule(eventId)` returns
only the selected published revision's assignments/timezone/version, never private
draft impact or warnings. Public page consumers must still enforce the normal
event publication/visibility gate before calling it. Operational match status is
separate from the immutable public schedule revision.

## Persistence contract for subsequent tasks

`Event.competitionVersion` is independent of editorial draft versions. Every new
result/progression writer must use this same event CAS in its transaction; legacy
writers must be gated for V3 competitions or migrated to this boundary.

The first phase's `configuration.graph` preserves the full graph, including
qualification dependencies, placements, standings rules and group cutlines.
Each match's `scheduleMetadata.graphMatch` preserves its structural round,
bracket, participant sources and best-of. Preserve this metadata during later
writes. `MatchDependency` persists winner/loser edges. Legacy event-wide round
ordinals and slots remain unique across groups and brackets. Unresolved team
slots use the existing nonrelational Match string columns as empty strings; they
must be resolved from authoritative results/qualification before starting.

The test-only store replaces PostgreSQL's external boundary while executing real
authorization, commands, scheduler, graph factory and queries. It stages commits
and rolls back failures; it does not emulate PostgreSQL constraints or locking.
Focused tests cover CAS contention, serialization retries, rollback at graph audit
and schedule publication, idempotency, ownership, review privacy, readiness and
announcements. Live database verification remains an integration rollout check.
