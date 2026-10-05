# Local encrypted production backup

The guarded runner is implemented for the approved direct production `neondb` source. The reviewed preflight and single encrypted export completed on 2026-10-05. The first archive verification failed because a local helper passed a literal `-` input filename to `pg_restore`; that helper was corrected and reviewed. The existing archive subsequently passed authenticated verification and one full local two-restore/migration/no-op rehearsal, detailed below. The weekly job remains paused. Do not repeat this export.

## Pinned local tools and provenance

The ignored runtime is `.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime`. The original prepared `pg18/bin` remains unchanged. `psql.exe` was extracted from the same retained, hash-verified EDB ZIP into the separate ignored `snapshot-client/pgsql/bin` with copies of the exact 29 pinned adjacent DLLs. No server, service, global PATH, or PostgreSQL 16 installation was changed.

| Tool | Source | SHA-256 |
| --- | --- | --- |
| PostgreSQL 18.6 Windows x64 ZIP | [Official EDB HTTPS binary page](https://www.enterprisedb.com/download-postgresql-binaries), file ID `1260609` | `e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2` |
| `pg_dump.exe` | EDB ZIP | `9414dac0554065aa6edf739d7126b6e6d6fc3b56b9706b72cee47cee45b22c` |
| `pg_restore.exe` | EDB ZIP | `94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55` |
| `psql.exe` | Same EDB ZIP, separate snapshot client | `fde952534f520909c02db04675588ecb1da8d618b6e5c93e106f42a752daf720` |
| age v1.3.2 Windows ZIP | [Official age release](https://github.com/FiloSottile/age/releases/tag/v1.3.2) | `f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7` |
| `age.exe` | age ZIP | `2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0` |
| `age-keygen.exe` | age ZIP | `1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c` |

Both PostgreSQL client directories are checked against the exact DLL names and SHA-256 values in `scripts/operations/pg18-dll-hashes.mjs`. The age ZIP hash matches the official GitHub release API digest. The EDB download came through its official HTTPS page; no independent EDB ZIP checksum or publisher signature was available, and Windows reports the extracted executables as `NotSigned`. These hashes establish local byte identity, not independent publisher authenticity. Reviewers must explicitly accept this provenance limit before production export.

## Actual readiness gates

`node scripts/operations/local-backup.mjs` uses fixed source, output, key, and binary paths. It rejects command-line arguments and ignores environment readiness assertions. Before reading a credential, it checks the actual `E:/MiracleBackups` and `E:/MiracleBackupKeys` owner-only Windows DACLs, key artifact ACLs, reparse-free paths, free capacity of at least 1 GiB, key-helper status, receipt content/public recipient, and all archive/executable/DLL hashes. A failed check exits with a fixed code. Child stderr and credentials are never printed.

The protected `E:/dev/MiracleTourney-gitnative/.env` `DIRECT_URL` is read without editing the file. Its approved direct host is `ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech`, database `neondb`, with no query parameter other than `sslmode=require`. The runner normalizes that URL **in memory** to libpq `sslmode=verify-full&sslrootcert=system`, rejecting other hosts, databases, TLS modes, and query overrides. Before invoking either client, it replaces only libpq's `PGSSLROOTCERT` with an exact, validated public CA bundle under the current plan's ignored owner-only runtime. This bundle is the installed Node 24.18.1 bundled Mozilla root set (120 certificates, 179722 bytes, SHA-256 `30b7a0242d363aa77faa2b2bb71f802c7890765e3350f8a566c4fccf4b7ad4f2`); the Node executable itself is hash-pinned. The preflight may create it exclusively once; an existing bundle is never overwritten and must pass byte, ACL, and reparse checks. Export only verifies an existing bundle and exits `TOOL_REJECTED` if absent or tampered. No global trust-store or protected source change occurs. Inherited `PG*`, `SSL_CERT_*`, and `OPENSSL_*` trust overrides are scrubbed from both client environments. The password goes only into `psql` and `pg_dump` child environments, never arguments. The independently refreshed dashboard metadata in `.superpowers/sdd/2026-10-04-v3-release-pr-readiness/source-metadata.md` binds this host to project `steep-tree-47893196`, production branch `br-rough-mountain-azfdh3db`, primary endpoint `ep-sparkling-night-azr6wxwd`, PostgreSQL 18, and Free billing. That UI observation is not a live TLS or backup proof. Bundled roots are a trusted release-time snapshot, not proof that live source connectivity now succeeds.

The owner confirmed an independent Bitwarden Secure Note recovery copy. The actual DPAPI-protected key exists under `E:/MiracleBackupKeys`; the copied-back recovery check produced a nonsecret receipt at `2026-10-04T16:12:44.712115Z` for public recipient `age1gy00y8k4wct4gap558p3k4h8ppecp86pxr9xnyz0mjajwkhw5ewsjlg8s8`. Runtime verifies the receipt content and the key helper's derived public recipient. The helper's existing `Initialize`, `CopyRecoveryKey`, and `VerifyRecoveryCopy` modes are not part of backup execution. No new API returns private identity text; do not put it in Git, a backup directory, arguments, logs, or chat.

## Snapshot and archive behavior

The pinned `psql` opens one libpq `REPEATABLE READ READ ONLY` transaction, exports its snapshot, and collects the checkpoint from that transaction. The session remains open while `pg_dump --snapshot=<id> --format=custom --no-owner --no-acl` streams directly into age. After archive and manifest publication and hash verification, the read-only transaction closes. SQL errors, malformed checkpoint protocol, child failure, or timeout fail closed without retry. A checkpoint error can emit only a fixed diagnostic suffix such as `CHECKPOINT_FAILED:TLS_CHAIN`; raw child stderr, source details, credentials, and rows remain suppressed. No plaintext dump intermediate is created. Complete finals are published with non-overwriting same-directory hard links; failed partials may remain for reconciliation. A failure after final publication can leave a complete pair with an uncertain reported status: inspect before deciding anything further.

The pre-export ledger check requires exactly the historical 17 successful migration prefix entries through `20260903000000_certificate_status_tracking`. Each successful checksum must equal the SHA-256 of that migration's checked-in SQL after normalizing its line endings to either LF or CRLF. These are two exact byte variants of the same SQL; an unrelated checksum remains drift. Historical rolled-back attempts are allowed only for an eventual successful prefix migration; unfinished unrolled-back or unexpected migrations fail. The physical check requires exactly the 23 pre-V3 model tables plus `_prisma_migrations`, selected critical column type/nullability on `User`, `Event`, `Certificate`, and `PasswordResetToken`, four critical unique indexes, no unvalidated constraints, and PostgreSQL 18. It records schema and ledger digests, exact table counts, and aggregate per-table MD5 row checksums from the same snapshot for future restore comparison.

The pinned libpq connection's `verify-full` mode, exact host and database, and validated CA bundle enforce client-to-endpoint TLS; a failed handshake cannot return a checkpoint. The checkpoint also reads `pg_stat_ssl.ssl` as a Boolean observation of the PostgreSQL backend's connection. [PostgreSQL defines that view per backend connection](https://www.postgresql.org/docs/current/monitoring-stats.html), while [Neon places TLS negotiation in its proxy layer](https://neon.com/blog/postgres-17). A `false` backend observation is therefore not used as proof that the client connection lacked TLS. The exact internal hop for this endpoint is not established by this check. A missing or non-Boolean backend observation still fails closed; the operator's fixed `verify-full`/CA/host checks remain mandatory. [PostgreSQL's libpq documentation](https://www.postgresql.org/docs/18/libpq-ssl.html) describes the certificate-chain and hostname checks performed by `verify-full`.

## Isolated local recovery rehearsal runner

The controller's reviewed full rehearsal ran once on 2026-10-05, exit 0,
75,046 ms end to end. The immutable 175,055-byte archive SHA-256 is
`dc30ddf3ae4bb98dacd9d68e293b26cef5a3818664364c405c01d578cf1d7f5b`.
Two independent local restores took 359 ms and 444 ms. Each matched the
production-derived reference across 23 tables/2,036 rows, logical schema,
named-column values, ledger, and integrity. Candidate migration took 14,074
ms and moved 17 applied/19 pending/zero unfinished to 36 applied/zero
pending/zero unfinished. Its second application was a 1,123 ms no-op.
Certificate/session/reset/limiter postchecks and synthetic rolled-back SQL
flows passed. The private local cluster was stopped and remains retained for
the owner. These measurements do not establish production RTO; source
locale/extension equivalence and the exact four-table record-text difference
mechanism remain unproved. The RPO <=1 hour and RTO <=30 minutes are Dzul's
targets. A fresh backup under an agreed write pause is still required before
cutover.

The current backup runner deliberately expects the **pre-V3** 17-applied
physical contract. After production migration it will fail closed until a
reviewed post-V3 backup contract is supplied. Weekly activation also requires
durable reviewed runtime/script paths independent of this removable worktree.
Keep the scheduled job **PAUSED** until both requirements and a corresponding
restore check are met.

This local rehearsal runner is source-anchored to the exact old checkpoint
and archive. Full mode cannot establish its reference if production is down,
changed, or migrated; it is not a general emergency restore command. In an
incident, use a prevalidated immutable archive identified by hash, reviewed
age authentication and isolated restore tools, retained integrity evidence,
and a named owner decision on write loss and switchover. Do not rerun the
source-anchored release validator as a prerequisite for incident recovery.

Task 3 adds `scripts/operations/local-rehearsal-runner.mjs` for a controller-run rehearsal after fresh code review. It accepts one absolute path to the already authenticated `.age` archive and verifies the owner-only backup/key directories, archive and manifest hash, full age authentication, pinned PostgreSQL 18.6 ZIP, pinned client DLLs, and free capacity before it creates a new directory. It rejects an occupied port and existing or redirected rehearsal target. Full rehearsal also reads the protected source URL through the existing fixed, pinned `verify-full` connection guard. Before creating a local cluster, one bounded read-only source transaction must reproduce the immutable manifest's complete 23-table original checkpoint, schema, ledger, counts and integrity. The source transaction's snapshot ID is new and is not required to equal the archived snapshot ID. Source credentials, schema rows and digests remain transient in memory; only fixed failure codes can leave the process.

The runner creates one exclusive `E:/MiracleBackups/rehearsal-<UTC timestamp>` subtree with an owner-only inheritable Windows ACL. The pinned ZIP is extracted into that subtree's separate `server/pgsql` runtime; the existing client bins are not modified. Its `cluster/` uses only `127.0.0.1:55438`, SCRAM authentication, a generated bootstrap credential and a distinct generated non-superuser `rehearsal_owner`. Only that owner role restores and migrates the two new databases, `recovery_baseline` and `migration_candidate`. The bootstrap password file is exclusive and removed after `initdb`. No service, firewall, global PATH, production/shared database, seed, or reset operation is used.

The internal DPAPI key bridge streams age decryption directly into `pg_restore` for each database. `pg_restore` receives stdin with `--single-transaction --exit-on-error --no-owner --no-acl`; both age and restore exit statuses must be zero. Each restore must independently match the manifest's migration ledger, checked-in LF/CRLF checksum variants, all 23 table counts, and integrity. Its schema is compared by table and column identity, data type with modifiers, and nullability; all 23 tables are compared by deterministic, sorted hashes of complete named-column JSONB values, including nulls and duplicate rows. Both the current source reference and local query use the same explicit time, date, bytea, float and binary-sort settings. Original physical column ordinals and `t::text` aggregate MD5 differences are reported as representation differences only after every logical schema and value check succeeds. The candidate alone then runs the full checked-in Prisma migration chain from a private copy of the schema and SQL files, checks the completed ledger, certificate backfill and uniqueness, User session-version and reset-token constraints, and RateLimitBucket uniqueness. Named security indexes are checked against their exact tables and ordered key columns, with no predicate, expression, or included columns. A synthetic rolled-back transaction exercises certificate verification and recipient uniqueness, session-version default and increment, SHA-256 reset-token uniqueness and consumption, and RateLimitBucket key uniqueness. The same migrate command runs a second time; unchanged ledger plus zero pending migrations establishes the no-op check. All child errors and query values stay out of stdout and the report. The runner starts and stops only its new cluster with bounded, no-pipe launcher calls; it retains the private data/runtime/log/evidence subtree for the owner's cleanup decision.

After review, the controller's one-time entrypoint for the known archive is:

```powershell
node scripts/operations/local-rehearsal-runner.mjs E:/MiracleBackups/miracle-neondb-2026-10-05T01-23-48-741Z.age
```

Run this only from the reviewed checkout. A success line contains `REHEARSAL_VERIFIED` and redacted timings/counts, and the private subtree contains `rehearsal-result.json`. Any nonzero status requires inspecting that private status and the stopped/uncertain cluster state before deciding on another run. A different run would create a new subtree; no existing data is deleted. The local restore time is not a production service recovery-time objective. The source snapshot omitted source locale, collation and extension metadata, so the runner records local values and explicitly leaves cross-environment equivalence unproven. No app-level email, Blob, provider, or end-user flow runs in this rehearsal.

This is a bounded table-column/type/nullability and named-value contract, not a full drift audit of every index, trigger, policy, extension, or view. The original and logical aggregate MD5 values are comparison aids, not authentication or a cryptographic proof that the historical source state is unchanged. The current source must first match every original manifest field; if it has changed, full rehearsal fails before local work. The exact Linux-to-Windows composite record-text quoting mechanism has not been proved, although the five-table named-value diagnostic showed equality and the three `Event` ordinal changes were identified. The `.age` archive has a SHA-256 in its manifest; the manifest itself is not signed. Authentication, `pg_restore --list`, and the reviewed local two-restore comparison subsequently succeeded for this exact archive. Those results establish bounded local recoverability, not production service recovery.

## Reviewed one-time operation history

For the existing 2026-10-05 archive, steps 1–5 below are completed history. The reviewed full local rehearsal described above followed them. Do not rerun the preflight, export, verification, or rehearsal merely to refresh this report.

1. Obtain a clean independent review of the trust bridge, preflight, and synthetic tests; retain the EDB provenance limit. Controller reconfirms protected source metadata, actual key and output ACLs, writable permission, free space/quota, tool hashes, and local migration baseline.
2. Controller verifies the existing `E:/MiracleBackups` protected current-owner-only inheritable DACL and reconciles it empty. Do not change an existing unsafe directory's ACL in place.
3. Invoke `node scripts/operations/local-backup-preflight.mjs` exactly once from the reviewed checkout with **no arguments**. This may exclusively initialize the public CA bundle in the current-plan ignored owner-only runtime, then uses the fixed source and same pinned `psql` to run the full read-only checkpoint, closes with `ROLLBACK`, and returns only `{"status":"BACKUP_PREFLIGHT_READY","appliedMigrations":17}` on success. It may read the existing local key status as a readiness guard, but does not mutate the key or invoke `pg_dump`, age, or archive publishing. On any failure, stop and reconcile; do not automatically retry.
4. Only if that preflight passes, invoke `node scripts/operations/local-backup.mjs` exactly once with **no arguments**. Export will not create the CA bundle; it verifies the existing exact bundle before connecting. Record start/end, archive bytes and SHA-256, manifest, and same-snapshot checkpoint. On failure/unknown status, reconcile partial/final files; do not retry automatically.
5. Independent reviewed verification ran `node scripts/operations/local-backup-verify.mjs` against the exact archive. It checked path/DACL, manifest SHA-256, pinned age/pg_restore/DLLs, streamed age decryption into `pg_restore --list`, drained the complete ciphertext, and required both child exits to be zero. Identity, decrypted bytes, TOC text, and child stderr were not printed or written to disk. The subsequent reviewed isolated restores compared ledger, logical schema, counts, named values, and integrity. The weekly job remains paused.
