# Miracle Tourney Production Bug Log for Claude

Last updated: 2026-08-16

This is the current product bug/issue list found from recent production/beta usage. Claude should use this as the working technical backlog before proposing fixes or implementation plans.

## Priority Themes

- Admin mutations need clear pending/success/error feedback.
- CSV import needs pre-validation and row-level errors before database insert.
- Team captain display should resolve from `captainName` or the linked captain user.
- Registration and CSV import need shared abuse, profanity, duplicate, and contact validation.
- Admin needs safe cleanup tools for beta/test data.

## Bugs and Issues

### 1. Loading and mutations feel stuck

- Symptom: Changing event status looks like it does not load or finish.
- Symptom: CSV upload can look silent or failed without clear feedback.
- Observed behavior: Data may actually change, but the user only notices after a manual reload.
- Expected behavior:
  - Every admin mutation should show an immediate pending state.
  - Success and failure should be visible without requiring reload.
  - Forms should not allow accidental double submit while pending.
- Likely affected areas:
  - `src/app/admin/page.tsx`
  - `src/lib/actions.ts`
  - Admin status forms
  - CSV import form

### 2. CSV upload error handling is unclear

- Symptom: If CSV import fails because of duplicate `team_name` or `team_tag`, the user does not get an informative error.
- Expected behavior:
  - Show the row number.
  - Show the field that failed.
  - Show the reason in admin-friendly language.
- Database constraints involved:
  - `Team(eventId, name)` unique
  - `Team(eventId, tag)` unique
- Likely affected areas:
  - `src/lib/imports/team-import.ts`
  - `src/lib/platform/repository.ts`
  - CSV import server action in `src/lib/actions.ts`

### 3. CSV duplicate validation has no pre-check

- Symptom: CSV file can contain duplicate team names in the same event.
- Example: `AVOID CITY` appears twice with different tags. Import still fails because team name must be unique inside the event.
- Expected behavior:
  - Validate duplicates inside the uploaded file before insert.
  - Validate duplicates against existing teams before insert.
  - Return all duplicate errors in one row-by-row report.
- Required checks:
  - Duplicate normalized `team_name` per event.
  - Duplicate normalized `team_tag` per event.
  - Duplicate against existing database teams for that event.

### 4. Captain name does not automatically display

- Symptom: Registration flow fills `captainId`, but `captainName` can remain `null`.
- Current UI problem: Participant UI reads `captainName`, so it shows `Belum Ditugaskan` even when a captain user is linked.
- Expected behavior:
  - Participant display should use the linked captain user when `captainName` is missing.
- Required fallback:

```ts
team.captainName ?? team.captain?.name ?? "Belum Ditugaskan"
```

- Likely affected areas:
  - Participant/public team display components
  - Team query include/select shape
  - Registration flow that creates/links captain user

### 5. No fallback from `captainId` to user data

- Symptom: The data model has a captain relationship, but display code does not consistently use it.
- Expected behavior:
  - Any UI showing captain name should resolve in this order:
    1. `team.captainName`
    2. linked `team.captain.name`
    3. `"Belum Ditugaskan"`
- Implementation note:
  - Repository/query functions may need to include the captain relation or map a display field.
  - Prefer one shared helper/mapper if multiple pages render captain names.

### 6. No captain selection/assignment UI

- Symptom: There is no dropdown/select to assign or change a captain from captain/admin pages.
- Current workaround: Captain assignment happens automatically from CSV/register or manually in DB.
- Expected behavior:
  - Admin can safely assign/change a team captain from the UI.
  - Ideally captain page only exposes self-owned safe actions, while admin manages assignment.
- Product decision needed:
  - Whether assignment should support existing users only, invite-by-email, or both.

### 7. Registration abuse/spam is not filtered

- Symptom: Inappropriate user/team data can enter through normal registration.
- Expected behavior for beta:
  - Prevent obvious abuse before data is saved.
  - Return clear, non-inflammatory validation messages.
  - Keep an audit trail or enough context for admins to cleanup.
- Likely affected areas:
  - `src/app/register`
  - Registration server action in `src/lib/actions.ts`
  - Validation utilities shared with CSV import

### 8. Profanity filter is missing

- Required fields:
  - `team_name`
  - `team_tag`
  - `captain_name`
  - player `displayName` / nickname if present
- Expected behavior:
  - Block known offensive words and variants.
  - Apply the same validation to register and CSV import.
  - Return row-level errors for CSV and field-level errors for register.
- Implementation note:
  - Centralize this in a shared validation module so CSV and register cannot drift.

### 9. Email validation is not enough

- Required improvements:
  - Detect suspicious/disposable email addresses.
  - Add blocklist support for email addresses and domains.
  - Rate limit registration attempts.
- Expected behavior:
  - Reject blocked or suspicious email/contact values before creating user/team records.
  - Keep error messages clear without exposing too much anti-abuse logic.
- Likely affected areas:
  - Registration action
  - Captain account creation
  - CSV contact/email validation
  - Middleware or action-level rate limiting

### 10. CSV import does not apply the same validation as register

- Missing shared checks:
  - Profanity check
  - Duplicate check
  - Email/contact validation
  - Row-by-row error report
- Expected behavior:
  - CSV and normal registration should enforce the same core data quality rules.
  - CSV import should report every row error possible before writing anything.
  - If any row fails, reject the entire file and make the admin fix once.
- Implementation note:
  - Build or reuse a shared team registration validation pipeline.

### 11. Captain forgot/reset password flow is not proper

- Symptom: There is no complete forgot password flow for captains.
- Open question: Temporary password delivery is unclear.
- Related issue: Manual/temp password reset has previously caused login problems.
- Expected behavior:
  - Provide a reliable captain password reset flow.
  - Decide whether delivery is email, admin-generated one-time password, or another beta-safe manual process.
  - Ensure temp/reset passwords work with login immediately and require safe rotation if needed.
- Likely affected areas:
  - `src/app/login`
  - `src/app/captain/settings`
  - Auth/session functions
  - User password repository functions

### 12. Admin delete/cleanup UI is missing

- Symptom: Test/bad data had to be deleted directly from the database.
- Needed for beta:
  - Delete team
  - Delete event
  - Delete user or deactivate user
- Expected behavior:
  - Admin UI provides safe cleanup actions for draft/test data.
  - Destructive actions require confirmation.
  - Deletion should respect relational safety and avoid breaking real tournament history.
- Recommended constraints:
  - Allow hard delete for draft/test data.
  - Prefer archive/deactivate for events/users with real match history.
  - Platform admin only for user deletion/deactivation.

## Suggested Implementation Order

1. Add clear mutation pending/success/error feedback for status change and CSV import.
2. Create shared validation for team registration data.
3. Add CSV pre-checks for duplicate names/tags and row-level error reporting.
4. Add captain display fallback from `captainId`/linked user.
5. Add profanity, disposable email/domain blocklist, and registration rate limiting.
6. Add admin captain assignment UI.
7. Add beta-safe admin cleanup UI.
8. Design and implement captain forgot/reset password flow.

## Claude Guidance

- Do not jump straight to database writes. Start by adding failing tests around the exact user-facing behavior.
- Prefer one shared validation path for register and CSV import.
- Preserve all-or-nothing CSV import: if any row is invalid, reject the whole file.
- For cleanup/delete actions, protect real production data first. Use confirmations and role checks.
- Use Indonesian UI copy where the existing admin/public surface is Indonesian.
