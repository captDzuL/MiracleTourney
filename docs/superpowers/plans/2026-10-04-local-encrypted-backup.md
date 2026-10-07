# Local encrypted backup implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute serially with focused review gates.

**Goal:** Prepare a safe zero-additional-cost encrypted local backup and verified weekly execution path.

**Architecture:** pg_dump18 custom archive streams to age; separate recoverable owner-held key and immutable encrypted local artifacts. Reviewed CLI runner is invoked by the existing paused Codex job only after independent recovery proof.

**Tech stack:** Portable PostgreSQL18 clients, age, Node child-process streams, Windows ACL/DPAPI for local key protection, focused Node tests.

## Global constraints

- Output E:/MiracleBackups, budget $0 additional. No secret or plaintext dump in repo/logs/arguments. No production writes/restore/migrate/pause/settings/deploy. Sharedtest and oldchild untouched.
- Source Neon steep-tree-47893196, br-rough-mountain-azfdh3db, ep-sparkling-night-azr6wxwd, neondb; direct TLS only, explicit guard and independently verified routing.
- Preserve existing dirty RCA and protected root checkout/env files. No full CI/E2E/push. Age private key independently recoverable before live export. No deletion/overwrite of existing artifacts.
- Weekly job Sunday09:00Asia/Jakarta stays PAUSED until reviewed runner plus independently restored backup. RPO1h/RTO30m remain unproven.

### Task 1: Portable tools and guarded encrypted runner

Files: create scripts/operations/local-backup.mjs, scripts/operations/local-backup-core.mjs, tests/operations/local-backup.test.mjs, docs/operations/local-encrypted-backup.md. Generated tools/config/key protection artifacts go only in ignored plan runtime or approved owner-private directories, never tracked. No live dump/restore on this task.

Interfaces: core exports validateSourceUrl(value), validateOutputDirectory(value), runEncryptedBackup(config). Source validation returns explicit libpq environment fields without rendering passwords; rejects pooler/otherhost/database/insecure TLS. runEncryptedBackup accepts configured executable paths, recipient, output root, source credentials and timeout, returns redacted metadata. Keep executable/config ownership and output realpath/reparse safety at trust boundary.

- [ ] RED: Node tests must catch unsafe source/output and failed/fake-success pipeline before implementation. Literal assertions:

```js
assert.throws(() => validateSourceUrl('postgresql://u:p@ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech/neondb'), /SOURCE_REJECTED/);
assert.throws(() => validateOutputDirectory('E:/dev/MiracleTourney-gitnative'), /OUTPUT_REJECTED/);
```

- [ ] Run node --test tests/operations/local-backup.test.mjs; show real missing behavior failures. Use controlled child executables/streams for binary success/failure tests, real filesystem outputs, no external DB.
- [ ] Obtain free PG18 client-only Windows binaries and age from authoritative sources, verify artifact provenance/hash/signature where supported, record versions/hashes. Do not install server/service or replace PG16. If trust cannot be verified, stop.
- [ ] Implement guarded binary-safe stream, dual process status/timeout handling, secret-free error codes, exclusive lock, immutable/atomic files and manifest. Test failed dump, failed age, timeout, concurrency, missing key/recipient, collision and redaction. No success before both subprocesses and output verification succeed.
- [ ] Establish recoverable key custody. Do not generate live encryption identity without owner-only storage ACL and independent escrow decision. DPAPI protects local private identity only, not sole recovery method.
- [ ] GREEN: focused tests, node syntax checks, scoped lint where supported and git diff --check; self-review. Commit only owned scripts/tests/docs; do not include existing dirty RCA. Write task-1-report.md with RED/GREEN counts/duration, files/tool hashes, remaining runtime gates. Stop for controller review before live export.

### Task 2: One local production read-only export

Consumes reviewed runner SHA/hashes/config and independently recoverable key. Produces immutable age archive + redacted manifest under E:/MiracleBackups. No live operation until controller verifies cost/capacity/credential/direct-TLS/resource identity and key-custody gates.

- [ ] Verify approved source, source aggregate checkpoint, free disk/ACL, key recovery, zero-charge allowances. Never read user rows into chat or print secrets.
- [ ] Run reviewed runner exactly once; no retry or plaintext intermediate. Record duration/bytes/hash/exit status and safe source identity.
- [ ] Decrypt stream into pg_restore --list without printing archive contents; prove ciphertext authentication/readability. Distinguish this from actual restore. Leave job PAUSED and report gate status.

### Task 3: Independent nonproduction restore and weekly activation

Consumes Task2 archive and key; produces restore evidence and updated job handoff. Any new branch/compute must stay within verified free allowance and explicit target guard. Never restore into existing production/sharedtest/oldchild.

