import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runEncryptedBackup } from './local-backup-core.mjs';

const runtime = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/', import.meta.url));

async function main() {
  if (process.env.MIRACLE_BACKUP_ESCROW_CONFIRMED !== 'yes') throw Object.assign(new Error('KEY_NOT_READY'), { code: 'KEY_NOT_READY' });
  if (process.env.MIRACLE_BACKUP_ACL_CONFIRMED !== 'yes') throw Object.assign(new Error('OUTPUT_REJECTED'), { code: 'OUTPUT_REJECTED' });
  const result = await runEncryptedBackup({
    sourceUrl: process.env.MIRACLE_BACKUP_SOURCE_URL,
    outputDirectory: 'E:/MiracleBackups',
    approvedOutputRoot: 'E:/MiracleBackups',
    pgDumpPath: resolve(runtime, 'pg18/bin/pg_dump.exe'),
    pgDumpSha256: '9414dac0554065aa6edf739d7126b6e6e6d6fc3b56b9706b72cee47cee45b22c',
    agePath: resolve(runtime, 'age/age.exe'),
    ageSha256: '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0',
    recipient: process.env.MIRACLE_BACKUP_AGE_RECIPIENT,
    escrowConfirmed: true,
    timeoutMs: 30 * 60 * 1000,
  });
  process.stdout.write(JSON.stringify({ status: 'encrypted', bytes: result.bytes, sha256: result.sha256, archive: result.archivePath, manifest: result.manifestPath }) + '\n');
}

main().catch(error => {
  const known = new Set(['KEY_NOT_READY', 'OUTPUT_REJECTED', 'SOURCE_REJECTED', 'TOOL_REJECTED', 'CONFIG_REJECTED', 'BACKUP_LOCKED', 'ARCHIVE_COLLISION', 'BACKUP_TIMEOUT', 'DUMP_FAILED', 'ENCRYPT_FAILED', 'EMPTY_ARCHIVE', 'ARCHIVE_INVALID', 'BACKUP_FAILED']);
  process.stderr.write((known.has(error?.code) ? error.code : 'BACKUP_FAILED') + '\n');
  process.exitCode = 1;
});
