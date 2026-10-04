import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../../scripts/operations/local-backup-key.psm1', import.meta.url));
const verifyCli = fileURLToPath(new URL('../../scripts/operations/local-backup-verify.mjs', import.meta.url));
const runtime = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/age/', import.meta.url));
const age = join(runtime, 'age.exe');
const keygen = join(runtime, 'age-keygen.exe');
const ageHash = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0';
const keygenHash = '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c';
const nodeHash = createHash('sha256').update(await readFile(process.execPath)).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

function run(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop';Import-Module ${literal(modulePath)} -Force -DisableNameChecking;try{${script}}catch{[Console]::Error.WriteLine('ARCHIVE_VERIFY_FAILED');exit 1}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 4096 });
  assert.equal((result.stdout + result.stderr).includes('AGE-SECRET-KEY-'), false);
  assert.equal((result.stdout + result.stderr).includes('TOC-private-data'), false);
  assert.equal((result.stdout + result.stderr).includes('synthetic-secret'), false);
  return result;
}

async function fixture(mode = 'good') {
  const parent = await mkdtemp(join(tmpdir(), 'miracle-verify-'));
  const root = join(parent, 'protected');
  const setup = run(`Initialize-BackupKey -KeyDirectory ${literal(root)} -ApprovedRoot ${literal(root)} -AgeKeygenPath ${literal(keygen)} -AgePath ${literal(age)} -ExpectedKeygenSha256 ${literal(keygenHash)} -ExpectedAgeSha256 ${literal(ageHash)} | ConvertTo-Json -Compress`);
  assert.equal(setup.status, 0, setup.stderr);
  const recipient = JSON.parse(setup.stdout).recipient;
  const archive = join(root, 'miracle-neondb-2026-10-04T01-00-00-000Z.age');
  const encrypted = spawnSync(age, ['-e', '-r', recipient, '-o', archive], { input: Buffer.from('PGDMP-synthetic'), windowsHide: true });
  assert.equal(encrypted.status, 0);
  const bytes = await readFile(archive);
  await writeFile(archive.replace(/\.age$/, '.json'), JSON.stringify({ archive: archive.split(/[\\/]/).at(-1), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
  const restore = join(root, 'fake-restore.mjs');
  await writeFile(restore, `const chunks=[];for await(const c of process.stdin)chunks.push(c);const body=Buffer.concat(chunks).toString();if(${JSON.stringify(mode)}==='fail'){process.stderr.write('synthetic-secret');process.exit(9)}if(!body.startsWith('PGDMP-synthetic'))process.exit(8);process.stdout.write('TOC-private-data');`);
  const invoke = `Test-BackupArchive -KeyDirectory ${literal(root)} -ApprovedRoot ${literal(root)} -OutputDirectory ${literal(root)} -ApprovedOutputRoot ${literal(root)} -ArchivePath ${literal(archive)} -AgePath ${literal(age)} -ExpectedAgeSha256 ${literal(ageHash)} -PgRestorePath ${literal(process.execPath)} -ExpectedPgRestoreSha256 ${literal(nodeHash)} -PgRestoreArgsPrefix @(${literal(restore)}) | ConvertTo-Json -Compress`;
  return { parent, root, archive, invoke };
}

test('verification authenticates synthetic age stream and discards restore listing', async () => {
  const f = await fixture();
  try {
    const result = run(f.invoke);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'ARCHIVE_VERIFIED', result.stdout);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('tampered ciphertext cannot pass even if restore sees a valid prefix', async () => {
  const f = await fixture();
  try {
    const bytes = await readFile(f.archive);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(f.archive, bytes);
    await writeFile(f.archive.replace(/\.age$/, '.json'), JSON.stringify({ archive: f.archive.split(/[\\/]/).at(-1), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
    const result = run(f.invoke);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ARCHIVE_VERIFY_FAILED/);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('truncated ciphertext cannot pass after a matching manifest is written', async () => {
  const f = await fixture();
  try {
    const bytes = (await readFile(f.archive)).subarray(0, 120);
    await writeFile(f.archive, bytes);
    await writeFile(f.archive.replace(/\.age$/, '.json'), JSON.stringify({ archive: f.archive.split(/[\\/]/).at(-1), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
    const result = run(f.invoke);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ARCHIVE_VERIFY_FAILED/);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('restore child failure cannot leak stderr or pass', async () => {
  const f = await fixture('fail');
  try {
    const result = run(f.invoke);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ARCHIVE_VERIFY_FAILED/);
  } finally { await rm(f.parent, { recursive: true, force: true }); }
});

test('verification CLI rejects readiness arguments without opening an archive', () => {
  const result = spawnSync(process.execPath, [verifyCli, '--ready'], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ARCHIVE_VERIFY_FAILED/);
});
