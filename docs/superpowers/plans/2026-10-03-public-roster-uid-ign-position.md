# Public Roster UID IGN and Optional Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep the supplied public team-card interface and show UID, IGN, and assigned position in its roster dialog.

**Architecture:** Restore the existing focused directory from Git commit `5d5924a` into the approved current checkout, preserving the public shell and table fallback. Extract a roster presentation component and integrate the directory behind the existing adaptive-public-event flag. Continue using the existing event/team/player repositories.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind, Vitest, React DOM, browser verification.

## Global Constraints

- The visual and document order is UID, then IGN, then position.
- Empty or whitespace-only UIDs show **UID belum tersedia / UID unavailable**. Do not manufacture a UID from nickname or another field.
- Empty or whitespace-only positions and the existing parser sentinel `Unassigned` (case-insensitive after trimming) omit the position field entirely.
- Preserve the supplied team-card layout, with **Lihat roster (count)**, search, roster-status filtering, and pagination.
- Preserve Escape dismissal, focus trapping, and focus restoration. Long UID/IGN values must wrap at 390 pixels without horizontal overflow.
- Keep the existing search/filter semantics and page size of 12.
- Use the existing `adaptive_public_event_v3` flag for directory rendering, retaining the table fallback when disabled.
- Pass only public team identity, captain display name, and roster fields into the client directory.
- No deployment, database changes, registration-rule changes, organizer-preview changes, or tutorial-media work are included in this specification.
- Existing unrelated working-tree changes must be preserved. Work in the current checkout as approved by the user; do not merge another branch.

## Task 1: Public participant directory and roster presentation

**Files:**
- Create: `src/components/v3/public-event/PublicParticipantRoster.tsx`
- Create: `src/components/v3/public-event/PublicParticipantRoster.test.tsx`
- Restore and modify: `src/components/v3/public-event/PublicParticipantsDirectory.tsx`
- Create: `src/components/v3/public-event/PublicParticipantsDirectory.test.tsx`
- Modify: `src/app/events/[slug]/participants/participants-page.tsx`
- Create: `src/app/events/[slug]/participants/participants-page.test.tsx`

**Interfaces:**
- Consumes repository players with `id`, `nickname`, `displayName`, and `position` (strings), plus existing team identity and captain-display helper.
- Produces `PublicParticipantRoster({ players, locale })`, where `players: Array<{ id: string; nickname: string; displayName: string; position: string }>` and `locale: "id" | "en"`.
- Directory keeps its existing `PublicParticipantTeam` and `PublicParticipantsDirectory({ teams, locale })` interfaces.
- Page keeps `renderParticipantsPage(slug: string, locale?: "id" | "en")`.

- [x] **Step 1: Write behavior tests first.** Use real React DOM server markup for roster formatting and jsdom/React `act` for directory interactions. Use narrow mocks for page repositories/translations/feature flag. Check ordered labels and values, missing UID, empty position, whitespace position, `Unassigned`, Indonesian and English, empty roster, privacy mapping, flag-on directory and flag-off fallback. Use fixtures containing private contact/email properties and assert they are absent from rendered output and directory props.

```tsx
const players = [{ id: "p1", displayName: "UID-123", nickname: "Player11", position: "Forward" }];
const html = renderToStaticMarkup(<PublicParticipantRoster players={players} locale="id" />);
expect(html.indexOf("UID-123")).toBeLessThan(html.indexOf("Player11"));
expect(html.indexOf("Player11")).toBeLessThan(html.indexOf("Forward"));
expect(html).toContain("Posisi");
```

