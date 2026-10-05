import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../../scripts/operations/local-backup-key.psm1', import.meta.url));
const verifyCli = fileURLToPath(new URL('../../scripts/operations/local-backup-verify.mjs', import.meta.url));
const runtime = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/age/', import.meta.url));
const age = join(runtime, 'age.exe');
const keygen = join(runtime, 'age-keygen.exe');
const pgBin = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/pg18/bin/', import.meta.url));
const catalogBin = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-v3-release-pr-readiness/runtime/catalog-server/pgsql/bin/', import.meta.url));
const pgRestore = join(pgBin, 'pg_restore.exe');
const pgDump = join(pgBin, 'pg_dump.exe');
const pgRestoreHash = '94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55';
const ageHash = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0';
const keygenHash = '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c';
const nodeHash = createHash('sha256').update(await readFile(process.execPath)).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_)/i.test(key)));

function quietStatus(exe, args, env = {}) {
  return spawnSync(exe, args, { windowsHide: true, timeout: 30000, stdio: 'ignore', env: { ...cleanEnv, ...env } }).status;
}

function childExit(child) {
  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('close', resolveExit);
  });
}

async function unusedLoopbackPort() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const server = net.createServer();
    await new Promise((resolveReady, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveReady);
    });
    const port = server.address().port;
    await new Promise(resolveClosed => server.close(resolveClosed));
    if (port !== 55438) return port;
  }
  throw new Error('No permitted synthetic loopback port');
}

function protectScratch(path) {
  const script = `$p=${literal(path)};$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$f=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit;$r=New-Object Security.AccessControl.FileSystemAccessRule($s,[Security.AccessControl.FileSystemRights]::FullControl,$f,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$a)`;
  assert.equal(quietStatus('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]), 0, 'owner-only scratch ACL');
}

async function removeScratch(path) {
  assert.equal(resolve(dirname(path)), resolve(tmpdir()), 'scratch must stay under temp root');
  assert.match(basename(path), /^miracle-verify-/);
  await rm(path, { recursive: true, force: true });
}

function run(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop';Import-Module ${literal(modulePath)} -Force -DisableNameChecking;try{${script}}catch{[Console]::Error.WriteLine('ARCHIVE_VERIFY_FAILED');exit 1}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 4096 });
  assert.equal((result.stdout + result.stderr).includes('AGE-SECRET-KEY-'), false);
  assert.equal((result.stdout + result.stderr).includes('TOC-private-data'), false);
  assert.equal((result.stdout + result.stderr).includes('synthetic-secret'), false);
  return result;
}

async function fixture(mode = 'good') {
  const parent = await mkdtemp(join(tmpdir(), 'miracle-verify-'));
  protectScratch(parent);
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
  await writeFile(restore, `if(process.argv.slice(2).join(',')!=='--list')process.exit(7);const chunks=[];for await(const c of process.stdin)chunks.push(c);const body=Buffer.concat(chunks).toString();if(${JSON.stringify(mode)}==='fail'){process.stderr.write('synthetic-secret');process.exit(9)}if(!body.startsWith('PGDMP-synthetic'))process.exit(8);process.stdout.write('TOC-private-data');`);
  const invoke = `Test-BackupArchive -KeyDirectory ${literal(root)} -ApprovedRoot ${literal(root)} -OutputDirectory ${literal(root)} -ApprovedOutputRoot ${literal(root)} -ArchivePath ${literal(archive)} -AgePath ${literal(age)} -ExpectedAgeSha256 ${literal(ageHash)} -PgRestorePath ${literal(process.execPath)} -ExpectedPgRestoreSha256 ${literal(nodeHash)} -PgRestoreArgsPrefix @(${literal(restore)}) | ConvertTo-Json -Compress`;
  return { parent, root, archive, invoke };
}

test('verification authenticates synthetic age stream and discards restore listing', async () => {
  const f = await fixture();
  try {
    const result = run(f.invoke);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'ARCHIVE_VERIFIED', result.stdout);
  } finally { await removeScratch(f.parent); }
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
  } finally { await removeScratch(f.parent); }
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
  } finally { await removeScratch(f.parent); }
});

test('restore child failure cannot leak stderr or pass', async () => {
  const f = await fixture('fail');
  try {
    const result = run(f.invoke);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ARCHIVE_VERIFY_FAILED/);
  } finally { await removeScratch(f.parent); }
});

