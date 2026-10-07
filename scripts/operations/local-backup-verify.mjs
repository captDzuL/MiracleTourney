import { execFile } from 'node:child_process';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertOwnerOnlyDirectory, verifyPinnedFile } from './local-backup-readiness.mjs';
import { verifyBackupPair, verifyPostgresDependencySet } from './local-backup-core.mjs';
import { PG18_DLL_SHA256 } from './pg18-dll-hashes.mjs';

const run = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(scriptDir, '../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime');
const output = resolve('E:/MiracleBackups');
const keyDirectory = resolve('E:/MiracleBackupKeys');

async function main() {
  if (process.argv.length !== 3) throw new Error('ARCHIVE_VERIFY_FAILED');
  const archive = process.argv[2];
  if (!isAbsolute(archive) || dirname(resolve(archive)).toLowerCase() !== output.toLowerCase() ||
      !/^miracle-neondb-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.age$/.test(basename(archive))) throw new Error('ARCHIVE_VERIFY_FAILED');
  await assertOwnerOnlyDirectory(output);
  await assertOwnerOnlyDirectory(keyDirectory, 'KEY_NOT_READY', ['identity.dpapi', 'recipient.txt', 'recovery-verified.json']);
  const pgBin = join(runtime, 'pg18/bin');
  await verifyPinnedFile(join(pgBin, 'pg_restore.exe'), '94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55');
  await verifyPinnedFile(join(runtime, 'age/age.exe'), '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0');
  await verifyPostgresDependencySet(pgBin, PG18_DLL_SHA256);
  const manifest = archive.slice(0, -4) + '.json';
  const pair = await verifyBackupPair(archive, manifest);
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(scriptDir, 'local-backup-verify.ps1'), '-ArchivePath', archive],
    { timeout: 7_500_000, windowsHide: true, maxBuffer: 4096 });
  const status = JSON.parse(stdout);
  if (status?.status !== 'ARCHIVE_VERIFIED' || status.bytes !== pair.bytes || status.sha256 !== pair.sha256) throw new Error('ARCHIVE_VERIFY_FAILED');
  process.stdout.write(`${JSON.stringify({ status: 'ARCHIVE_VERIFIED', bytes: pair.bytes, sha256: pair.sha256 })}\n`);
}

main().catch(() => { process.stderr.write('ARCHIVE_VERIFY_FAILED\n'); process.exitCode = 1; });
