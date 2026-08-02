# MiracleTourney overnight MVP execution design

Date: 2026-08-01
Branch: `codex/miracle-mvp`
Scope: overnight execution design for launch-week MVP stabilization

## Summary

This design defines the overnight execution scope for MiracleTourney so the team can move quickly without losing focus. The goal is not to finish the entire long-term platform. The goal is to finish the highest-value launch work in one sustained push, with minimal manual checking from the user.

The overnight push will target a balanced outcome:

- admin operations become materially usable for live event management
- public pages become clear enough to present real events to visitors
- testing becomes more agent-driven and less dependent on repeated user-side manual verification

This design also formalizes a small reusable core agent team that stays active across the overnight sprint instead of repeatedly spawning new agents for each micro-task.

## Overnight goal

By the end of the overnight sprint, the app should be able to support a realistic admin workflow for:

- creating and publishing events
- importing participants from CSV
- viewing participants publicly
- running bracket progression correctly for single elimination
- recording match outcomes in admin
- reflecting those outcomes in the public bracket

At the same time, the public event surface should be clear enough that a visitor can immediately understand:

- which event they are viewing
- which game it belongs to
- whether it is live, ongoing, published, or finished
- where the event currently stands

## Core constraints

- source of truth repository is `E:\dev\MiracleTourney-gitnative`
- OneDrive workspace is no longer part of active execution
- this sprint remains on the current Next.js MVP foundation
- current demo-store architecture is acceptable for overnight implementation speed
- in-memory persistence is allowed during the sprint, but must be treated as an operational limitation
- registration remains CSV-driven for launch week

## Execution model

The overnight sprint will use one small persistent core team.

### Orchestrator

Responsibilities:

- prioritize work
- sequence parallel streams
- integrate outputs
- decide when something is good enough to merge into the active sprint baseline
- manage blockers and tradeoffs

This role stays with the main agent.

### Developer

Responsibilities:

- implement feature work
- focus on bracket progression, admin result entry, and public/admin UI changes

### Code reviewer

Responsibilities:

- review the highest-risk diffs
- look for regression and boundary problems
- check whether the changes still fit the MVP architecture

### Tester

Responsibilities:

- exercise browser flows
- validate public/admin smoke paths
- verify bracket behavior and import behavior in realistic scenarios

### Project manager

Responsibilities:

- keep task state visible
- track P0, P1, and blocked items
- maintain overnight release gates

## Resource strategy

To reduce waste, the overnight sprint will reuse the same agent identities for each role instead of spawning fresh agents repeatedly. Each role should retain its context across related work:

- one developer agent
- one reviewer agent
- one tester agent
- one PM agent

The orchestrator coordinates them, but remains the only source of final integration decisions.

## Priority scope

### P0: must land overnight

These items define whether the sprint succeeds.

#### 1. Single-elimination bracket advancement works

- bye winners automatically advance into the next round
- match winners automatically advance into the next round
- public bracket no longer leaves obvious downstream `TBD` entries when advancement is already known

#### 2. Admin can manage match outcomes

- admin can select an event
- admin can select or view bracket matches
- admin can enter match outcomes
- winner propagation updates the public bracket

#### 3. Public bracket stays synchronized with operations

- participants, bracket state, and public event views all reflect the same event state
- the bracket becomes operationally meaningful rather than presentational only

#### 4. Smoke-testable launch flow exists

At minimum, the team can verify:

- create event
- publish event
- import CSV
- see imported participants
- view bracket
- enter result
- observe advancement

### P1: should land if time holds

These items improve presentation and reduce launch friction, but do not outrank P0.

#### 1. Event media fields

- admin can set event logo URL
- admin can set game image or key art URL
- public event list and event detail can display these values or sensible placeholders

#### 2. Public surface polish

- event list cards are clearer and more recognizable
- event detail surface is more consistent
- bracket and participant pages get targeted readability improvements

#### 3. Copy and admin feedback polish

- admin errors are more readable
- labels and success states are clearer
- empty states better explain what is missing

### P2: explicitly out of scope for the overnight sprint

- production auth redesign
- captain self-service roster workflow
- full persistent operational backend
- advanced analytics
- deep tournament tooling beyond the current launch need
- exhaustive end-to-end regression breadth

## Workstreams

### Workstream A: tournament operations

Focus:

- bracket state model
- bye propagation
- winner propagation
- admin match result entry

This is the primary critical path.

### Workstream B: public presentation

Focus:

- event card clarity
- event media placeholders or URLs
- bracket readability
- event detail polish

This should not block Workstream A, but should run in parallel where possible.

### Workstream C: testing and release confidence

Focus:

- browser smoke runs
- bracket progression validation
- import validation regression
- admin/public cross-surface sanity checks

This workstream should continuously validate the outputs of A and B.

### Workstream D: overnight coordination

Focus:

- active checklist
- scope pressure decisions
- release gate status
- blocker escalation

## Testing dataset position

Testing datasets are a supporting workstream, not the center of the overnight sprint.

They exist to help:

- bracket advancement testing
- import realism
- smoke-test repeatability

The dataset effort should produce:

- one richer master CSV
- deterministic scenario CSVs for 8, 12, 16, and 24-team testing
- one Kuroko scenario file
- one short usage note

This work supports P0 and P1, but should not displace bracket/result-entry work.

## Operational limitations

The current demo-store architecture remains in-memory for this sprint. That means:

- server restarts may reset imported data and derived state
- testers must treat restart as a meaningful environment reset
- QA notes should distinguish between feature bugs and demo-store reset effects

This limitation is acceptable for the overnight implementation push, but it must remain visible in execution decisions.

## Release gates

The sprint is only considered successful if all of the following are true.

### P0 release gates

- bracket advancement from byes works
- bracket advancement from completed results works
- admin can input results for at least one single-elimination event
- public bracket reflects those outcomes
- CSV import still works after bracket/admin changes
- public event pages still load correctly

### Quality gates

- TypeScript check passes
- targeted smoke tests pass
- reviewer sign-off is completed on the highest-risk changes

### Usability gates

- public event list is understandable without explaining it verbally
- admin can discover the next operational action without guesswork

## Success criteria

The overnight sprint succeeds when the user no longer needs to repeatedly hand-verify whether bracket progression and event operations are wired correctly.

Instead, the system should provide:

- an understandable public surface
- an operationally meaningful admin flow
- a lightweight but repeatable internal test process

## Implementation direction

The next implementation plan should break work into concrete tasks for:

1. bracket advancement and propagation
2. admin result-entry UX
3. public bracket synchronization
4. event media/admin polish
5. testing dataset creation
6. reviewer and tester release passes

## Acceptance criteria

- P0 scope is explicitly represented in the implementation plan
- P1 scope is represented as secondary but still actionable work
- the plan uses a persistent core agent team model
- the plan treats datasets as supporting work, not the main workstream
- the plan assumes `E:\dev\MiracleTourney-gitnative` as the only active workspace
