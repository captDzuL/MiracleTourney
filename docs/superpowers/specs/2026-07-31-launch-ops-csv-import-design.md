# MiracleTourney launch operations design

Date: 2026-07-31
Branch: `codex/miracle-mvp`
Scope: launch-focused MVP for the next live event week

## Summary

This design narrows the original Miracle FC League MVP into a launch-safe operating model for the next event week. Registration remains outside the app through Google Form. The web app becomes the public event hub plus an admin operations surface for importing teams from CSV, publishing event information, and attaching livestream coverage.

The launch goal is not to complete the full long-term product vision in one week. The launch goal is to make the site operational for the upcoming event with low risk, clear admin workflows, and public pages that stay fast and readable on mobile.

## Launch strategy

The app will ship with three product surfaces, but only two are on the critical path for launch:

- Public surface
  - event list
  - event detail
  - participants list
  - bracket or fixtures
  - standings
  - event-level livestream section
- Admin surface
  - create and manage events
  - upload registration CSV
  - validate import errors
  - import teams and PIC data
  - attach or update livestream metadata
- Captain surface
  - remains in the codebase as a future foundation
  - is not the registration path for this launch
  - roster self-service can follow after the site is stable live

This changes the operating model from “captains register directly in-app” to “admins publish registrations that were collected in Google Form.”

## Deployment and platform stance

For the upcoming event week, deployment remains:

- Next.js app on Vercel
- PostgreSQL on Neon

Docker is explicitly not required for this launch path. It may be added later as an optional local development convenience, but it is not part of the critical production path for the next event. This keeps deployment simple and aligned with the fastest route to production.

## Launch scope

### In scope

- public event hub pages for the active events
- participants pages driven by imported team data
- bracket or fixture generation from event teams
- standings display for league-format events
- event-level livestream presentation
- admin event creation and event management basics
- admin CSV upload for team import
- clear import validation and error reporting

### Out of scope for launch week

- self-service registration in the app
- roster import from CSV
- full captain invitation and provisioning workflow
- advanced production auth model
- complex result-entry workflows beyond what already exists
- advanced tournament admin tooling
- Docker-based deployment

## Operating workflow

### Registration workflow

1. Registration is collected in Google Form.
2. Admin exports the responses to CSV.
3. Admin uploads the CSV in the web admin panel.
4. The system validates the whole file before writing any records.
5. If validation passes, all teams are imported.
6. Public event pages reflect the updated participant list and tournament projections.

### Public event workflow

1. Public viewers browse current events.
2. Each event page shows core information, registered participants, bracket or fixtures, standings where applicable, and livestream coverage when enabled.
3. Draft or non-public events are not shown on public pages.

### Post-launch captain workflow

After the site is live and stable, PIC or captain accounts can be introduced so they can edit or complete rosters. This is a follow-on phase, not a launch blocker.

## CSV import design

### CSV shape

Each CSV row represents one team.

Required columns:

- `event_slug`
- `team_name`
- `captain_name`
- `captain_contact`

Optional columns:

- `team_tag`

If `team_tag` is empty, the system generates one automatically from the team name.

### Example CSV

```csv
event_slug,team_name,team_tag,captain_name,captain_contact
flashpeak-open-league,Miracle Wolves,MW,Riko Aida,08123456789
flashpeak-open-league,Thunder Street,TS,Dino,thunder@example.com
kuroko-summer-cup,Vortex,,Eko,08987654321
```

### Validation rules

The system validates the full file before importing anything.

Required checks:

- all required headers exist
- `event_slug` matches an existing event
- `team_name` is present
- `captain_name` is present
- `captain_contact` is present
- `team_name` is unique within the target event
  - both against existing stored teams
  - and against duplicates inside the CSV file itself

### Error behavior

The import is atomic:

- if any row fails validation, the entire file is rejected
- no partial writes are allowed

The UI must collect and display all detected validation errors in one pass so admins can fix the file once instead of iterating through one failure at a time.

Error messages should be written in admin-friendly language, for example:

- `Row 4: event_slug "flashpeak-open" was not found`
- `Row 7: team_name "Seirin" is already registered for event "kuroko-summer-cup"`
- `Row 9: captain_contact is required`

## System architecture for launch

The launch implementation should be split into clear units:

### 1. Public event surface

Responsible for rendering:

- event list
- event detail
- participants
- bracket or fixtures
- standings
- livestream

This unit is read-only and should consume already validated data.

### 2. Admin operations surface

Responsible for:

- event creation and basic management
- CSV upload
- import status and validation feedback
- livestream attachment and updates

This is the primary operations workflow for launch week.

### 3. Import pipeline

Responsible for:

- parsing CSV input
- validating all rows
- aggregating validation errors
- generating fallback team tags
- writing team and PIC records only if all rows pass

This unit should be isolated from UI concerns so it can be tested directly.

### 4. Tournament projection layer

Responsible for:

- generating brackets or fixtures from imported teams
- computing standings from event-scoped match data
- keeping projections clearly scoped per event

This unit must not mix data from multiple events that share the same game.

## Data model adjustments for launch

The persisted event participant record must support imported team-level data even before roster data exists.

Minimum launch participant fields:

- event reference
- team name
- team tag
- captain or PIC name
- captain or PIC contact

Player roster data remains optional and deferred until after launch.

## Visibility and lifecycle behavior

The launch implementation must correct the current inconsistent event visibility behavior.

Rules:

- draft events are not shown publicly
- only public-ready events appear on public event listings
- admin surfaces can see draft and public events
- imported participants only affect the intended event

This keeps admins free to prepare upcoming events without exposing unfinished pages to the public.

## Testing requirements

Minimum validation tests:

- valid CSV imports all teams successfully
- invalid `event_slug` rejects the full file
- duplicate `team_name` in the same event rejects the full file
- duplicate `team_name` inside the same CSV file rejects the full file
- missing required columns reject the full file
- missing required cell values reject the full file
- empty `team_tag` auto-generates a tag

Minimum product tests:

- imported teams appear on the participants page
- imported teams drive bracket or fixture generation
- standings stay event-scoped
- draft events do not appear publicly
- livestream appears only when enabled for the event

## Launch readiness checklist

- admin receives the official CSV template
- admins know the valid `event_slug` values for the events they manage
- at least one dry-run import is performed before the live event week
- public pages are checked on mobile layout
- livestream fallback behavior is verified for the chosen stream platform
- deployment stays on the Vercel plus Neon path without Docker as a launch dependency

## Risks and mitigations

### Risk: import confusion during operations

Mitigation:

- strict CSV template
- whole-file validation
- clear row-level error messages

### Risk: launch scope expands too far

Mitigation:

- keep captain self-registration out of the launch path
- keep roster import out of launch scope
- focus admin tooling on CSV import and event publishing only

### Risk: public pages show incorrect or mixed data

Mitigation:

- enforce event-scoped reads
- hide draft events
- test bracket, standings, and participants from imported records

## Recommendation

The launch should proceed as an operations-first MVP:

- Google Form remains the registration source
- CSV import becomes the admin ingestion path
- public event pages become the main viewer experience
- Vercel plus Neon remains the production platform
- Docker is deferred as a non-blocking enhancement for a later phase

This is the narrowest plan that still supports the real event workflow next week without overloading the build with low-value complexity.