- [x] **Step 2: Verify red.** Run `pnpm exec vitest run src/components/v3/public-event/PublicParticipantRoster.test.tsx src/components/v3/public-event/PublicParticipantsDirectory.test.tsx 'src/app/events/[slug]/participants/participants-page.test.tsx'`. Confirm missing component/directory and missing page integration cause failure before production edits. After restoring the known directory, verify at least one test reaches a behavioral assertion and fails on the old roster rendering before changing it.
- [x] **Step 3: Restore only the known directory.** Obtain its exact source using `git show 5d5924a:src/components/v3/public-event/PublicParticipantsDirectory.tsx`. Preserve search, filter, page size, dialog header, and focus management. Replace the dialog's old player list with `<PublicParticipantRoster players={selected.players} locale={locale} />`. Keep its existing empty-roster message in the focused component.
- [x] **Step 4: Implement the focused roster.** Render a semantic list and labeled definition-list fields. Use `min-w-0`, wrapping for long values, and a responsive grid. Hide the position field according to the constraints and localize the labels/fallback copy with the directory's existing `locale` pattern.

```tsx
const position = player.position.trim();
const assigned = position !== "" && position.toLowerCase() !== "unassigned";
// Per player: UID field, IGN field, then assigned ? position field : null.
```

- [x] **Step 5: Integrate in the current participant page.** Import `isFeatureEnabled` and `PublicParticipantsDirectory`. Build an explicit safe view model and choose directory or existing table under the flag inside the current Section. Keep locale fallback `"id"`, missing-event handling, repository calls, and navigation unchanged.

```tsx
const directoryTeams = teamsWithPlayers.map((team) => ({
  id: team.id, name: team.name, tag: team.tag, captain: getCaptainDisplayName(team),
  players: team.players.map(({ id, nickname, displayName, position }) => ({ id, nickname, displayName, position })),
}));
```

- [x] **Step 6: Verify green and type safety.** Run the three focused test files and `pnpm exec tsc --noEmit`. Interaction tests must open a roster, observe its UID/IGN/optional-position content, close by Escape and restore focus, verify Tab trapping, and exercise search/filter/pagination. Report unrelated baseline failures separately rather than modifying unrelated files.
- [x] **Step 7: Browser verification.** Use an isolated local fixture harness of the actual directory component with dummy identities, a long UID and IGN, an unassigned position, and more than 12 teams. Check at desktop and 390-pixel widths. Open the dialog and verify UID, IGN, position behavior, close/Escape focus restoration, search/filter/pagination, and page/dialog scroll widths. Save a screenshot as evidence. The harness must not connect to production data or mutate the app database; keep it in this plan's ignored scratch workspace.
- [x] **Step 8: Review and commit only task files.** Self-review, then task review for spec compliance and quality. Stage only the six source/test files plus the approved spec and plan, after verification; commit with `feat: show UID IGN and optional position in public rosters`. Do not push or deploy.

## Plan Review

Coverage: roster order and missing values (Steps 1, 4), public privacy and feature flag (Steps 1, 5), screenshot directory behavior (Steps 3, 6), phone wrapping and visual proof (Step 7), unrelated-work preservation and review (Step 8). One integrated deliverable; no independent media or backend task.


## Execution Results

Completed on 2026-10-03. Focused tests: 16 passed. Full suite: 129 files, 1054 tests passed. TypeScript and scoped whitespace checks passed. Actual component browser checks passed at desktop and 390-pixel phone widths, including long UID/IGN wrapping, search, filter, pagination, Tab trapping, and focus restoration. Task and final reviews found no issues. Preview screenshots are saved under outputs/public-roster-uid-ign-position/. No deployment was performed.

## Transfer to the Requested Public V3 Branch

The user subsequently requested committing and pushing to `codex/public-event-overview-v3`. This branch already contains the participant directory, public-only player mapping, and `PublicV3DetailFrame`. Preserve its participant-page implementation unchanged; transfer the roster helper, dialog integration, and tests. The page tests cover adaptive directory and table fallback with `ui_v3_foundation` both enabled and disabled. The original execution results above describe the integration checkout; branch-transfer verification is recorded separately before push.

Branch-transfer verification: 18 focused tests passed and TypeScript passed. The target full suite recorded 2660 passed, 13 failed, and 6 skipped tests. All 13 failures were reproduced in the same four static competition suites on a pristine archive of pre-transfer commit `2e876f3`; they are existing branch failures outside this roster change. The unrelated modified operations document was excluded from staging.
