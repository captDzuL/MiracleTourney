# Schedule draft boundary

Import `planSchedule`, `recalculateSchedule`, and their types from `./index`.
Both functions are pure: no storage, clock, result mutation, publication, or UI.
The competition graph is the input boundary; only `pending` graph nodes consume
slots. Pass actual live/completed state separately through `matchStates`.

## Inputs and time

Supply an IANA `timezone`, an event window with explicit-offset ISO timestamps,
positive `matchDurationMinutes`, nonnegative `bufferMinutes` and
`minimumRestMinutes`, and unique room IDs. Output timestamps are canonical UTC
instants; the timezone is retained for presentation. Elapsed minutes remain
correct through daylight-saving transitions. Local wall-clock conversion and
ambiguous/nonexistent local-time choices belong to the caller.

`existingAssignments` provide previous start/end/room values. Their explicit
duration is retained when preserving an assignment. Newly allocated slots use
`matchDurationMinutes`. `manualOverrides` request exact start/end/room values,
including changed duration. `lockedMatchIds` and live/completed states require
an existing assignment and prevent changes. Malformed input returns an
`INVALID_INPUT` conflict without generating assignments.

## Hard constraints

- Every new assignment fits within the event window and an available room.
- A room has no overlapping games and gets the configured turnaround buffer.
- Any known or potentially shared team gets at least minimum rest, regardless
  of room. Winner and loser paths inherit all possible source entrants.
- Dependencies finish before their dependent games, with minimum rest.
  Participant sources and explicit graph edges are combined. Group-rank sources
  wait for every playable group game and retain TBD participants.
  Structural cycle checks also reject self-dependencies and all proposals
  relying on cycles, even when an exact override reserves a slot.
- Locks, live/completed matches, and matches outside recalculation scope stay
  unchanged. Conflicting manual requests are rejected and reported.

Preexisting contradictory immutable assignments cannot both be preserved and
repaired automatically. They remain visible as existing evidence in the draft
with hard conflicts and `feasible: false`. No newly generated overlapping slot
is accepted. Missing prerequisite proposals and dependent proposals are removed.

## Soft preferences and determinism

The scheduler uses a deterministic greedy heuristic, not a global optimizer or
an infeasibility proof. Ready matches use ordinal match-ID order. It first
reserves feasible unrelated existing slots, relaxing those reservations if they
prevent placing the current match. Candidate choices prioritize:

1. Keeping an exact feasible existing assignment.
2. Reducing shortfall against optional `preferredRestMinutes` (at least minimum
   rest; defaults to minimum rest).
3. Earlier start, reducing delay.
4. Fewer room changes against previously placed potential participants.
5. Lower room assignment count, then ordinal room ID.

Potential entrant sets intentionally overestimate clashes between unresolved
winner/loser paths and different group ranks. This can add delay and serialize
games that eventual results would allow to run together. TBD warnings make
that tradeoff visible. Preferred rest may be relaxed without making a draft
infeasible; the warning remains reviewable. `NO_FEASIBLE_SLOT` means the heuristic
found no slot under the current placements, not that no rearrangement can work.

## Recalculation and review

`recalculateSchedule({ ...input, changedMatchIds })` includes mutable changed
matches and follows downstream match/qualification edges. A locked, live, or
completed descendant stops that path. An immutable changed root can still
trigger traversal into its children. Bye/empty descendants may be traversed but never enter
the playable recalculation scope. Overlapping immutable changed roots retain
their own traversal privilege even when another root reaches them first.
Upstream and unrelated matches retain
their old assignments; unrelated unscheduled matches stay unscheduled. An
override outside that scope is a conflict. Shared rooms/teams constrain choices
but do not widen traversal into unrelated games.

The result always has `kind: "draft"`. `recalculatedMatchIds` is the mutable
review scope; `affectedMatchIds` contains actual assignment changes. `impact`
provides before/after snapshots and signed start delay in minutes (null for
added/removed slots). `conflicts` are hard failures; `warnings` expose soft
shortfalls and TBD assumptions. `feasible` concerns hard conflicts only.
Assignments, impact, and issues have stable ordering. The caller must present
and approve a draft and separately revalidate current state before persistence.
