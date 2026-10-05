import { runEncryptedBackup, verifyBackupPair } from './local-backup-core.mjs';
import { assertOwnerOnlyDirectory, assertOutputCapacity } from './local-backup-readiness.mjs';
import { buildCheckpointSql, LEGACY_TABLES, runSnapshotSession, validateCheckpoint } from './local-backup-snapshot.mjs';
import { prepareFixedExport } from './local-backup-operator.mjs';

function fail(code) { const error = new Error(code); error.code = code; return error; }

async function main() {
  if (process.argv.length !== 2) throw fail('CONFIG_REJECTED');
  const config = await prepareFixedExport();
  const result = await runSnapshotSession({
    path: config.psqlPath,
    args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
    env: config.pgEnv, sql: buildCheckpointSql(), timeoutMs: 7_500_000,
  }, async (raw, signal) => {
    const checkpoint = validateCheckpoint(raw, config.expectedLedger, LEGACY_TABLES);
    await assertOwnerOnlyDirectory(config.output);
    await assertOutputCapacity(config.output);
    const completed = await runEncryptedBackup({
      sourceUrl: config.source.url,
      outputDirectory: config.output, approvedOutputRoot: config.output,
      pgDumpPath: config.pgDumpPath, pgDumpSha256: config.pgDumpSha256,
      agePath: config.agePath, ageSha256: config.ageSha256,
      recipient: config.recipient, escrowConfirmed: true,
      snapshotId: checkpoint.snapshot, checkpoint,
      timeoutMs: 7_200_000,
      signal,
      beforePublish: async () => {
        await assertOwnerOnlyDirectory(config.output);
        await assertOutputCapacity(config.output);
      },
    });
    await verifyBackupPair(completed.archivePath, completed.manifestPath);
    return completed;
  });
  process.stdout.write(`${JSON.stringify({ status: 'ENCRYPTED_BACKUP_COMPLETE', archive: result.archivePath, manifest: result.manifestPath, bytes: result.bytes, sha256: result.sha256, warnings: result.warnings })}\n`);
}

main().catch(error => {
  const allowed = new Set(['CONFIG_REJECTED', 'SOURCE_REJECTED', 'OUTPUT_REJECTED', 'CAPACITY_REJECTED', 'KEY_NOT_READY', 'TOOL_REJECTED', 'CHECKPOINT_DRIFT', 'CHECKPOINT_FAILED', 'BACKUP_LOCKED', 'ARCHIVE_COLLISION', 'BACKUP_TIMEOUT', 'DUMP_FAILED', 'ENCRYPT_FAILED', 'EMPTY_ARCHIVE', 'ARCHIVE_INVALID', 'ARCHIVE_TAMPERED']);
  const code = allowed.has(error?.code) ? error.code : 'BACKUP_FAILED';
  const diagnostics = new Set(['TIMEOUT', 'TLS_CHAIN', 'TLS_HOSTNAME', 'TLS_CA_LOAD', 'AUTH', 'TLS_OTHER', 'SQL', 'UNKNOWN']);
  const suffix = code === 'CHECKPOINT_FAILED' && diagnostics.has(error?.diagnostic) ? `:${error.diagnostic}` : '';
  process.stderr.write(`${code}${suffix}\n`);
  process.exitCode = 1;
});
