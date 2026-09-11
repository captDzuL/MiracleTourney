# CI E2E Stabilization Design

## Goal

Restore the `feature/ui/adaptive-public-event-v3` CI E2E suite after the Miracle V3 integration without weakening the user-facing behavior that the tests protect.

## Confirmed root causes

1. Registration import now requires captain IGN and captain UID mappings, while legacy E2E CSV builders and `late-import-after-lock.csv` still use the older header schema.
2. The organizer lifecycle test assumes the entire event editor is visible at once. The shipped editor is now a five-step wizard, so readiness and schedule controls are not present until their steps are selected.
3. `EventWorkspaceShell` forces the step navigation to a `42rem` minimum width. This creates real descendant overflow at a 360px viewport despite the scroll container.
4. The published event page intentionally renders the event description in more than one public section. An unscoped Playwright text locator therefore violates strict mode.
5. CI reported a missing `next-intl` context. The warning has not reproduced in the focused local run, so the locale-aware not-found path must be reproduced independently before changing production behavior.

## Design

### Registration fixtures

Update the affected CSV headers and rows to include explicit `captain_ign` and `captain_uid` values. Keep the existing team, contact, and player data so the tests continue exercising the same import, bracket-lock, and match flows under the current registration contract.

### Organizer lifecycle test

Drive the real wizard through its navigation links. Assert the initial incomplete readiness on the review step, then visit identity, format/schedule, and registration to fill required values using the visible Indonesian labels. Return to review before asserting ready, preview, revoke, and publish behavior.

### Mobile workspace navigation

Use a mobile-first five-column stepper that fits the viewport. Preserve the numbered targets at a minimum 44px interaction size, hide the long text labels visually on narrow screens, and restore the full label layout at the existing 700px breakpoint. Do not introduce a separate mobile component or horizontal scrolling.

### Published revision assertion

Scope the original public-description assertion to the primary page content and select the first visible occurrence. Continue asserting that the private updated description is absent from the public page until publication.

### Intl context investigation

Exercise revoked preview and unknown localized routes after the earlier failures no longer stop the suite. If the provider error reproduces, add a failing regression test for that route and make the not-found boundary independent of unavailable client context. If it does not reproduce, leave production localization code unchanged and report the warning separately.

## Verification

1. Run the affected registration-import E2E tests and fixtures.
2. Run both V3 organizer lifecycle and published revision specs.
3. Run the complete unit suite, typecheck, and all 52 Playwright E2E tests against the isolated test database.
4. Confirm the worktree is clean after committing and push the fix to `origin/feature/ui/adaptive-public-event-v3`.

## Non-goals

- Do not loosen captain identity requirements.
- Do not suppress genuine viewport overflow in the test.
- Do not change event publication or revision semantics.
- Do not modify unrelated worktrees, stashes, or generated CI artifacts.
