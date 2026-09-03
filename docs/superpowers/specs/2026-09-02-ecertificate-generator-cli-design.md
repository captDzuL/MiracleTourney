# E-Certificate Generator CLI Design

## Goal

Provide a safe, reusable command-line entry point for generating the champion certificate for an event by using human-readable event and team identifiers. The first intended use is event `MFL S2` with champion team `The Brothers Invictus` (`BRO`).

## Command Interface

The project exposes this command:

```powershell
pnpm certificate:generate -- --event "MFL S2" --team "The Brothers Invictus" --confirm
```

Required options:

- `--event`: exact event name or exact event slug, compared case-insensitively.
- `--team`: exact team name or exact team tag within the resolved event, compared case-insensitively.

Write authorization:

- Without `--confirm`, the command performs validation, prints the resolved event and team, reports whether a certificate already exists, and exits without generating or persisting anything.
- With `--confirm`, the command invokes the existing certificate generator after all validation succeeds.

## Resolution and Validation

The CLI resolves the event first, then resolves the team only within that event. It must fail with a clear message when:

- a required option is missing or unknown;
- no event matches the supplied name or slug;
- more than one event matches the supplied name;
- no team in the event matches the supplied name or tag;
- the event already has a certificate;
- the selected team does not belong to the selected event;
- generation or storage fails.

The command prints the resolved event name, event slug, event ID, team name, team tag, and team ID before any write. It never deletes or replaces an existing certificate. Regeneration and overwrite behavior are outside this scope.

## Architecture

The existing `scripts/generate-certificate.ts` remains the executable entry point. Its argument parsing and entity-resolution behavior are separated into small functions that can be tested without launching Playwright or writing to the database.

After resolution, the CLI calls the existing `generateCertificate(eventId, winnerTeamId)` function. The existing renderer, 1080×1920 PNG format, certificate template, MVP selection, Vercel Blob upload, local `public/certificates` fallback, and `Certificate` persistence remain unchanged.

`package.json` registers `certificate:generate` as a `tsx` command pointing to the CLI script.

## Data Flow

1. Parse CLI arguments.
2. Resolve one event from the exact name or slug.
3. Resolve one team within that event from the exact name or tag.
4. Check for an existing certificate.
5. Print the resolved target and validation result.
6. Exit without writes unless `--confirm` is present.
7. Generate, store, and persist the certificate through the existing generator.
8. Print the resulting image URL.

## Safety

- Entity matching is exact after trimming and case normalization; partial matching is not permitted.
- Team lookup is scoped to the resolved event.
- `--confirm` is required for all writes.
- Existing certificates are never silently replaced.
- The implementation does not modify database schema, certificate templates, application pages, or production data.
- Running the command against a database remains an operator action; implementation and automated tests do not execute it against production.

## Testing

Unit tests cover:

- valid name-based resolution for `MFL S2` and `The Brothers Invictus`;
- slug and team-tag resolution;
- case-insensitive exact matching;
- missing and unknown arguments;
- ambiguous event names;
- team/event scope enforcement;
- dry-run behavior without `--confirm`;
- duplicate-certificate refusal;
- delegation to the existing generator only after validated `--confirm` input.

Verification includes the focused unit tests, the existing certificate test suite, and TypeScript checking. No test may generate a real production certificate.

## Out of Scope

- Bulk participant certificates or CSV input;
- changes to the certificate artwork or copy;
- browser-based generation UI;
- overwriting or deleting existing certificates;
- automatic execution against the production database.
