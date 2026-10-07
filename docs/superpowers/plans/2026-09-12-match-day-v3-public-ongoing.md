# Match Day V3 + Adaptive Public Event Ongoing Implementation Plan

**Goal:** Deliver format-aware competition operations for organizers and an authoritative ongoing public event experience while keeping Captain UI and finished recap out of scope.

**Branch:** `feature/ui/match-day-v3`

**Global constraints:**

- Gate all new organizer operations behind `competition_operations_v3` and ongoing public rendering behind both `competition_operations_v3` and `adaptive_public_event_v3`.
- Preserve legacy behavior and `scheduledLabel` when flags are disabled or legacy data cannot be upgraded safely.
- Support Single Elimination, Double Elimination, Round Robin, and Group + Playoffs end to end.
- Official match results drive advancement and standings atomically; player statistics remain independent and never block progression.
- Schedule generation and recalculation always create a draft. Only an explicit organizer publish makes a revision visible publicly.
- Readiness supports `ORGANIZER` and future `CAPTAIN` actors, but this milestone has no Captain UI.
- Public status is authoritative: time alone never creates a `LIVE` label.
- Use adaptive polling, not WebSocket or SSE.
- Use strict TDD for every production behavior and keep migrations additive.

## Task 1: Add the additive competition operations persistence foundation

Extend Prisma with phases, groups, group members, match dependencies, readiness, result revisions, action items, incidents, audit logs, schedule revisions, and event announcements. Extend Event, Team, User, and Match relations plus structured schedule/result fields. Keep legacy fields intact. Add one additive SQL migration and schema-level tests that fail before the schema change, then pass after Prisma validation and generation.

Required states:

- Phase: draft, active, completed.
- Schedule: estimated, confirmed, locked, delayed, live, completed, postponed.
- Readiness: pending, checked_in, ready, not_ready.
- Readiness actor: organizer, captain.
- Action priority: critical, urgent, attention_soon.
- Announcement: draft, published.

Match dependencies must represent HOME/AWAY slots fed by WINNER/LOSER outcomes. Result revisions must keep immutable score snapshots, actor, reason, and monotonically increasing version. Schedule revisions must distinguish draft from published state.

## Task 2: Build deterministic competition graph engines for all four formats

Create a typed graph model shared by all formats and generators for Single Elimination, Double Elimination, Round Robin, and Group + Playoffs. Use the existing v1 format config as the source of truth. Cover seeding, byes, winner/loser dependencies, double-elimination lower bracket, configured round-robin legs and points, group allocation, qualification cutlines, and playoff placeholder dependencies.

The same inputs must produce stable match and dependency identifiers. Reject invalid seed/team counts. Graph regeneration is allowed only before an official result exists. Add literal-fixture unit tests for each graph, including odd team counts, byes, two round-robin legs, and both single- and double-elimination playoffs.

## Task 3: Implement deterministic schedule planning and recalculation

Create a pure scheduler that accepts timezone, event window, match duration, buffer, rooms, minimum rest, dependencies, existing assignments, manual overrides, and locks. It must never double-book a team or room, schedule before dependencies, or move a lock. Optimize rest, total delay, room balance, reduced room switching, and minimal churn from an existing schedule.

Return a draft schedule with assignments, explicit conflicts, affected matches, and constraint warnings. Recalculation must traverse only downstream unlocked matches that are not live or completed. Group playoff matches may be scheduled as TBD participants. Add unit tests for all hard constraints, stable output, delay impact, locked matches, simultaneous rooms, lower-bracket rest, and impossible schedules.

## Task 4: Add competition operation services for schedule, readiness, actions, incidents, audit, and announcements

Create authenticated organizer services/repository operations to initialize a competition, save a schedule draft, publish a schedule revision, mark delay/postponement, update readiness, start a match, manage incidents, and publish/unpublish announcements. Ownership or Platform Admin authorization is mandatory.

All writes use idempotency keys and optimistic versions. Readiness deadline breaches create deduplicated critical action items and never auto-award a walkover. Overrides require a reason and audit entry. Publishing copies only the selected draft revision into the public schedule state. Add transaction-focused tests for authorization, idempotency, conflicts, deduplication, audit records, and draft-versus-published visibility.

## Task 5: Add atomic official result submission and guarded correction

Implement official result submission as one database transaction: validate best-of and expected version, append an immutable result revision, complete the match, determine winner/loser, resolve dependency slots, update standings/qualification, recalculate affected schedule draft, update action items, and append audit records.

Retries with the same idempotency key must return the committed result without duplicate advancement. Stale versions must fail as conflicts. Correction requires reason and impact preview; block it when a dependent match is live or completed. Allowed corrections append a new revision and atomically update all affected competition projections. Player statistics remain unchanged and unpublished statistics never enter public results. Add tests for rollback, retry, stale writes, every format's advancement, group qualification, and correction safety.

## Task 6: Build the Organizer Match Day V3 workspace

Add organizer routes/views for competition overview, schedule, match control, and match detail using existing V3 shell patterns. Provide action queue, live/next/delayed groupings, format-aware bracket or standings context, schedule generation preview, room/time overrides, locks, impact preview, explicit publish, readiness controls, start/postpone, official score entry, correction preview, incidents, announcements, and audit history.

Mutations must revalidate immediately. Poll organizer read state every 5 seconds while live/delayed and 15 seconds when stable, pause while hidden, refresh on focus, and back off after failures. Include loading, empty, conflict, retry, unauthorized, and partial-failure states. Preserve the legacy admin Match Day when the feature flag is off. Add component/page tests for Indonesian and English, desktop and mobile behavior, accessibility names, and mutation conflicts.

## Task 7: Add Adaptive Public Event Ongoing

Extend the adaptive public view model to a discriminated union with `registration` and `ongoing` modes. Keep Finished on the legacy renderer. At the canonical localized event URL, render Ongoing only when event status is Ongoing and both flags are enabled.

The sanitized ongoing read model must include authoritative live matches, next matches, recent official results, published schedule changes, format-aware bracket or standings context, group qualification cutlines, leaderboard access, active published announcements, stream data, state version, and last-updated time. It must exclude draft schedules, incidents, readiness internals, audit data, and unpublished statistics.

Poll every 10 seconds while live/delayed and 30 seconds when stable, pause while hidden, refresh on focus, use ETag/state version, retain last good data on error, and apply exponential backoff. Add tests for no-live state, simultaneous rooms, delayed matches, correction updates, TBD playoff participants, announcements, hidden drafts, unpublished stats, legacy fallback, localization, accessibility, and responsive layout.

## Task 8: Seed, compatibility, E2E, and release hardening

Add deterministic test fixtures covering all four formats, published/draft schedules, readiness, live matches, corrections, and public announcements. Upgrade representable legacy Single Elimination and League events without overwriting results; leave unsafe data on legacy rendering with a visible organizer diagnostic.

Add E2E stories for:

- Generate, review, and publish an initial schedule.
- Apply a delay, inspect impact, and publish the revision.
- Readiness and organizer override without auto-walkover.
- Submit official results and observe advancement for all four formats.
- Correct an allowed result and reject a dangerous correction.
- Observe the same official state on Organizer Match Day and Public Ongoing.
- Verify flags-off legacy behavior.

Run Prisma validation/generation, typecheck, the full unit suite, targeted E2E, and the existing full E2E suite. Review the complete branch diff before completion. Do not push until the user asks.
