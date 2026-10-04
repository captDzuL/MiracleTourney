import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSourceUrl, validateOutputDirectory, runEncryptedBackup, verifyBackupPair } from '../../scripts/operations/local-backup-core.mjs';

const sourceUrl = 'postgresql://backup:synthetic-secret@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&sslrootcert=system';
const nodeHash = createHash('sha256');
for await (const chunk of createReadStream(process.execPath)) nodeHash.update(chunk);
const executableSha256 = nodeHash.digest('hex');

test('rejects an unapproved source, database, or TLS setting', () => {
  assert.throws(() => validateSourceUrl('postgresql://u:p@ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech/neondb'), /SOURCE_REJECTED/);
  assert.throws(() => validateSourceUrl(sourceUrl.replace('/neondb?', '/other?')), /SOURCE_REJECTED/);
  assert.throws(() => validateSourceUrl(sourceUrl.replace('verify-full', 'require')), /SOURCE_REJECTED/);
  assert.throws(() => validateSourceUrl(sourceUrl.replace('ep-sparkling-night', 'ep-sparkling-night-pooler')), /SOURCE_REJECTED/);
});

test('returns direct libpq fields with a non-enumerable password', () => {
  const fields = validateSourceUrl(sourceUrl);
  assert.equal(fields.PGHOST, 'ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech');
  assert.equal(fields.PGDATABASE, 'neondb');
  assert.equal(fields.PGSSLMODE, 'verify-full');
  assert.equal(fields.PGPASSWORD, 'synthetic-secret');
  assert.equal(JSON.stringify(fields).includes('synthetic-secret'), false);
});

test('rejects the repository as an output directory', () => {
  assert.throws(() => validateOutputDirectory('E:/dev/MiracleTourney-gitnative'), /OUTPUT_REJECTED/);
});

async function fixture(mode = 'success') {
  const root = await mkdtemp(join(tmpdir(), 'miracle-backup-test-'));
  const dump = join(root, 'dump.mjs');
  const age = join(root, 'age.mjs');
  await writeFile(dump, `process.stdout.write(Buffer.from([0,1,2,255])); if (${JSON.stringify(mode)} === 'dump-fail') process.exitCode = 7; if (${JSON.stringify(mode)} === 'timeout') setTimeout(() => {}, 3000);`);
  await writeFile(age, `const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); if (${JSON.stringify(mode)} === 'age-fail') { process.stderr.write('synthetic-secret'); process.exit(9); } if (${JSON.stringify(mode)} === 'age-empty') process.exit(0); process.stdout.write(Buffer.concat([Buffer.from(${JSON.stringify(mode)} === 'age-garbage' ? 'garbage' : 'age-encryption.org/v1\\n'), ...chunks]));`);
  return { root, dump, age };
}

function config(f, extra = {}) {
  return {
    sourceUrl, outputDirectory: f.root, approvedOutputRoot: f.root,
    pgDumpPath: process.execPath, agePath: process.execPath,
    pgDumpSha256: executableSha256, ageSha256: executableSha256,
    pgDumpArgsPrefix: [f.dump], ageArgsPrefix: [f.age],
    recipient: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', escrowConfirmed: true,
    timeoutMs: 1000, now: new Date('2026-10-04T01:00:00.000Z'),
    ...extra,
  };
}

test('writes only encrypted bytes and an atomic manifest after both commands succeed', async () => {
  const f = await fixture();
  const result = await runEncryptedBackup(config(f));
  assert.equal(result.bytes, 26);
  assert.deepEqual([...await readFile(result.archivePath)], [...Buffer.from('age-encryption.org/v1\n'), 0, 1, 2, 255]);
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.sha256, result.sha256);
  assert.equal(JSON.stringify(manifest).includes('synthetic-secret'), false);
  assert.equal((await readdir(f.root)).some(x => x.endsWith('.partial')), false);
  assert.equal((await stat(result.archivePath)).size, 26);
});

