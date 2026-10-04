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
