# Bracket Social V3 — verification and rollout
Date: 2026-10-04–2026-10-05

Implemented in the isolated `codex/bracket-social-v3` worktree from `894ad59`. The parent checkout was kept intact.

## Delivered behavior
- V3 Montserrat and navy/cyan/violet/cream presentation, two solid team slots, ID-based logo/initials, visible scores, explicit match connections, localized statuses and details.
- Official champion from decisive title results or a complete untied official league projection, with a top summary and cream panel near the final.
- Organizer background upload, local preview, horizontal/vertical position, dark overlay, save/reset and error feedback. Appearance is separate from the event poster.
- Shared bracket markup and layout for full/per-round PNG, public-data filtering, owner-only watermarked previews, bounded dimensions and controlled image loading.
- Additive EventBracketAppearance migration prepared.

## Browser evidence
The real Next application was inspected through the in-app browser at 390, 768 and 1440 px using the development-only `/[locale]/bracket-design-preview` fixture. The fixture is blocked outside development and reads no database.
- ID/EN headings, match status, source placeholders and champion labels were visible.
- At 390 px the document width was 375 px (no page overflow). The final champion panel is 272 px wide, ending at x=324 within the scrollport ending at x=327; both rounded corners are visible. Round switching, live semifinals, waiting final slots and BO5 details worked.
- Changing an unsaved slider disables both PNG buttons and shows the save-first hint; round selection still works. Returning to the saved value re-enables the buttons.
- A real local PNG was selected through the file chooser. Horizontal position 100 and overlay 0 were reflected in both the editor preview and shared bracket.
- Saving without artwork confirmation showed a local validation message. A confirmed save in the unauthenticated demo received 401 and displayed the localized failure message without changing the saved appearance.
- The authenticated upload → save → public page → PNG database flow was not run: no test database/session is configured.

## Final checks
The four Important final-review findings are resolved and independently re-reviewed: legacy live/schedule states, unsaved-preview/export consistency, league full/per-round actions, and mobile champion clipping. The short PNG legend and trophy polish are also complete.

Fresh checks on the final source after its CSS adjustment:
- Complete Vitest suite: exit 0; 239 files passed, 2 skipped; 2,658 tests passed, 6 skipped.
- Next production build including TypeScript validation: exit 0. Dummy loopback database settings were used; static-page reads logged the expected unavailable database warning.
- ESLint for all changed TypeScript implementation/tests: exit 0; zero errors, one plain-image optimization warning for the editor's hidden local preview image probe.
- Git diff whitespace check: exit 0.
- PNG route trace: shared CSS and Montserrat 400/600/800 fonts included.

The controller opened and inspected actual full public (1110×948), selected-final (480×534), watermarked draft (1110×948), and custom-background (1110×948) PNG outputs. See [final fix report](2026-10-04-bracket-final-fixes.md) and [independent re-review](2026-10-04-bracket-final-rereview.md).

## Rollout
No database migration, seed, push, parent merge, or deployment was executed. Apply the additive migration through the normal deployment process before serving the new appearance reader. Validate the authenticated save/public/export flow on an isolated test event. PNG rendering uses the existing certificate Chromium setup: local PLAYWRIGHT_CHANNEL or the serverless CHROMIUM_PACK_URL configuration.

A failed appearance database save after an uploaded asset is recorded may leave an unused immutable asset; the final review classified cleanup as nonblocking follow-up work. Existing double elimination uses one grand final without a reset; the presentation follows the engine's current title placement.