test('pinned pg_restore authenticates a large synthetic archive from stdin without revealing its TOC', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'miracle-verify-'));
  const root = join(parent, 'protected');
  const data = join(parent, 'data');
  const pwfile = join(parent, 'synthetic-pwfile');
  const log = join(parent, 'server.log');
  const archive = join(root, 'miracle-neondb-2026-10-04T01-00-00-000Z.age');
  const password = randomBytes(24).toString('hex');
  let started = false;
  try {
    protectScratch(parent);
    const setup = run(`Initialize-BackupKey -KeyDirectory ${literal(root)} -ApprovedRoot ${literal(root)} -AgeKeygenPath ${literal(keygen)} -AgePath ${literal(age)} -ExpectedKeygenSha256 ${literal(keygenHash)} -ExpectedAgeSha256 ${literal(ageHash)} | ConvertTo-Json -Compress`);
    assert.equal(setup.status, 0, setup.stderr);
    const recipient = JSON.parse(setup.stdout).recipient;
    await writeFile(pwfile, password);
    assert.equal(quietStatus(join(catalogBin, 'initdb.exe'), ['-D', data, '-U', 'synthetic_archive', '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile', pwfile, '--no-instructions']), 0, 'initdb synthetic cluster');
    await unlink(pwfile);
    const port = await unusedLoopbackPort();
    assert.equal(quietStatus(join(catalogBin, 'pg_ctl.exe'), ['-D', data, '-l', log, '-o', `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start']), 0, 'start owned loopback cluster');
    started = true;
    const env = { PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'synthetic_archive', PGDATABASE: 'postgres', PGPASSWORD: password, PGSSLMODE: 'disable' };
    const sql = `CREATE TABLE public."TOC-private-data" (id integer PRIMARY KEY, payload text); INSERT INTO public."TOC-private-data" SELECT i, md5(i::text || random()::text) || md5(i::text || random()::text) || md5(i::text || random()::text) || md5(i::text || random()::text) FROM generate_series(1, 10000) AS i`;
    assert.equal(quietStatus(join(catalogBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], env), 0, 'populate only synthetic data');
    const dump = spawn(pgDump, ['--format=custom', '--no-owner', '--no-acl'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: { ...cleanEnv, ...env } });
    const encrypt = spawn(age, ['-e', '-r', recipient, '-o', archive], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], env: cleanEnv });
    const results = await Promise.allSettled([pipeline(dump.stdout, encrypt.stdin), childExit(dump), childExit(encrypt)]);
    assert.equal(results[0].status, 'fulfilled', 'direct dump-to-age stream');
    assert.deepEqual(results.slice(1).map(result => result.value), [0, 0], 'both export children exit cleanly');
    const bytes = await readFile(archive);
    assert.ok(bytes.length > 256 * 1024, 'encrypted fixture exceeds typical pipe buffering');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(archive.replace(/\.age$/, '.json'), JSON.stringify({ archive: basename(archive), bytes: bytes.length, sha256 }));
    const invoke = `Test-BackupArchive -KeyDirectory ${literal(root)} -ApprovedRoot ${literal(root)} -OutputDirectory ${literal(root)} -ApprovedOutputRoot ${literal(root)} -ArchivePath ${literal(archive)} -AgePath ${literal(age)} -ExpectedAgeSha256 ${literal(ageHash)} -PgRestorePath ${literal(pgRestore)} -ExpectedPgRestoreSha256 ${literal(pgRestoreHash)} | ConvertTo-Json -Compress`;
    const verified = run(invoke);
    assert.equal(verified.status, 0, verified.stderr);
    assert.deepEqual(JSON.parse(verified.stdout), { status: 'ARCHIVE_VERIFIED', bytes: bytes.length, sha256 });
    assert.equal((verified.stdout + verified.stderr).includes('TOC-private-data'), false);
    for (const damaged of [(() => { const copy = Buffer.from(bytes); copy[copy.length - 1] ^= 1; return copy; })(), bytes.subarray(0, bytes.length - 20)]) {
      await writeFile(archive, damaged);
      await writeFile(archive.replace(/\.age$/, '.json'), JSON.stringify({
        archive: basename(archive), bytes: damaged.length, sha256: createHash('sha256').update(damaged).digest('hex'),
      }));
      const rejected = run(invoke);
      assert.notEqual(rejected.status, 0, 'changed ciphertext must fail despite matching manifest');
      assert.match(rejected.stderr, /ARCHIVE_VERIFY_FAILED/);
      assert.equal((rejected.stdout + rejected.stderr).includes('TOC-private-data'), false);
    }
  } finally {
    if (started) assert.equal(quietStatus(join(catalogBin, 'pg_ctl.exe'), ['-D', data, '-m', 'immediate', '-w', 'stop']), 0, 'stop owned synthetic cluster');
    await removeScratch(parent);
  }
});

test('verification CLI rejects readiness arguments without opening an archive', () => {
  const result = spawnSync(process.execPath, [verifyCli, '--ready'], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ARCHIVE_VERIFY_FAILED/);
});
