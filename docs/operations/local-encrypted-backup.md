# Local encrypted backup preparation

This is a guarded local preparation for the approved production `neondb` source. It has **not** exported production data. The weekly job remains paused. Do not run the entry point against production until independent private-key escrow, owner-only directory ACLs, tool provenance, and a fresh review are recorded.

## Prepared tools

The task-owned, Git-ignored runtime is `.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime`. It contains only `pg_dump.exe`, `pg_restore.exe`, adjacent PostgreSQL DLLs, `age.exe`, and `age-keygen.exe` extracted from vendor archives. No PostgreSQL server, service, global PATH entry, or installed PostgreSQL 16 file was changed.

| Tool | Source | Version | Local SHA-256 |
| --- | --- | --- | --- |
| PostgreSQL Windows ZIP | [EDB PostgreSQL binary page](https://www.enterprisedb.com/download-postgresql-binaries), 18.6 Windows x86-64 file ID `1260609` | 18.6 | `e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2` |
| `pg_dump.exe` | extracted from ZIP above | 18.6 | `9414dac0554065aa6edf739d7126b6e6e6d6fc3b56b9706b72cee47cee45b22c` |
| `pg_restore.exe` | extracted from ZIP above | 18.6 | `94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55` |
| age Windows ZIP | [age v1.3.2 release](https://github.com/FiloSottile/age/releases/tag/v1.3.2) | 1.3.2 | `f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7` |
| `age.exe` | extracted from ZIP above | 1.3.2 | `2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0` |
| `age-keygen.exe` | extracted from ZIP above; synthetic tests only | 1.3.2 | `1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c` |

The age archive hash matches the official GitHub release API digest. The EDB download came through its official HTTPS page and the local hashes above record exactly what was obtained; no independent EDB ZIP checksum was located. Windows reports the extracted executables as `NotSigned`. The PostgreSQL DLLs are not yet individually pinned. These provenance limits require review before any production export.

## Runner behavior and limits

`scripts/operations/local-backup.mjs` reads the source URL and public age recipient from process environment. The private identity is neither needed for encryption nor accepted by this entry point. The runner passes PostgreSQL credentials to `pg_dump` only through libpq environment variables. It requires the exact approved direct Neon host, database `neondb`, `sslmode=verify-full`, and `sslrootcert=system`; URL query overrides and pooler hosts are rejected. Its output root is exactly `E:/MiracleBackups`, with symlink/reparse resolution checks.

The entry point refuses to start unless `MIRACLE_BACKUP_ESCROW_CONFIRMED=yes` and `MIRACLE_BACKUP_ACL_CONFIRMED=yes` are set. These are operator attestations, not proof of either condition. The owner must establish an independent recovery copy of the private identity and inspect the Windows ACL before setting them. DPAPI on this machine alone is insufficient. Do not store a private identity in Git, the backup directory, command arguments, or chat. No live identity was generated in this task.

The runner checks pinned `pg_dump.exe` and `age.exe` hashes, takes an exclusive lock, creates a new `.partial` file, pipes custom-format dump bytes directly to age, checks both child exits and a bounded timeout, verifies a nonempty age header and SHA-256, then publishes a timestamped `.age` file and a redacted `.json` manifest. Existing archive names are never deliberately overwritten. A failed run has no success manifest; partial evidence may remain and requires manual inspection. The manifest hash detects later byte changes, but is not an authenticated signature. Before a backup is accepted as recoverable, separately decrypt it and inspect the PostgreSQL archive without printing data, then perform the planned isolated restore in a later reviewed task.

The current focused tests use synthetic process streams and a temporary synthetic age identity only. They do not contact Neon or exercise a production key. Test invocation on this managed machine needs child-process permission:

`node --test --test-isolation=none tests/operations/local-backup.test.mjs`

## Remaining production gates

1. Owner chooses and verifies independent private-key escrow, separate from this PC and DPAPI. Record custody without recording the private key.
2. Create `E:/MiracleBackups` with owner-only ACLs; verify resolved path and permissions. The current runner checks path identity but cannot itself prove an owner-only Windows DACL.
3. Review EDB provenance and pin the adjacent PostgreSQL DLLs before trusting the toolset for live data.
4. Supply the approved direct endpoint credentials and public age recipient locally, review the runner SHA, then authorize one live encrypted export and independent restore verification. The weekly automation remains paused until those reviews complete.
