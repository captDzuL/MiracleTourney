import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSourceUrl, validateOutputDirectory, runEncryptedBackup, verifyBackupPair, verifyPostgresDependencySet, publishCompleteFile, publishBackupPair } from '../../scripts/operations/local-backup-core.mjs';
import { PG18_DLL_SHA256 } from '../../scripts/operations/pg18-dll-hashes.mjs';
import { PINNED_CA_PATH } from '../../scripts/operations/local-backup-ca.mjs';

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

test('preserves a binary fixture stream and publishes a manifest after both commands succeed', async () => {
  const f = await fixture();
  const result = await runEncryptedBackup(config(f));
  assert.equal(result.bytes, 26);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual([...await readFile(result.archivePath)], [...Buffer.from('age-encryption.org/v1\n'), 0, 1, 2, 255]);
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.sha256, result.sha256);
  assert.equal(JSON.stringify(manifest).includes('synthetic-secret'), false);
  assert.equal((await readdir(f.root)).some(x => x.endsWith('.partial')), false);
  assert.equal((await stat(result.archivePath)).size, 26);
});

test('dump child receives only the fixed verified CA path despite inherited trust overrides', async () => {
  const f = await fixture();
  const names = ['PGSSLROOTCERT', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    await writeFile(f.dump, `if (process.env.PGSSLROOTCERT !== ${JSON.stringify(PINNED_CA_PATH)} || process.env.PGSSLMODE !== 'verify-full' || process.env.SSL_CERT_FILE || process.env.SSL_CERT_DIR || process.env.OPENSSL_CONF) process.exit(7); process.stdout.write(Buffer.from([0,1,2,255]));`);
    for (const name of names) process.env[name] = 'C:/synthetic/attacker.pem';
    const result = await runEncryptedBackup(config(f));
    assert.equal(result.bytes, 26);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
    await rm(f.root, { recursive: true, force: true });
  }
});

