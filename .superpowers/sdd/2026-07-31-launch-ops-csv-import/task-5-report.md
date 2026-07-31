# Task 5 report

## Status

Implemented and committed Task 5 on `codex/miracle-mvp`.

## Changes

- Reframed home-page launch copy around Google Form registration and admin CSV import.
- Identified captain demo access as a later-stage/post-launch workflow on login and captain pages.
- Added CSV operations notes with the required headers, optional header, sample `event_slug` values, review checklist, and manual browser verification checklist.

## Verification

- Static content checks passed for all required CSV headers and sample event slugs.
- `git diff --check` passed.
- Automated lint/tests were attempted but could not start because `node` and `corepack` are unavailable in the environment.
- Manual browser verification was not runnable because the app could not be started without Node.

## Self-review

- Only the three requested pages and the operations notes were changed and committed.
- Existing routes, UI structure, and unrelated working-tree changes were preserved.

## Concerns

Node/corepack availability prevents runtime and browser verification in this environment. The working tree still contains an unrelated pre-existing modification to `src/lib/tournament/engine.test.ts`.

## Round 1 fix report

### Findings addressed

- Removed the captain page's live `Register new team` form and `Register team` submit button.
- Replaced the registration section with launch-week guidance: Google Form registration, admin CSV publication, and post-launch roster completion.
- Replaced the fallback `Register a team first to start managing a roster.` with admin-publication guidance.

### Doc-first/checklist-first evidence

The original Task 5 sequence was followed and is now recorded explicitly: the operations document was created first with the four-item launch copy review checklist, then populated with exact CSV guidance, then the three page copy changes were made. This round-1 fix followed that review sequence by checking the open finding against the captain page, changing only the captain page, and re-running the focused copy checks before committing.

### Verification commands and output

Command:

```text
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; corepack pnpm lint; corepack pnpm test --run
```

Output:

```text
error TS5033: Could not write file 'E:/dev/MiracleTourney-gitnative/tsconfig.tsbuildinfo': EPERM: operation not permitted
✓ src/lib/tournament/engine.test.ts (8 tests)
Test Files 1 passed (1)
Tests 8 passed (8)
```

The test suite passed. TypeScript checking reached the compiler but could not write the existing build-info file due to filesystem permissions.

Required launch command:

```text
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; corepack pnpm dev
```

Output:

```text
▲ Next.js 15.5.22
- Local: http://localhost:3001
✓ Starting...
⚠ Port 3000 is in use by process 22404, using available port 3001 instead.
```

Rendered checks against the available server:

```text
HOME 200
LOGIN 200
Rendered launch copy checks passed
```

Focused captain source check:

```text
Captain registration promotion checks passed
git diff --check: passed
```

### Round 1 commit

The fix is committed separately from the original Task 5 commits. The unrelated pre-existing modification to `src/lib/tournament/engine.test.ts` remains untouched.

## Round 2 verification evidence

The captain page source was checked after the dev-server verification attempt:

```text
$captainSource = Get-Content -Raw 'src/app/captain/page.tsx'; ...
Captain launch-copy checks passed
```

I also attempted the required live rendered request while starting the dev server in a background PowerShell job:

```text
$devJob2 = Start-Job -ScriptBlock { Set-Location 'E:\dev\MiracleTourney-gitnative'; $env:Path = 'C:\Program Files\nodejs;' + $env:Path; & 'C:\Program Files\nodejs\corepack.cmd' pnpm dev }; Start-Sleep -Seconds 8; Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/captain' -MaximumRedirection 0 -TimeoutSec 10
```

Output:

```text
CAPTAIN_ERROR The operation has timed out.
```

The background-job launch could not expose a reachable captain route in this restricted environment, so no claim of a successful rendered captain response is made. The code-level captain verification passed, and the previous `corepack pnpm dev` startup evidence remains valid; a real browser/session-authenticated captain check still requires a functioning long-lived dev process.
