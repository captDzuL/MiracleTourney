import { readFile } from 'node:fs/promises';
import { runTestingEncryptedBackup, verifyBackupPair } from './local-backup-core.mjs';
import { assertOwnerOnlyDirectory, assertOutputCapacity } from './local-backup-readiness.mjs';
import { buildCheckpointSql, LEGACY_TABLES, runSnapshotSession, validateCheckpoint } from './local-backup-snapshot.mjs';
import { prepareFixedTestingExport } from './local-backup-operator.mjs';
import { assertCanonicalLedgerLf, assertTestingBackupReceipt, TESTING_IDENTITY } from './testing-schema-core.mjs';
import { verifyTestingFrontendTls } from './testing-schema-tls.mjs';

function fail(code) { const error = new Error(code); error.code = code; return error; }

function buildTestingCheckpointSql() {
  const sql = buildCheckpointSql();
  const needle = "'source', json_build_object('database', current_database(),";
  if (sql.split(needle).length !== 2) throw fail('CONFIG_REJECTED');
  return sql.replace(needle, "'source', json_build_object('branch', current_setting('neon.branch_id', true), 'database', current_database(),");
}

async function main() {
  if (process.argv.length !== 2) throw fail('CONFIG_REJECTED');
  const config = await prepareFixedTestingExport();
  await verifyTestingFrontendTls();
  const result = await runSnapshotSession({
    path: config.psqlPath,
    args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
    env: config.pgEnv, sql: buildTestingCheckpointSql(), timeoutMs: 7_500_000,
  }, async (raw, signal) => {
    if (raw.source?.branch !== TESTING_IDENTITY.branch || raw.source?.database !== TESTING_IDENTITY.database) throw fail('CHECKPOINT_DRIFT');
    assertCanonicalLedgerLf(raw.ledger, config.expectedLedger);
    const checkpoint = validateCheckpoint(raw, config.expectedLedger, LEGACY_TABLES);
    await assertOwnerOnlyDirectory(config.output);
    await assertOutputCapacity(config.output);
    const completed = await runTestingEncryptedBackup({
      sourceUrl: config.source.url,
      outputDirectory: config.output, approvedOutputRoot: config.output,
      pgDumpPath: config.pgDumpPath, pgDumpSha256: config.pgDumpSha256,
      agePath: config.agePath, ageSha256: config.ageSha256,
      recipient: config.recipient, escrowConfirmed: true,
      snapshotId: checkpoint.snapshot, checkpoint,
      timeoutMs: 7_200_000, signal,
      beforePublish: async () => {
        await assertOwnerOnlyDirectory(config.output);
        await assertOutputCapacity(config.output);
      },
    });
    const verified = await verifyBackupPair(completed.archivePath, completed.manifestPath);
    const manifest = JSON.parse(await readFile(completed.manifestPath, 'utf8'));
    assertTestingBackupReceipt(manifest, verified, checkpoint);
    return completed;
  });
  process.stdout.write(`${JSON.stringify({ status: 'TESTING_ENCRYPTED_BACKUP_COMPLETE', archive: result.archivePath,
    manifest: result.manifestPath, bytes: result.bytes, sha256: result.sha256, warnings: result.warnings })}\n`);
}

main().catch(error => {
  const allowed = new Set(['CONFIG_REJECTED', 'SOURCE_REJECTED', 'OUTPUT_REJECTED', 'CAPACITY_REJECTED', 'KEY_NOT_READY',
    'TOOL_REJECTED', 'CHECKPOINT_DRIFT', 'CHECKPOINT_FAILED', 'BACKUP_LOCKED', 'ARCHIVE_COLLISION', 'BACKUP_TIMEOUT',
    'DUMP_FAILED', 'ENCRYPT_FAILED', 'EMPTY_ARCHIVE', 'ARCHIVE_INVALID', 'ARCHIVE_TAMPERED', 'BACKUP_REJECTED', 'TLS_REJECTED']);
  process.stderr.write(`${allowed.has(error?.code) ? error.code : 'BACKUP_FAILED'}\n`);
  process.exitCode = 1;
});
