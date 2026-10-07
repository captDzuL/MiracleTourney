# Bracket appearance implementation report — 2026-10-04

Task 2 in the isolated `codex/bracket-social-v3` checkout.

## Changes

- Added an additive `EventBracketAppearance` model keyed to one event, with cascade cleanup and defaults of null background, 50/50 position, and 35 overlay. Added migration SQL without applying it to any database. Generated the Prisma client in this checkout.
- Added `getBracketAppearance(eventId)` and a server-only persistence helper.
- Added organizer appearance GET/POST API. It checks path ID, same origin for writes, organizer ownership, and password-change state before upload or persistence. Save accepts only numeric position and overlay values within 0–100/0–80; upload requires rights confirmation and passes the image to existing `uploadImageAsset` with `validationMode: "throw"`, PNG/JPEG/WebP decoding and 5 MiB limit. It records the attested asset and invalidates page caches. Reset clears the custom background; no request body URL is accepted.
- Added a localized V3 appearance editor with file selection, live image position and overlay preview, an example champion marked as a preview, shared board preview when an authorized model is available, save/reset status and failure feedback. The organizer PNG link points to the authorized endpoint.
- Mounted the editor alongside the existing real organizer competition workspace, using the organizer-scoped bracket reader.

## Verification

- Red/green test cycles observed for persistence, API, editor, and page integration.
- `pnpm exec vitest run` for the four Task 2 suites plus `src/lib/upload-image-asset.test.ts`: 5 files, 25 tests passed.
- `pnpm exec prisma validate` with dummy local connection URLs: passed. Prisma client generation passed. No database connection or migration execution was made.
- `pnpm exec tsc --noEmit --pretty false`: one error in another task's `src/app/events/[slug]/bracket/page.test.ts:650` fixture, which lacks required `gameModeId`. No TypeScript errors in Task 2 files were reported.
- `git diff --check` currently flags one new blank line in another task's `src/app/events/[slug]/bracket/page.test.ts:665`; Task 2 tracked files have no whitespace errors.

## Remaining integration

The parent agent is handling combined review and browser verification. The migration must be applied through the project's later deployment process before appearance reads/writes can use a live database.

## Review fix round 1 — pixel decoding

The reviewer found that `sharp(...).metadata()` accepts a PNG containing a valid 4×4 header and no IDAT pixels. The existing uploader stored it. A red test demonstrated metadata success, full `sharp(...).stats()` failure, and the prior unwanted Blob write. The uploader now accepts an opt-in `validatePixels` flag and runs full pixel statistics before storage. The bracket appearance route enables that flag; existing upload callers keep their prior behavior.

The regression now rejects this truncated PNG with `decode_failed` before Blob storage. Separate real-uploader tests confirm valid PNG, JPEG, and WebP each upload successfully. The route test verifies it requests full decoding. The neighboring competition-page test now accounts for the editor wrapper while retaining its original workspace assertions.

After the fix, the six focused and neighboring suites pass (40 tests). `pnpm exec tsc --noEmit --pretty false` exits 0. The latest full `git diff --check` flags trailing blank lines in model files owned by another task; Task 2 files have no whitespace errors.

Minor remaining risk: if the remote image upload succeeds but the later appearance database save fails, an unused approved asset record and uploaded image can remain. The task did not alter the storage/transaction boundary for this review round; this can be addressed separately with one transaction for both database writes and eventual cleanup of the immutable uploaded object.
