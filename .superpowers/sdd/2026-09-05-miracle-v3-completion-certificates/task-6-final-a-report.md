# Task 6 final-a report — cross-task completion hardening

## Outcome

Resolved the five Important findings and the safe Minor from the final cross-task review without merging Match Day and without implementing Public Finished. This remediation hardens Double Elimination podium lineage, terminal Completion Workspace refresh/idempotency behavior, the legacy/V3 certificate boundary, deterministic render retries, owned-local certificate assets, and the reopened Completion repair state.

This is a Task 6 remediation only. Task 7 and the Match Day integration gate remain open.

## RED → GREEN evidence

- Double Elimination lineage: the new lower-final-winner-is-eventual-champion regression failed because the derivation accepted only the Grand Final loser. The minimal lineage predicate change passed all 12 podium tests while retaining the invalid-lineage blocker coverage.
- Completion Workspace terminal refresh: four new complete/reopen cases failed before the form locked direct terminal results and immutable `already_applied` terminal replays. The completed and reopened paths now refresh exactly once, disable the affected action while props are stale, and remount only after authoritative state/idempotency inputs change; all 40 workspace tests passed.
- Legacy/V3 isolation: service, direct generator, repository, and upload-policy regressions failed before V3 ownership checks and append-only upload behavior existed. A follow-up exact query regression produced 3 failures across 104 tests while the guard still filtered only `status: completed`; after broadening ownership to retained/reopened Completion rows, all 162 affected legacy/security tests passed.
- Canonical render manifest: schema contract tests failed before the additive field/migration existed, and the repository retry regression failed because rendering was reconstructed from live event data and the clock. The append transaction now persists one schema-versioned canonical manifest containing issue text/date, assets, placement, identity, verification data, and provenance. Stale resume uses the stored manifest verbatim; repository coverage passed 11/11 and proves event/clock changes do not alter data or fingerprint.
- Owned-local assets: template tests failed when safe raster data URLs were rejected, and repository tests failed before trusted local bytes could be materialized. The renderer now accepts only canonical PNG/JPEG/WebP base64 data URLs; local storage resolution remains confined to `public/certificate-assets`, rechecks byte count and SHA-256, and embeds the verified bytes. Chrome coverage verifies the required team logo is present and the fallback hero is absent.
- Reopened Completion state: two UI/contract tests failed while a known reopened snapshot was still labeled `integration_required`. An additional unknown-state regression failed until only known `reopened`/`editable` states mapped to `completion_required`. The localized repair link points to the actual Completion workspace; unknown authority remains `integration_required`. The focused contract/UI/page run passed 27/27.

## Production changes

- Double Elimination accepts the valid lower-final winner when that team is either Grand Final participant, including the champion, while rejecting unrelated lineage.
- Successful complete/reopen calls and terminal idempotent replays trigger an authoritative refresh and lock repeat submission until new server props/revision/key state arrives.
- Legacy generation routes V3-owned events to Certificate Studio or rejects direct writes before render/persistence. Repository writes cannot update or append legacy Champion history once any retained Completion owns the event. Legacy event behavior remains unchanged.
- `scripts/upload-certificate-to-blob.mjs` refuses Completion/V3 Champion ownership before Blob or database writes, uses a create-only unique Blob path, and appends a new legacy version instead of updating/superseding history.
- Added nullable `Certificate.renderManifest` through additive migration `20260912233000_certificate_render_manifest`. New miracle-v3 versions persist immutable render input and asset provenance inside the same transaction before generation.
- Required local team logo/badge assets are deterministically embedded after trusted path, MIME, byte-length, and SHA-256 verification. Remote trust rules remain strict; arbitrary local paths and scriptable data URLs are still rejected.
- Certificate Studio distinguishes known reopened/editable Completion from missing or unknown authoritative integration in English and Bahasa Indonesia.

## Verification

- Focused legacy/V3 guard suite: 4 files, 162/162 passed.
- Focused Completion availability/UI/page suite: 3 files, 27/27 passed.
- Real Chrome renderer: 5/5 passed, including an embedded owned-local team logo with no fallback and 1080×1920 output.
- Full unit suite with Chrome enabled: 110 files, 1,114/1,114 passed.
- Prisma schema validate: passed with placeholder local PostgreSQL URLs.
- Prisma client generation: passed.
- Script syntax checks for upload entrypoint and pure policy: passed.
- `pnpm lint` (`tsc --noEmit`): passed.
- `pnpm build`: passed. Static generation logged the expected unreachable placeholder database at `localhost:5432`, then completed through the existing fallback.
- `git diff --check`: passed apart from informational Windows line-ending notices.

## Residual gates

- Match Day remains deliberately unmerged; Completion is not production-ready until its remaining tasks are complete, its worktree is clean, and the authoritative adapter integration is merged and verified.
- Task 7, PostgreSQL/Blob multi-writer E2E, and the public QR verification flow remain pending behind that integration gate.
- Public Finished recap remains out of scope and belongs to `feature/ui/adaptive-public-finished-v3`.

## Final re-review remediation

The follow-up review found two Important issues and one Minor in the first cross-task hardening commit. All three are addressed without changing the integration gates above.

### RED → GREEN

- A stale-retry regression deep-reversed every object key after a real JSON serialize/parse roundtrip. It first failed with `Certificate render manifest is not canonical`, then exposed a second fingerprint mismatch caused by nested placement insertion order. Deep semantic comparison plus explicit nested normalization now accepts reordered JSONB while preserving the exact render payload and fingerprint.
- A compact-manifest regression supplied a two-megabyte local data URI. It failed because the URI was persisted in `renderManifest`. The stored manifest is now below 10 KB and contains only canonical owned references, placement, digest, and provenance; bytes are materialized only for rendering.
- The same stale-retry regression proves local assets are resolved again on retry and a changed/missing asset aborts generation rather than silently changing the PNG. It also proved extra asset fields were initially accepted when both JSON columns were tampered; explicit schema/purpose/provenance/safe-zone normalization now rejects them as non-canonical.
- Two upload-policy tests initially failed because the serializable append helper did not exist. The helper now re-reads Completion ownership, any miracle-v3 Champion, and the latest legacy Champion inside the same serializable transaction, then appends there. A Completion created after external preflight prevents `certificate.create`; the legacy-only path still appends the latest version.

### Final verification

- Focused certificate/completion/security suite: 10 files, 288/288 passed.
- Real Chrome renderer: 5/5 passed, including embedded owned-local logo with no fallback.
- Full unit suite with Chrome enabled: 110 files, 1,116/1,116 passed.
- Prisma validate and client generation: passed.
- Upload script syntax checks: passed.
- `pnpm lint` (`tsc --noEmit`): passed.
- `pnpm build`: passed with the expected placeholder localhost database warning and existing fallback.
- `git diff --check`: passed apart from informational Windows line-ending notices.