- [ ] Create unique isolated nonprod destination only after identity/cost verification. Verify own endpoint and direct TLS credentials; stop on unknown mapping.
- [ ] Decrypt into pg_restore with fail-fast transactional behavior where supported, without plaintext disk/logs. Compare 17 applied ledger identities/checksums, required schema, aggregate counts and integrity against snapshot checkpoint. No seed/reset.
- [ ] Record timed restore and recovery limitations; separate backup success from RPO/RTO compliance. Owner keeps recovery key independently; retain artifacts/resources without deletion.
- [ ] Controller verifies complete evidence/review, updates durable local-backup-job-handoff.md with exact reviewed runner SHA/hashes/config. Activate only existing weekly automation if all gates pass; otherwise leave PAUSED with explicit reason.

### Task 4: Protected key custody prerequisite (execute before Task 2)

**Files:** create scripts/operations/local-backup-key.ps1 (narrow interactive CLI), scripts/operations/local-backup-key.psm1 (DACL/DPAPI/age operations), tests/operations/local-backup-key.test.mjs (real Windows synthetic integration); update docs/operations/local-encrypted-backup.md. No production runner modifications.

**Approved design:** docs/superpowers/specs/2026-10-04-local-encrypted-backup-design.md, Approved key custody refinement. User approved separate E:/MiracleBackupKeys; Bitwarden/2FA/phone access/offline recovery code are owner-confirmed. Actual backup-key escrow is not yet established.

**Interfaces:** CLI modes Initialize, CopyRecoveryKey, VerifyRecoveryCopy, Status. Production CLI fixes KeyDirectory to E:/MiracleBackupKeys and uses pinned tools under this plan's ignored runtime. Module operations return only public recipient/status/warnings; no public function returns private identity text. Verification input is SecureString from an interactive non-echo prompt, not argv/environment. Tests may use isolated synthetic directories and in-memory synthetic keys through module boundaries; no bypass enabling real production export.

- [ ] Write RED behavioral Node tests invoking Windows PowerShell 5.1 with controlled synthetic directories and pinned age tools. Keep plaintext identities in memory only; catch redaction leaks without printing secret-valued assertions. Cover unsupported path/reparse/unsafe ACL rejection, rejected tool hash, missing identity, wrong DPAPI bytes, no overwrite, secret-free output, and copied-back key mismatch. Example behavior assertion:

```js
assert.equal(result.status, 1);
assert.match(result.stderr, /KEY_REJECTED/);
assert.equal(/AGE-SECRET-KEY-/.test(result.stdout + result.stderr), false);
```

- [ ] Implement exact-root/path/ancestor reparse checks, protected owner-only DACL creation before secret handling (fail closed on pre-existing unsafe directory, no recursive ACL changes). New files inherit verified restricted permissions. Hash-check existing age-keygen.exe (1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c) and age.exe (2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0). Capture child stdout/stderr internally with bounded execution and sanitized exceptions; no plaintext identity file, secret argv, transcripts or key hashes. Generate one identity in memory, protect with CurrentUser DPAPI, exclusive-create identity.dpapi and recipient.txt. Reject any pre-existing key artifacts; never rotate/delete existing keys.
- [ ] CopyRecoveryKey is OWNER-ONLY, interactive confirmation after clipboard-history/cloud-sync warning, no output of key material. Provide nonsecret local copy-recovery-key.cmd launcher in key directory with fixed quoted script path. Agent must NEVER invoke this mode. Owner pastes into Secure Note and clears clipboard. VerifyRecoveryCopy prompts for copied-back private identity without echo, requires matching derived public recipient, and performs real age encrypt/decrypt on synthetic challenge; store only nonsecret verification receipt on success. Invalid/missing key cannot write success receipt. This receipt does not alone prove Bitwarden custody. No automatic key transfer or vault/browser inspection.
- [ ] GREEN: node --test --test-isolation=none tests/operations/local-backup-key.test.mjs; record real DPAPI, DACL and age synthetic evidence, counts and durations. Validate PowerShell syntax and diff whitespace. No full CI, E2E, old suite rerun, downloads, DB contact or paid resource.
- [ ] Self-review, commit only owned scripts/tests/docs, append task-4-report.md (RED/GREEN commands/counts/duration, safe metadata, limitations). STOP before real key initialization for fresh controller review. Review does not authorize live export; production CLI remains PREPARATION_DISABLED and weekly job PAUSED.
- [ ] AFTER clean code review, controller authorizes one Initialize invocation against approved E:/MiracleBackupKeys. Record only DACL verification and public recipient/status, no secrets. If prior artifacts exist, inspect metadata only and report rather than overwrite/retry. Then hand owner the local launcher and Secure Note instructions; stop until owner completes escrow transfer and copied-back verification. No generated key file content may be read by agent tools. Independent nonproduction database restore remains a separate Task 3 gate.
