# Task 10 Report — Announcements, Settings, and Certificate Studio UX

Status: CODE_COMPLETE / REMOTE_E2E_PENDING
Date: 2026-09-16 Asia/Jakarta
Branch: feat/organizer-master-workspace-continuation
Base: f7f900c

## Implemented

- Added locale-aware event Announcements and Settings routes inside the canonical organizer workspace shell.
- Announcements use the authoritative competition mutation boundary, CAS version receipts, idempotency keys, audit history, and structured conflict/error feedback.
- Announcement writes remain available after tournament completion while unrelated competitive writes remain locked.
- Dirty announcement edits survive authoritative refreshes after a conflict, keep publication locked, and clear only after a successful save.
- Announcement controls remain disabled for the full unresolved server-action lifetime to prevent duplicate re-entrant writes.
- Settings delegates to the existing event editor, publication, and contact ownership boundaries instead of duplicating the event wizard.
- Certificate Studio keeps all seven recipient/version states visible, selects the latest generated version after refresh, and preserves safe publication against the selected ready set.
- Certificate Studio uses compact collapsible history/assets panels, a desktop sticky preview, bounded mobile geometry, reachable primary actions, and 44px minimum interactive targets.
- English and Indonesian copy remain in parity.

## TDD and Review Evidence

- Final focused Task 10 suite: 6 files / 105 tests passed.
- Review fix RED/GREEN 1: conflict followed by authoritative refresh unlocked publication while the uncontrolled local edit remained visible; the regression now preserves dirty state and the publish lock.
- Review fix RED/GREEN 2: Certificate Studio disclosure summaries were below the 44px target; both summaries now enforce the minimum target.
- Review fix RED/GREEN 3: announcement controls became active before an unresolved action settled; the React transition now awaits the mutation and the regression verifies disabled and re-enabled states.
- TypeScript `tsc --noEmit`: exit 0.
- Prisma schema validation with a non-production placeholder URL: exit 0.
- Production build with a 4 GB Node heap: compiled, type-valid, and generated 46/46 static pages. The placeholder PostgreSQL endpoint was intentionally unavailable and the documented fallback path completed.
- `git diff --check`: exit 0.
- Broad local Edge no-DB smoke: 23 passed, 9 intentional DB-dependent skips, and 1 public-shell mobile keyboard-navigation failure outside the Task 10 diff. An isolated clean-server rerun of that exact case passed 1/1, so it is recorded as a flaky baseline smoke result rather than hidden.
- Independent GPT-5.6 Sol/high review found and rechecked the conflict-refresh, target-size, geometry, and unresolved-action defects.
- Final Sol/high convergence review: APPROVED with no CRITICAL or HIGH Task 10 findings.

## Remaining Remote Gate

Local evidence is labeled LOCAL_NO_DB. The committed Playwright geometry coverage checks 390px and 1440x900 viewports, horizontal overflow, 44px visible controls, desktop sticky behavior during scroll, mobile non-sticky behavior, and primary-action reachability. It cannot run through the production route locally because global setup and route warming require PostgreSQL, which is blocked by the current network.

The GitHub Actions PostgreSQL service-container gate in Task 11 must still prove authenticated ownership, durable announcement persistence and audit behavior, transaction interleaving, certificate regeneration/version selection, publication, and the new geometry assertions. Release status remains BLOCKED until that remote DB suite is green.