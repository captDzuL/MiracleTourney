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