for (const [mode, code] of [['dump-fail', 'DUMP_FAILED'], ['age-fail', 'ENCRYPT_FAILED'], ['age-empty', 'EMPTY_ARCHIVE'], ['age-garbage', 'ARCHIVE_INVALID'], ['timeout', 'BACKUP_TIMEOUT']]) {
  test(`${mode} does not create a success manifest or leak stderr`, async () => {
    const f = await fixture(mode);
    await assert.rejects(runEncryptedBackup(config(f)), error => {
      assert.equal(error.code, code);
      assert.equal(String(error).includes('synthetic-secret'), false);
      return true;
    });
    assert.equal((await readdir(f.root)).some(x => x.endsWith('.json')), false);
  });
}

test('rejects missing recipient and independent escrow confirmation', async () => {
  const f = await fixture();
  await assert.rejects(runEncryptedBackup(config(f, { recipient: '' })), { code: 'KEY_NOT_READY' });
  await assert.rejects(runEncryptedBackup(config(f, { escrowConfirmed: false })), { code: 'KEY_NOT_READY' });
});

test('exclusive lock prevents a concurrent run', async () => {
  const f = await fixture('timeout');
  const first = runEncryptedBackup(config(f, { timeoutMs: 300 }));
  await new Promise(resolve => setTimeout(resolve, 50));
  await assert.rejects(runEncryptedBackup(config(f)), { code: 'BACKUP_LOCKED' });
  await assert.rejects(first, { code: 'BACKUP_TIMEOUT' });
});

test('timestamp collision cannot overwrite an existing archive', async () => {
  const f = await fixture();
  const first = await runEncryptedBackup(config(f));
  await assert.rejects(runEncryptedBackup(config(f)), { code: 'ARCHIVE_COLLISION' });
  assert.equal((await readFile(first.archivePath)).subarray(0, 22).toString(), 'age-encryption.org/v1\n');
});

test('CLI refuses to run without independent recovery escrow', () => {
  const cli = fileURLToPath(new URL('../../scripts/operations/local-backup.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli], {
    encoding: 'utf8', env: { ...process.env, MIRACLE_BACKUP_ESCROW_CONFIRMED: '', MIRACLE_BACKUP_SOURCE_URL: sourceUrl },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /KEY_NOT_READY/);
  assert.equal(result.stderr.includes('synthetic-secret'), false);
});

test('ciphertext tampering is detected against the manifest digest', async () => {
  const f = await fixture();
  const result = await runEncryptedBackup(config(f));
  await verifyBackupPair(result.archivePath, result.manifestPath);
  const bytes = await readFile(result.archivePath);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(result.archivePath, bytes);
  await assert.rejects(verifyBackupPair(result.archivePath, result.manifestPath), { code: 'ARCHIVE_TAMPERED' });
});

test('official age binaries round-trip synthetic binary bytes and reject tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-age-roundtrip-'));
  const runtime = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/age/', import.meta.url));
  const keygen = join(runtime, 'age-keygen.exe');
  const age = join(runtime, 'age.exe');
  const identity = join(root, 'synthetic-identity.txt');
  const ciphertext = join(root, 'synthetic.age');
  const restored = join(root, 'synthetic-restored.bin');
  const data = Buffer.from([0, 1, 2, 3, 10, 13, 128, 255]);
  try {
    assert.equal(spawnSync(keygen, ['-o', identity], { windowsHide: true }).status, 0);
    const recipient = (await readFile(identity, 'utf8')).match(/# public key: (age1\S+)/)?.[1];
    assert.ok(recipient);
    assert.equal(spawnSync(age, ['-r', recipient, '-o', ciphertext], { input: data, windowsHide: true }).status, 0);
    assert.equal(spawnSync(age, ['-d', '-i', identity, '-o', restored, ciphertext], { windowsHide: true }).status, 0);
    assert.deepEqual(await readFile(restored), data);
    const altered = await readFile(ciphertext);
    altered[altered.length - 1] ^= 1;
    await writeFile(ciphertext, altered);
    assert.notEqual(spawnSync(age, ['-d', '-i', identity, '-o', '-', ciphertext], { windowsHide: true }).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
