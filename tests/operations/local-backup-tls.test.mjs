import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const catalogBin = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-v3-release-pr-readiness/runtime/catalog-server/pgsql/bin/', import.meta.url));
const snapshotBin = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/snapshot-client/pgsql/bin/', import.meta.url));
const dumpBin = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/pg18/bin/', import.meta.url));
const openssl = 'C:/Program Files/Git/usr/bin/openssl.exe';
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_|SSL_CERT_|OPENSSL_)/i.test(key)));

function status(path, args, env = {}) {
  return spawnSync(path, args, {
    windowsHide: true, timeout: 30000, stdio: 'ignore', env: { ...cleanEnv, ...env },
  }).status;
}

async function privateDirectory(path) {
  const escaped = path.replaceAll("'", "''");
  const acl = `$p='${escaped}';$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$f=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit;$r=New-Object Security.AccessControl.FileSystemAccessRule($s,[Security.AccessControl.FileSystemRights]::FullControl,$f,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$a)`;
  assert.equal(status('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', acl]), 0);
}

async function unusedPort() {
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

test('pinned libpq clients enforce trusted CA and hostname against owned synthetic TLS server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-tls-fixture-'));
  const data = join(root, 'data');
  const pwfile = join(root, 'synthetic-pwfile');
  const cert = join(root, 'server.crt');
  const key = join(root, 'server.key');
  const wrongCert = join(root, 'wrong.crt');
  const wrongKey = join(root, 'wrong.key');
  const log = join(root, 'server.log');
  const password = randomBytes(24).toString('hex');
  const port = await unusedPort();
  let started = false;
  try {
    assert.equal(resolve(root).startsWith(resolve(tmpdir())), true);
    await privateDirectory(root);
    await writeFile(pwfile, password, { mode: 0o600 });
    await chmod(pwfile, 0o600);
    assert.equal(status(join(catalogBin, 'initdb.exe'), ['-D', data, '-U', 'synthetic_tls', '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile', pwfile, '--no-instructions']), 0);
    await unlink(pwfile);
    const certArgs = (outCert, outKey, name) => ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name}`, '-keyout', outKey, '-out', outCert];
    assert.equal(status(openssl, certArgs(cert, key, 'localhost')), 0);
    assert.equal(status(openssl, certArgs(wrongCert, wrongKey, 'wrong.localhost')), 0);
    await copyFile(cert, join(data, 'server.crt'));
    await copyFile(key, join(data, 'server.key'));
    assert.equal(status(join(catalogBin, 'pg_ctl.exe'), ['-D', data, '-l', log, '-o', `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1 -c ssl=on`, '-w', 'start']), 0);
    started = true;
    const base = { PGHOST: 'localhost', PGHOSTADDR: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'synthetic_tls', PGPASSWORD: password, PGSSLMODE: 'verify-full' };
    const psql = env => status(join(snapshotBin, 'psql.exe'), ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'], env);
    const dump = env => status(join(dumpBin, 'pg_dump.exe'), ['--schema-only', '--format=custom'], env);
    assert.equal(psql({ ...base, PGSSLROOTCERT: 'system' }), 2, 'untrusted local server is rejected by system roots');
    assert.equal(psql({ ...base, PGSSLROOTCERT: cert }), 0, 'pinned psql accepts matching CA and hostname');
    assert.equal(dump({ ...base, PGSSLROOTCERT: cert }), 0, 'pinned pg_dump accepts matching CA and hostname');
    assert.notEqual(psql({ ...base, PGSSLROOTCERT: wrongCert }), 0, 'wrong CA is rejected');
    assert.notEqual(dump({ ...base, PGSSLROOTCERT: wrongCert }), 0, 'wrong CA is rejected by dump');
    assert.notEqual(psql({ ...base, PGHOST: 'mismatch.localhost', PGSSLROOTCERT: cert }), 0, 'hostname mismatch is rejected');
    assert.notEqual(dump({ ...base, PGHOST: 'mismatch.localhost', PGSSLROOTCERT: cert }), 0, 'hostname mismatch is rejected by dump');
  } finally {
    if (started) assert.equal(status(join(catalogBin, 'pg_ctl.exe'), ['-D', data, '-m', 'immediate', '-w', 'stop']), 0, 'stop only owned synthetic server');
    await rm(root, { recursive: true, force: true });
  }
});
