# Public Roster: UID, IGN, and Optional Position

Date: 2026-10-03
Status: The user approved retaining the supplied team-card interface. Written specification awaits user review.

## Goal

On the public event participants page, visitors open a team's existing **Lihat roster / View roster** dialog and see each player's **UID, IGN, and optional position**, in that order. The supplied screenshot is the visual reference for the surrounding team-card interface.

Reference route: `https://miracle-tourney-fw1sq6cyb-miracle25.vercel.app/id/events/flashpeak-rising-64/participants`.

## Verified Project Context

The current checkout, `integration/miracle-v3-local`, renders a participant table in `src/app/events/[slug]/participants/participants-page.tsx`. The interface matching the screenshot exists in Git history at commit `5d5924a`, in `src/components/v3/public-event/PublicParticipantsDirectory.tsx`, on the public-event V3 branches. It uses a roster dialog rather than an inline accordion.

That directory already receives `Player.displayName`, `Player.nickname`, and `Player.position`. Its current player presentation leads with nickname and follows with displayName and position separated by a dot. Its search already includes those player fields. The supplied preview redirects the agent's browser to Vercel login, so live behavior has not been independently inspected.

This specification replaces the public roster presentation proposed in Task 1 of `docs/superpowers/plans/2026-10-03-public-player-uid-and-episode-02.md`. The current request covers the public participants UI only; organizer import previews and tutorial recordings belong to the earlier, separate plan.

## Chosen Interface

Preserve the supplied team-card layout, with **Lihat roster (count)**, search, roster-status filtering, and pagination. Preserve the dialog's team heading, close button, Escape dismissal, focus trapping, and focus restoration to the initiating button.

Inside the dialog, show one readable row or card per player:

- **UID:** the exact stored `displayName` value.
- **IGN:** the exact stored `nickname` value.
- **Posisi / Position:** the stored position, only when assigned.

The visual and document order is UID, then IGN, then position. At wider widths, the fields can share a row. At phone widths, fields wrap or stack with explicit labels. Long UIDs and IGNs wrap inside the dialog without horizontal page scrolling. Reuse existing colors, typography, borders, and spacing tokens.

Empty or whitespace-only UIDs show **UID belum tersedia / UID unavailable**. Do not manufacture a UID from nickname or another field. Empty or whitespace-only positions and the existing parser sentinel `Unassigned` (case-insensitive after trimming) omit the position field entirely. Do not leave a dangling separator or render the literal word `optional`.

Retain the existing empty-roster message. Keep the existing search/filter semantics and page size of 12. This change does not add search controls or alter roster completion rules.

## Data and Integration

Continue loading the public event, teams, and players through `getPublicEventBySlug`, `getTeamsForEvent`, and `getPlayersForTeams`. The presentation uses existing player values without schema, parser, registration, or persistence changes.

The roster presentation should be a small focused component consumed by `PublicParticipantsDirectory`, so its field ordering, missing values, and optional-position behavior can be verified without opening the dialog in server-rendered markup tests.

In the current checkout, restore only the focused directory component and its participant-page integration from the known V3 implementation, then apply the roster change. Use the existing `adaptive_public_event_v3` flag for directory rendering, retaining the table fallback when disabled. Do not merge the entire other branch or replace the current public shell. On a checkout where the directory already exists, modify that component in place.

Pass only public team identity, captain display name, and roster fields into the client directory. Captain contact, email, payment data, and credentials must not appear in public output.

## Verification

- Focused presentation tests check UID before IGN before position, all players retained, unavailable UID copy, and omission of empty/whitespace/Unassigned positions in Indonesian and English.
- Participant-page tests check safe player-field mapping and directory rendering under the existing feature flag, plus preservation of the table fallback.
- Browser verification opens a team roster, closes it with Escape, and checks focus restoration. Check search, roster filtering, and pagination continue to work.
- At a 390-pixel phone viewport, verify long UID/IGN values wrap and the dialog and page do not overflow horizontally.
- Run the focused tests and TypeScript checks. Report any existing unrelated failures separately.

## Scope Limits

No deployment, database changes, registration-rule changes, organizer-preview changes, or tutorial-media work are included in this specification. Existing unrelated working-tree changes must be preserved. Do not claim the supplied preview is updated until a deployment is explicitly requested and verified.
