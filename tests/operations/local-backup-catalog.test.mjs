import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as snapshot from '../../scripts/operations/local-backup-snapshot.mjs';

const bin = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-v3-release-pr-readiness/runtime/catalog-server/pgsql/bin/', import.meta.url));
const credential = randomBytes(24).toString('hex');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_)/i.test(key)));

function processStatus(exe, args, env = {}) {
  const result = spawnSync(join(bin, exe), args, {
    encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: 'ignore',
    env: { ...cleanEnv, ...env },
  });
  return result.status;
}

async function unusedLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const port = server.address().port;
  await new Promise(resolveClosed => server.close(resolveClosed));
  assert.notEqual(port, 55438);
  return port;
}

const oldCountSql = `SELECT count(*) = 4 FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
  WHERE n.nspname = 'public' AND i.indisunique AND i.indnkeyatts = 1 AND
    ((t.relname = 'User' AND a.attname = 'email') OR
     (t.relname = 'Event' AND a.attname = 'slug') OR
     (t.relname = 'Certificate' AND a.attname = 'eventId') OR
     (t.relname = 'PasswordResetToken' AND a.attname = 'token'))`;

test('real local catalog requires each valid ready live unconditional critical unique index', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-catalog-fixture-'));
  const data = join(root, 'data');
  const pwfile = join(root, 'synthetic-pwfile');
  const log = join(root, 'server.log');
  const port = await unusedLoopbackPort();
  let started = false;
  try {
    assert.equal(resolve(root).startsWith(resolve(tmpdir())), true);
    const escaped = root.replaceAll("'", "''");
    const acl = `$p='${escaped}';$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$f=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit;$r=New-Object Security.AccessControl.FileSystemAccessRule($s,[Security.AccessControl.FileSystemRights]::FullControl,$f,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$a)`;
    assert.equal(spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', acl], { windowsHide: true }).status, 0, 'private scratch ACL');
    await writeFile(pwfile, credential, { mode: 0o600 });
    await chmod(pwfile, 0o600);
    assert.equal(processStatus('initdb.exe', ['-D', data, '-U', 'synthetic_catalog', '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile', pwfile, '--no-instructions']), 0, 'initdb synthetic SCRAM cluster');
    await unlink(pwfile);
    const options = `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`;
    assert.equal(processStatus('pg_ctl.exe', ['-D', data, '-l', log, '-o', options, '-w', 'start']), 0, 'start owned loopback cluster');
    started = true;
    const sql = (query, expectedStatus = 0) => {
      const result = spawnSync(join(bin, 'psql.exe'), ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'synthetic_catalog', '-d', 'postgres', '-c', query], {
        encoding: 'utf8', windowsHide: true, timeout: 30000,
        env: { ...cleanEnv, PGPASSWORD: credential, PGSSLMODE: 'disable' },
      });
      assert.equal(result.status, expectedStatus, 'synthetic local SQL status');
      return result.stdout.trim();
    };
    sql(`CREATE TABLE public."User" (email text); CREATE TABLE public."Event" (slug text);
      CREATE TABLE public."Certificate" ("eventId" text); CREATE TABLE public."PasswordResetToken" (token text);
      CREATE UNIQUE INDEX user_email_1 ON public."User" (email);
      CREATE UNIQUE INDEX event_slug_1 ON public."Event" (slug);
      CREATE UNIQUE INDEX certificate_event_1 ON public."Certificate" ("eventId");
      CREATE UNIQUE INDEX token_1 ON public."PasswordResetToken" (token);`);
    sql('DROP INDEX public.event_slug_1; CREATE UNIQUE INDEX user_email_2 ON public."User" (email);');
    const oldCountAcceptedMissingPair = sql(oldCountSql);
    assert.equal(oldCountAcceptedMissingPair, 't', 'old count accepts duplicate index in place of missing pair');
    process.stdout.write(`synthetic old count accepts missing pair: ${oldCountAcceptedMissingPair}\n`);
    const current = () => sql(`SELECT (${snapshot.buildCriticalUniqueIndexSql()})::text`);
    assert.ok(snapshot.buildCheckpointSql().includes(snapshot.buildCriticalUniqueIndexSql()), 'catalog-tested predicate is embedded in checkpoint SQL');
    assert.equal(current(), 'false', 'missing required pair is rejected despite four total indexes');
    sql('DROP INDEX public.user_email_2; CREATE UNIQUE INDEX event_slug_restored ON public."Event" (slug);');
    assert.equal(current(), 'true', 'each required pair passes when valid and unconditional');
    sql('DROP INDEX public.certificate_event_1; CREATE UNIQUE INDEX certificate_partial ON public."Certificate" ("eventId") WHERE "eventId" IS NOT NULL;');
    assert.equal(sql(oldCountSql), 't', 'old count accepts partial index');
    assert.equal(current(), 'false', 'partial index is rejected');
    sql('DROP INDEX public.certificate_partial; CREATE UNIQUE INDEX certificate_event_2 ON public."Certificate" ("eventId"); DROP INDEX public.token_1; INSERT INTO public."PasswordResetToken" (token) VALUES (\'duplicate\'), (\'duplicate\');');
    assert.equal(processStatus('psql.exe', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'synthetic_catalog', '-d', 'postgres', '-c', 'CREATE UNIQUE INDEX CONCURRENTLY token_invalid ON public."PasswordResetToken" (token)'], { PGPASSWORD: credential, PGSSLMODE: 'disable' }), 1, 'expected invalid index creation failure');
    assert.equal(sql("SELECT NOT indisvalid FROM pg_index JOIN pg_class ON pg_class.oid=indexrelid WHERE pg_class.relname='token_invalid'"), 't');
    assert.equal(sql(oldCountSql), 't', 'old count accepts invalid index');
    assert.equal(current(), 'false', 'invalid index is rejected');
  } finally {
    if (started) assert.equal(processStatus('pg_ctl.exe', ['-D', data, '-m', 'immediate', '-w', 'stop']), 0, 'stop owned synthetic server');
    await rm(root, { recursive: true, force: true });
  }
});
