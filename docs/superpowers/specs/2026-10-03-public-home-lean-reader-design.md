# Narrow public homepage reader

Approved by the human: “oke gas”, after the proposal to fetch only homepage-visible data while retaining public publication and security rules.

## Goal and scope

Keep the homepage visually and semantically unchanged while removing detail-page overfetch. Discovery JOIN stays in place. The observed cold /id response was 7,327.501ms; discovery consumed 1,713ms. Source confirms duplicate event/announcement/team reads and unused statistics/schedule detail. The remaining duration is not measured per stage, so no sub-3s claim is justified yet.

## Architecture

Add readPublicHomeFeaturedEvent(slug, now?) returning a narrow PublicHomeFeaturedEvent union, not a fabricated full PublicV3EventViewModel. Shared identity/facts/navigation/status projection must be reused rather than copied. Only homepage consumers change their accepted type; full event readers keep their existing interface and behavior.

For an authoritative Ongoing event, read joined event/public identity, active first phase, relevant ordered matches and public team names/count in RepeatableRead. Read the current published schedule revision using the event version from the same snapshot. Target at most two application data queries; transaction control may add network trips. Do not read players, player statistics, announcements, historical revisions, complete leaderboards or standings unused by homepage. Preserve graph/event checks, exact live/next/recent ordering, official-score masking and schedule publication rules.

Other lifecycles and compatibility/flags-off behavior use the existing full reader followed by a pure narrow projection in this patch. This preserves their current contracts without redesigning every phase. A concurrent lifecycle change must fail safely or use the existing reader, never expose private data. No new cache/stale fallback, permissive marker or changed timeout.

## Presentation and privacy

Preserve ID/EN labels, hero identity/poster/facts, organizer name/verification, participant counts, registration CTA and safe login returnTo, navigation enablement/targets, phase highlight, Event Pulse next match or champion, and shortcuts. Private/deleted events return null. Public errors and logs remain safe. Shared components continue accepting existing full views through structural compatibility where used elsewhere.

## Evidence and rollout

TDD covers the narrow reader query count and real projections/rendering, official and unofficial results, delayed/scheduled ordering, phase/event mismatch, missing graph/revision, private status, lifecycle fallback, flags-off and both locales. Tests must show no calls to removed detail readers on the successful Ongoing fast path.

Run affected tests, TypeScript, changed-file ESLint and diff hygiene; fresh task-scoped spec/quality review before normal push. Controller runs one homepage-only CI verification with existing guarded no-reset fixtures. Keep strict p95 <3,000ms and zero failures; a cold single request is not load p95. Full public E2E and production migration/recovery remain separate unresolved gates.

## Boundaries

No raw SQL, cursor, migration, dependency upgrade, seed/reset, production change, full-app shards or full-public suite in this correction. Preserve unrelated roster commits ac6cc7e and 2901df6 already present in the candidate. Code rollback restores the previous homepage reader; database recovery is not needed for this patch.