test('binds the manifest checkpoint snapshot to the dump argument', async () => {
  const f = await fixture();
  const snapshot = '00000003-0000001B-1';
  await writeFile(f.dump, `if (!process.argv.includes('--snapshot=${snapshot}')) process.exit(7); process.stdout.write(Buffer.from([0,1,2,255]));`);
  const checkpoint = { snapshot, appliedMigrations: 17, ledgerSha256: 'a'.repeat(64), schemaSha256: 'b'.repeat(64), tableCounts: { Event: 2 }, tableChecksumsMd5: { Event: 'c'.repeat(32) }, integrity: { invalidConstraints: 0, criticalUniqueIndexes: true } };
  const result = await runEncryptedBackup(config(f, { snapshotId: '00000003-0000001B-1', checkpoint }));
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.deepEqual(manifest.checkpoint, checkpoint);
  assert.equal(manifest.checkpoint.snapshot, snapshot);
  assert.equal(JSON.stringify(manifest).includes('synthetic-secret'), false);
  await assert.rejects(runEncryptedBackup(config(await fixture(), { snapshotId: snapshot, checkpoint: { ...checkpoint, snapshot: '00000003-0000001B-2' } })), { code: 'CONFIG_REJECTED' });
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

test('lost snapshot signal stops the dump without publishing a manifest', async () => {
  const f = await fixture('timeout');
  const controller = new AbortController();
  const pending = runEncryptedBackup(config(f, { signal: controller.signal, timeoutMs: 5000 }));
  await new Promise(resolve => setTimeout(resolve, 100));
  controller.abort();
  await assert.rejects(pending);
  assert.equal((await readdir(f.root)).some(name => name.endsWith('.json')), false);
});

test('timestamp collision cannot overwrite an existing archive', async () => {
  const f = await fixture();
  const first = await runEncryptedBackup(config(f));
  await assert.rejects(runEncryptedBackup(config(f)), { code: 'ARCHIVE_COLLISION' });
  assert.equal((await readFile(first.archivePath)).subarray(0, 22).toString(), 'age-encryption.org/v1\n');
});

test('CLI rejects injected readiness arguments even when environment claims readiness', () => {
  const cli = fileURLToPath(new URL('../../scripts/operations/local-backup.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--ready'], {
    encoding: 'utf8', env: { ...process.env, MIRACLE_BACKUP_ESCROW_CONFIRMED: 'yes', MIRACLE_BACKUP_ACL_CONFIRMED: 'yes', MIRACLE_BACKUP_SOURCE_URL: sourceUrl, MIRACLE_BACKUP_AGE_RECIPIENT: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CONFIG_REJECTED/);
  assert.equal(result.stderr.includes('synthetic-secret'), false);
});

test('checkpoint-only operator CLI rejects arguments before any source or backup action', () => {
  const cli = fileURLToPath(new URL('../../scripts/operations/local-backup-preflight.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--ready'], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^CONFIG_REJECTED\s*$/);
  assert.equal(result.stdout, '');
});

test('PostgreSQL dependency verifier rejects missing, changed, and unexpected adjacent DLLs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-dll-test-'));
  const dll = join(root, 'libpq.dll');
  const bytes = Buffer.from('approved-synthetic-dll');
  const expected = { 'libpq.dll': createHash('sha256').update(bytes).digest('hex') };
  try {
    await assert.rejects(verifyPostgresDependencySet(root, expected), { code: 'TOOL_REJECTED' });
    await writeFile(dll, bytes);
    await verifyPostgresDependencySet(root, expected);
    await writeFile(dll, Buffer.from('modified-synthetic-dll'));
    await assert.rejects(verifyPostgresDependencySet(root, expected), { code: 'TOOL_REJECTED' });
    await writeFile(dll, bytes);
    await writeFile(join(root, 'surprise.dll'), Buffer.from('unexpected'));
    await assert.rejects(verifyPostgresDependencySet(root, expected), { code: 'TOOL_REJECTED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('pinned PostgreSQL 18.6 runtime contains exactly the recorded 29 DLLs', async () => {
  const directory = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/pg18/bin/', import.meta.url));
  assert.equal(Object.keys(PG18_DLL_SHA256).length, 29);
  await verifyPostgresDependencySet(directory, PG18_DLL_SHA256);
});

test('publication exposes complete files and never replaces a colliding archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-publish-test-'));
  const partial = join(root, 'archive.partial');
  const final = join(root, 'archive.age');
  try {
    await writeFile(partial, Buffer.from('complete-archive'));
    await publishCompleteFile(partial, final);
    assert.equal((await readFile(final)).toString(), 'complete-archive');
    assert.equal((await readdir(root)).includes('archive.partial'), false);
    await writeFile(partial, Buffer.from('new-archive'));
    await assert.rejects(publishCompleteFile(partial, final), { code: 'ARCHIVE_COLLISION' });
    assert.equal((await readFile(final)).toString(), 'complete-archive');
    assert.equal((await readFile(partial)).toString(), 'new-archive');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed manifest publication leaves a complete orphan archive and the existing manifest unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-pair-test-'));
  const paths = { archivePartial: join(root, 'archive.partial'), archiveFinal: join(root, 'archive.age'), manifestPartial: join(root, 'archive.json.partial'), manifestFinal: join(root, 'archive.json') };
  try {
    await writeFile(paths.archivePartial, Buffer.from('complete-archive'));
    await writeFile(paths.manifestPartial, Buffer.from('new-manifest'));
    await writeFile(paths.manifestFinal, Buffer.from('existing-manifest'));
    await assert.rejects(publishBackupPair(paths), { code: 'ARCHIVE_COLLISION' });
    assert.equal((await readFile(paths.archiveFinal)).toString(), 'complete-archive');
    assert.equal((await readFile(paths.manifestFinal)).toString(), 'existing-manifest');
    assert.equal((await readFile(paths.manifestPartial)).toString(), 'new-manifest');
    assert.equal((await readdir(root)).includes('archive.partial'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const [failedStage, expectedWarning] of [['archive', 'ARCHIVE_PARTIAL_RETAINED'], ['manifest', 'MANIFEST_PARTIAL_RETAINED']]) {
  test(`${failedStage} partial cleanup failure reports a verified committed pair with a safe warning`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'miracle-cleanup-test-'));
    const paths = { archivePartial: join(root, 'archive.partial'), archiveFinal: join(root, 'archive.age'), manifestPartial: join(root, 'archive.json.partial'), manifestFinal: join(root, 'archive.json') };
    const archive = Buffer.from('complete-archive');
    try {
      await writeFile(paths.archivePartial, archive);
      await writeFile(paths.manifestPartial, JSON.stringify({ archive: 'archive.age', bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex') }));
      const cleanup = async path => {
        if (path === paths[`${failedStage}Partial`]) throw new Error('synthetic-secret-path');
        await unlink(path);
      };
      const warnings = await publishBackupPair(paths, cleanup);
      assert.deepEqual(warnings, [expectedWarning]);
      assert.equal(JSON.stringify(warnings).includes('synthetic-secret-path'), false);
      await verifyBackupPair(paths.archiveFinal, paths.manifestFinal);
      assert.equal((await readdir(root)).includes(`${failedStage === 'archive' ? 'archive' : 'archive.json'}.partial`), true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

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

test('runner pipes a synthetic dump through the pinned real age binary', async () => {
  const f = await fixture();
  const runtime = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/age/', import.meta.url));
  const keygen = join(runtime, 'age-keygen.exe');
  const age = join(runtime, 'age.exe');
  const identity = join(f.root, 'synthetic-identity.txt');
  try {
    assert.equal(spawnSync(keygen, ['-o', identity], { windowsHide: true }).status, 0);
    const recipient = (await readFile(identity, 'utf8')).match(/# public key: (age1\S+)/)?.[1];
    assert.ok(recipient);
    const result = await runEncryptedBackup(config(f, {
      agePath: age, ageSha256: '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0',
      ageArgsPrefix: [], recipient, timeoutMs: 5000,
    }));
    await verifyBackupPair(result.archivePath, result.manifestPath);
    const restored = spawnSync(age, ['-d', '-i', identity, '-o', '-', result.archivePath], { windowsHide: true });
    assert.equal(restored.status, 0);
    assert.deepEqual(restored.stdout, Buffer.from([0, 1, 2, 255]));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
