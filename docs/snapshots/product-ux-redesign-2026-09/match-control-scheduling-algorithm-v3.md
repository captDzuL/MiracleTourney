# Miracle V3 — Match Control Scheduling and Action Priority Contract

Recorded: 5 September 2026.

## Status

Approved as a future implementation requirement after review of `public/miracle-organizer-v3-match-control-mockup.html`. The mockup remains a design prototype; this document defines the behavior that production code must eventually enforce and test.

## 1. Action-priority algorithm

The organizer queue must contain only states requiring a human decision. Informational events belong in activity history and notifications, not in `Perlu tindakan`.

### Priority bands

1. **Critical**
   - Check-in deadline has passed while one or both teams remain unconfirmed.
   - A scheduled match cannot start because a required predecessor, room, or operator decision is unresolved.
   - A match has exceeded its start time without being started, postponed, or completed.
   - A WO, cancellation, or disputed result is awaiting organizer confirmation.
2. **Urgent**
   - Check-in closes within the configured urgent window, initially 15 minutes, while a team remains unconfirmed.
   - A room or feeder match is projected to delay a confirmed match.
   - A confirmed schedule change has not yet been acknowledged operationally.
3. **Attention soon**
   - A projected conflict exists beyond the urgent window.
   - A required captain response or organizer review has a future deadline.
4. **Informational**
   - Successful check-in, match start, score saved, schedule published, and completed review events. These do not enter the action queue unless another rule creates an unresolved decision.

### Stable ordering

Within the queue, sort by:

1. priority band;
2. overdue state before future deadlines;
3. earliest decision deadline;
4. largest downstream impact, measured by affected locked/confirmed matches and bracket descendants;
5. earliest scheduled start;
6. stable match identifier as the final deterministic tie-breaker.

`Sudah dilihat` records acknowledgement only. It must never remove, lower, or resolve an actionable item. An item leaves the queue only when its underlying condition is resolved or explicitly superseded.

### Deduplication and escalation

- One unresolved condition produces one action item even when evaluated repeatedly.
- Store a stable condition key such as `eventId:matchId:conditionType`.
- Update an existing item's deadline, evidence, and severity instead of creating duplicates.
- Escalation changes the existing item from soon → urgent → critical.
- Notify on creation, escalation, material deadline change, and resolution. Do not notify repeatedly while nothing changes.

## 2. Automatic schedule generator

### Required inputs

- Event timezone, default `Asia/Jakarta` / WIB.
- First playable date and time.
- Default match duration.
- Turnaround buffer between room slots.
- Number of simultaneous match rooms.
- Minimum team rest time before its next match.
- Eligible room or stream assignments.
- Bracket dependency graph.
- Optional duration overrides by round and by match.
- Optional fixed or locked match assignments.

### Structured schedule states

Every match schedule needs structured timestamps and a state:

- `estimated`: generated but not published;
- `confirmed`: published to captains;
- `locked`: protected from automatic movement;
- `delayed`: confirmed time can no longer be met;
- `live`: started and immutable to the scheduler;
- `completed`: finished and immutable to the scheduler;
- `postponed`: removed from normal allocation until rescheduled.

A display label may remain for presentation, but it cannot be the source of scheduling calculations.

### Scheduling constraints

Treat bracket matches as a directed acyclic graph. A match may be placed only after all known constraints are satisfied.

For each match:

`earliestStart = max(eventStart, predecessorReadyAt, teamRestReadyAt, roomAvailableAt, fixedWindowStart)`

Where:

- `predecessorReadyAt` is the latest end of feeder matches plus the configured rest time;
- `teamRestReadyAt` is the latest previous match end for either participating team plus rest time;
- `roomAvailableAt` is the next available time for an eligible room including turnaround buffer;
- `fixedWindowStart` applies when an organizer has constrained or locked the match.

Match end is:

`endAt = startAt + effectiveDuration`

`effectiveDuration` uses match override first, then round override, then event default. Room availability becomes `endAt + turnaroundBuffer`.

