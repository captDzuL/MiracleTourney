# Bracket Visibility and Locking Design

Date: August 2, 2026

## Summary

Adjust single-elimination bracket behavior so the public event page only shows rounds that are genuinely ready, while the admin workflow remains flexible before the first recorded result.

This design solves two launch-week problems:

- late team imports do not visibly re-shape the bracket in a predictable way
- future rounds appear too early, which makes the bracket look broken or confusing

## Product Rules

### Public bracket visibility

For single elimination events, the public bracket page must not render the full tree by default.

Instead, it shows only matches that are ready to be understood by the public:

- a first-round match is visible when it has two concrete teams, or when a bye has already resolved an auto-advance path
- a later-round match is visible only when both sides of the matchup are known
- rounds with unresolved upstream sources stay hidden

This means quarterfinal, semifinal, and final cards do not appear until the previous rounds have produced real participants.

### Bracket rebuild behavior

Before any result is recorded for a single-elimination event, the bracket remains soft-generated from the current team list.

If the admin imports another CSV for the same event before the first result exists:

- the bracket projection is rebuilt from the updated entrants
- seed order is recalculated from the latest participant count
- the public bracket must reflect the latest projection immediately after the import flow completes

### Bracket lock behavior

The first recorded single-elimination result locks the event bracket.

Once locked:

- no additional team import is allowed for that event
- no bracket reseeding or reshaping is allowed
- later rounds may continue to appear only through real advancement from recorded results

### Error handling

When an admin tries to import more teams into a locked event, the import must fail with a human-readable message explaining that the event has already started and registrations can no longer alter the bracket.

Recommended message:

`Event "<event_slug>" already has recorded match results, so additional teams cannot be imported.`

## Domain and Data Behavior

### Source of truth

The bracket source of truth remains:

- teams registered in the event
- recorded match results already stored for the event

No separate persisted bracket snapshot is required for MVP.

Before lock, the system should derive the current bracket directly from those inputs each time the event is read.

After lock, the same projection logic still runs, but the team list is effectively frozen because imports are rejected.

### Readiness model

Each projected single-elimination match needs a public visibility state:

- `hidden`: upstream winners are not fully known yet
- `ready`: both teams are known and can be shown publicly
- `auto-advance`: a bye path already resolves one side and can be represented without exposing later unresolved rounds

The MVP does not need a new persisted enum on disk; this can be computed in projection helpers.

### Bye behavior

Byes should resolve as advancement signals, not as noisy public match cards deep into the tree.

Rules:

- if a team receives a bye in the earliest visible round, that team advances automatically
- the next-round card remains hidden until the opposing side is also resolved
- public UI must not show an "empty semifinal" or "empty quarterfinal" just because one side auto-advanced

## UI Behavior

### Public bracket page

Replace the current "full projected bracket" presentation with a staged bracket display:

- show only visible rounds
- preserve bracket card styling
- omit future unresolved rounds entirely
- keep auto-advanced teams understandable through labeling such as `Bye` or `Auto-advanced`

If only the first visible round exists, the page should feel intentionally compact rather than incomplete.

### Admin expectations

Admin does not need a new manual "regenerate bracket" button in MVP.

Expected behavior:

- import teams
- event bracket updates automatically if no result exists yet
- once a result is saved, import attempts for that event are rejected

## Technical Approach

### Projection split

Separate single-elimination bracket logic into two layers:

1. full internal projection
   - used for advancement logic and result targeting
   - may include future rounds and unresolved sources

2. public-visible projection
   - filters the internal projection down to only publicly ready matches

This avoids breaking admin-side progression while fixing public confusion.

### Lock detection

An event is considered bracket-locked when at least one match result exists for that event with status `Completed`.

For MVP, this lock can be derived at read time from existing matches.

No new persisted event field is required unless later operations need auditability.

### Import validation

CSV validation for single-elimination events must add one more guard:

- reject import when the target event already contains any completed match

This validation belongs in the import parsing or import action validation path close to the existing event-level checks.

## Testing

### Unit tests

Add or extend tests for:

- bracket projection rebuilds when teams are added before any result exists
- public bracket hides future unresolved rounds
- bye advancement does not expose downstream unresolved rounds
- import is rejected once any result exists for the target event

### E2E checks

Add or extend browser coverage for:

- admin imports partial field, sees smaller bracket
- admin imports remaining teams before kickoff, public bracket reflects new shape
- admin records first result
- second import attempt is rejected with clear error text

## Scope Notes

This design is intentionally limited to single-elimination MVP behavior.

It does not introduce:

- manual seeding tools
- bracket regeneration controls
- draft-vs-live bracket snapshots
- double elimination behavior
- richer scheduling logic for hidden future rounds

## Success Criteria

This work is successful when:

- public users no longer see quarterfinal or semifinal placeholders before those rounds are real
- admins can still finish registration imports before the first recorded result
- late imports before kickoff visibly reshape the bracket
- late imports after kickoff are blocked clearly and safely
