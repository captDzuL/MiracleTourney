import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ensureCaBundleAt, verifyCaBundleAt, buildPinnedPgEnv, PINNED_CA_PATH } from '../../scripts/operations/local-backup-ca.mjs';
import { assertOwnerOnlyDirectory } from '../../scripts/operations/local-backup-readiness.mjs';
import { validateSourceUrl } from '../../scripts/operations/local-backup-core.mjs';

const approvedSource = 'postgresql://backup:synthetic-secret@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&sslrootcert=system';
const expectedHash = '30b7a0242d363aa77faa2b2bb71f802c7890765e3350f8a566c4fccf4b7ad4f2';

test('creates only the pinned public bundle in a protected directory and never overwrites it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-ca-bundle-'));
  const directory = join(root, 'ca-trust');
  try {
    const path = await ensureCaBundleAt(directory);
    assert.equal(path, join(directory, 'ca-bundle.pem'));
    await assertOwnerOnlyDirectory(directory, 'TOOL_REJECTED', ['ca-bundle.pem']);
    const bytes = await readFile(path);
    assert.equal(bytes.length, 179722);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
    const before = await stat(path);
    assert.equal(await ensureCaBundleAt(directory), path);
    assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
    await writeFile(path, Buffer.from('synthetic tamper'));
    await assert.rejects(ensureCaBundleAt(directory), { code: 'TOOL_REJECTED' });
    assert.deepEqual(await readFile(path), Buffer.from('synthetic tamper'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects broad file ACL and a reparse-point ancestor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-ca-acl-'));
  const directory = join(root, 'ca-trust');
  const alias = join(root, 'through-junction');
  try {
    await ensureCaBundleAt(directory);
    const q = value => `'${value.replaceAll("'", "''")}'`;
    const junction = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `New-Item -ItemType Junction -Path ${q(alias)} -Target ${q(directory)} -ErrorAction Stop | Out-Null`], { encoding: 'utf8', windowsHide: true });
    assert.equal(junction.status, 0, 'synthetic junction creation');
    await assert.rejects(verifyCaBundleAt(alias), { code: 'TOOL_REJECTED' });
    const unsafe = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p=${q(join(directory, 'ca-bundle.pem'))};$a=[IO.File]::GetAccessControl($p);$r=New-Object Security.AccessControl.FileSystemAccessRule('Everyone',[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[IO.File]::SetAccessControl($p,$a)`], { encoding: 'utf8', windowsHide: true });
    assert.equal(unsafe.status, 0, 'synthetic broad ACE setup');
    await assert.rejects(verifyCaBundleAt(directory), { code: 'TOOL_REJECTED' });
  } finally {
    const q = value => `'${value.replaceAll("'", "''")}'`;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `if(Test-Path -LiteralPath ${q(alias)}){[IO.Directory]::Delete(${q(alias)})}`], { encoding: 'utf8', windowsHide: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('child libpq environment keeps fixed source and ignores inherited trust overrides', () => {
  const source = validateSourceUrl(approvedSource);
  const names = ['PGSSLROOTCERT', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = 'C:/synthetic/attacker.pem';
    const env = buildPinnedPgEnv(source);
    assert.equal(env.PGHOST, 'ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech');
    assert.equal(env.PGDATABASE, 'neondb');
    assert.equal(env.PGSSLMODE, 'verify-full');
    assert.equal(env.PGSSLROOTCERT, PINNED_CA_PATH);
    assert.equal(env.PGPASSWORD, 'synthetic-secret');
    for (const name of ['SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF']) assert.equal(Object.hasOwn(env, name), false);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
});