When multiple rooms are eligible, choose the room producing the earliest feasible start. Break ties by explicit organizer preference and then stable room identifier. Preserve deterministic output for identical inputs.

### Preview and publication

- Generation creates a draft preview and reports expected finish time, conflicts, idle gaps, and dependency assumptions.
- Organizer may edit or lock individual matches.
- Publication requires explicit organizer confirmation.
- Captain notifications occur only after publication or a later confirmed change.
- Estimated downstream matches must state that opponents and times depend on feeder results.

## 3. Delay recalculation

When a match starts late or exceeds its duration:

1. identify its room successors and bracket descendants;
2. recompute only affected, movable matches;
3. never move live, completed, postponed, or locked matches;
4. treat confirmed matches according to the organizer's selected policy for that recalculation;
5. detect new room, team-rest, operating-window, and stream conflicts;
6. present a before/after diff and downstream impact;
7. apply changes as a draft;
8. publish and notify captains only after explicit organizer confirmation.

Organizer choices must include:

- shift all affected movable matches;
- preserve confirmed times and surface conflicts;
- edit selected matches manually;
- keep times as estimates until feeder results are known.

## 4. Readiness integration

Captain self check-in and organizer manual confirmation write to the same team readiness state while preserving source, actor, timestamp, and note.

- Absence and WO are never inferred solely from failure to open Miracle.
- A missed deadline creates a critical action item rather than an automatic WO.
- Organizer confirmation from live, Discord, WhatsApp, or direct contact is valid when recorded manually.
- Starting a match should normally require both teams ready; organizer overrides require an audited reason.

## 5. Audit requirements

Record at minimum:

- schedule generated, edited, locked, recalculated, and published;
- readiness created, revoked, or overridden;
- captain contact attempt;
- match started, postponed, cancelled, or completed;
- WO decision and reason;
- score and per-game result changes;
- stat approval or rejection.

Each audit item stores event, match when applicable, actor, timestamp, action type, previous value, new value, and operator note.

## 6. Verification contract

Production implementation must include meaningful tests for:

- deterministic schedule output;
- dependency and team-rest enforcement;
- parallel-room allocation;
- round and match duration overrides;
- locked/live/completed match immutability;
- delay propagation limited to affected descendants and room successors;
- conflict detection;
- explicit publication before notification;
- stable action ordering;
- action deduplication and escalation;
- acknowledgement not resolving an action;
- missed check-in creating an action rather than automatic WO;
- authorization and audit records for organizer overrides.

## 7. Result and player-stat publication separation

Official match progression and player-stat publication are separate workflows.

### Official result — synchronous progression

After per-game scores pass validation and the organizer confirms `Simpan hasil resmi`, production code must perform the following as one consistent operation:

1. persist the official per-game and series score;
2. mark the match completed and store the winner;
3. resolve the dependent bracket slot;
4. recalculate the earliest feasible schedule for affected downstream matches;
5. create action items for any new schedule conflict;
6. record the audit event;
7. make the updated bracket/result available to captains and the public;
8. enqueue relevant notifications.

Player statistics must not block this operation. Bracket progression and schedule recalculation proceed even when neither captain has submitted stats.

The UI must show the computed winner and downstream bracket impact before organizer confirmation, but it does not require an intermediate result draft by default. A short explicit confirmation is the safety gate.

### Player statistics — asynchronous draft/review/publication

Player statistics have an independent lifecycle:

- `not_started`;
- `draft`;
- `submitted`;
- `pending_review`;
- `published`;
- `rejected` and returned for correction.

Organizer-entered statistics may be saved as draft. Captain submissions remain pending until an authorized organizer approves them. Public leaderboards and player profiles use published statistics only. Unpublished statistics never block bracket progression, downstream scheduling, certificates based on the official result, or result notifications.

### Result correction

- Before a dependent match starts, an authorized organizer may reopen the result with a required reason. The system previews winner, bracket, and schedule changes before applying them.
- If any dependent match is live or completed, automatic correction is blocked and a critical manual-resolution item is created.
- Correcting an official result does not silently rewrite published player statistics. A separate stat review/correction task is created when the old statistics may no longer match the official result.
