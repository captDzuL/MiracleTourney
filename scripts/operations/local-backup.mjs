import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'dotenv';
import { runEncryptedBackup, validateOutputDirectory, validateSourceUrl, verifyPostgresDependencySet, verifyBackupPair } from './local-backup-core.mjs';
import { assertOwnerOnlyDirectory, assertOutputCapacity, assertRecoveryReady, normalizeProtectedSourceUrl, verifyPinnedFile } from './local-backup-readiness.mjs';
import { buildCheckpointSql, LEGACY_MIGRATIONS, LEGACY_TABLES, loadExpectedLedger, runSnapshotSession, validateCheckpoint } from './local-backup-snapshot.mjs';
import { PG18_DLL_SHA256 } from './pg18-dll-hashes.mjs';

const run = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scriptDir, '../..');
const runtime = resolve(repository, '.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime');
const pgBin = join(runtime, 'pg18/bin');
const snapshotBin = join(runtime, 'snapshot-client/pgsql/bin');
const ageBin = join(runtime, 'age');
const output = 'E:/MiracleBackups';
const keyDirectory = 'E:/MiracleBackupKeys';
const sourceFile = 'E:/dev/MiracleTourney-gitnative/.env';
const recipient = 'age1gy00y8k4wct4gap558p3k4h8ppecp86pxr9xnyz0mjajwkhw5ewsjlg8s8';
const pins = Object.freeze({
  pgArchive: 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2',
  pgDump: '9414dac0554065aa6edf739d7126b6e6e6d6fc3b56b9706b72cee47cee45b22c',
  pgRestore: '94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55',
  psql: 'fde952534f520909c02db04675588ecb1da8d618b6e5c93e106f42a752daf720',
  ageArchive: 'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7',
  age: '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0',
  ageKeygen: '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c',
});

function fail(code) { const error = new Error(code); error.code = code; return error; }

async function readKeyStatus() {
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(scriptDir, 'local-backup-key.ps1'), '-Mode', 'Status'],
      { timeout: 30000, windowsHide: true, maxBuffer: 4096 });
    return JSON.parse(stdout);
  } catch { throw fail('KEY_NOT_READY'); }
}

async function verifyTools() {
  await verifyPinnedFile(join(runtime, 'postgresql-18.6-windows-x64-binaries.zip'), pins.pgArchive);
  await verifyPinnedFile(join(runtime, 'age-v1.3.2-windows-amd64.zip'), pins.ageArchive);
  await verifyPinnedFile(join(pgBin, 'pg_dump.exe'), pins.pgDump);
  await verifyPinnedFile(join(pgBin, 'pg_restore.exe'), pins.pgRestore);
  await verifyPinnedFile(join(snapshotBin, 'psql.exe'), pins.psql);
  await verifyPinnedFile(join(ageBin, 'age.exe'), pins.age);
  await verifyPinnedFile(join(ageBin, 'age-keygen.exe'), pins.ageKeygen);
  await verifyPostgresDependencySet(pgBin, PG18_DLL_SHA256);
  await verifyPostgresDependencySet(snapshotBin, PG18_DLL_SHA256);
}

async function readSource() {
  try {
    const entries = parse(await readFile(sourceFile));
    if (typeof entries.DIRECT_URL !== 'string') throw fail('SOURCE_REJECTED');
    const normalized = normalizeProtectedSourceUrl(entries.DIRECT_URL);
    return { url: normalized, fields: validateSourceUrl(normalized) };
  } catch { throw fail('SOURCE_REJECTED'); }
}

async function main() {
  if (process.argv.length !== 2) throw fail('CONFIG_REJECTED');
  validateOutputDirectory(output, output);
  await assertOwnerOnlyDirectory(output);
  await assertOutputCapacity(output);
  await assertOwnerOnlyDirectory(keyDirectory, 'KEY_NOT_READY', ['identity.dpapi', 'recipient.txt', 'recovery-verified.json']);
  const keyStatus = await readKeyStatus();
  await assertRecoveryReady(keyStatus, join(keyDirectory, 'recovery-verified.json'), recipient);
  await verifyTools();
  const source = await readSource();
  const expectedLedger = await loadExpectedLedger(join(repository, 'prisma/migrations'), LEGACY_MIGRATIONS);
  // The credential remains in this process and the two libpq child
  // environments. Neither argv nor output carries it.
  const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_)/i.test(name)));
  Object.assign(pgEnv, source.fields);
  pgEnv.PGPASSWORD = source.fields.PGPASSWORD;
  pgEnv.PGCLIENTENCODING = 'UTF8';
  pgEnv.PGCONNECT_TIMEOUT = '15';
  const result = await runSnapshotSession({
    path: join(snapshotBin, 'psql.exe'),
    args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse'],
    env: pgEnv, sql: buildCheckpointSql(), timeoutMs: 7_500_000,
  }, async (raw, signal) => {
    const checkpoint = validateCheckpoint(raw, expectedLedger, LEGACY_TABLES);
    await assertOwnerOnlyDirectory(output);
    await assertOutputCapacity(output);
    const completed = await runEncryptedBackup({
      sourceUrl: source.url,
      outputDirectory: output, approvedOutputRoot: output,
      pgDumpPath: join(pgBin, 'pg_dump.exe'), pgDumpSha256: pins.pgDump,
      agePath: join(ageBin, 'age.exe'), ageSha256: pins.age,
      recipient, escrowConfirmed: true, snapshotId: checkpoint.snapshot, checkpoint,
      timeoutMs: 7_200_000,
      signal,
      beforePublish: async () => { await assertOwnerOnlyDirectory(output); await assertOutputCapacity(output); },
    });
    await verifyBackupPair(completed.archivePath, completed.manifestPath);
    return completed;
  });
  process.stdout.write(`${JSON.stringify({ status: 'ENCRYPTED_BACKUP_COMPLETE', archive: result.archivePath, manifest: result.manifestPath, bytes: result.bytes, sha256: result.sha256, warnings: result.warnings })}\n`);
}

main().catch(error => {
  const allowed = new Set(['CONFIG_REJECTED', 'SOURCE_REJECTED', 'OUTPUT_REJECTED', 'CAPACITY_REJECTED', 'KEY_NOT_READY', 'TOOL_REJECTED', 'CHECKPOINT_DRIFT', 'CHECKPOINT_FAILED', 'BACKUP_LOCKED', 'ARCHIVE_COLLISION', 'BACKUP_TIMEOUT', 'DUMP_FAILED', 'ENCRYPT_FAILED', 'EMPTY_ARCHIVE', 'ARCHIVE_INVALID', 'ARCHIVE_TAMPERED']);
  process.stderr.write(`${allowed.has(error?.code) ? error.code : 'BACKUP_FAILED'}\n`);
  process.exitCode = 1;
});
