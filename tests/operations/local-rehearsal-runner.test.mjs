import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalPgEnv, buildRestoreCheckpointSql, buildCandidatePostcheckSql,
  buildSyntheticFlowSql, buildPgCtlInvocation, parsePrivateJson, runRedactedChild,
} from '../../scripts/operations/local-rehearsal-runner.mjs';

test('local child environment refuses inherited production and integration credentials', () => {
  const env = buildLocalPgEnv('migration_candidate', 'local-only-password-0000000000000000', {
    SystemRoot: 'C:\\Windows', PATH: 'unsafe', DIRECT_URL: 'postgresql://production',
    DATABASE_URL: 'postgresql://production', RESEND_API_KEY: 'send', BLOB_READ_WRITE_TOKEN: 'blob',
    PGHOST: 'production.example', PGPASSWORD: 'source-secret', OPENSSL_CONF: 'unsafe',
  });
  assert.equal(env.PGHOST, '127.0.0.1');
  assert.equal(env.PGPORT, '55438');
  assert.equal(env.PGDATABASE, 'migration_candidate');
  assert.equal(env.PGSSLMODE, 'disable');
  assert.equal(env.PGPASSWORD, 'local-only-password-0000000000000000');
  assert.match(env.DATABASE_URL, /^postgresql:\/\/rehearsal_owner:local-only-password-0000000000000000@127\.0\.0\.1:55438\/migration_candidate/);
  assert.equal(env.DIRECT_URL, env.DATABASE_URL);
  assert.equal(env.RESEND_API_KEY, undefined);
  assert.equal(env.BLOB_READ_WRITE_TOKEN, undefined);
  assert.equal(env.OPENSSL_CONF, undefined);
  assert.equal(env.PATH, undefined);
  assert.throws(() => buildLocalPgEnv('neondb', 'local-only-password-0000000000000000'), /TARGET_REJECTED/);
});

test('private checkpoint query records schema, row checksums and integrity', () => {
  const sql = buildRestoreCheckpointSql();
  assert.match(sql, /MIRACLE_LOCAL_CHECKPOINT/);
  assert.match(sql, /_prisma_migrations/);
  assert.match(sql, /invalidConstraints/);
  assert.match(sql, /criticalUniqueIndexes/);
  assert.match(sql, /md5\(t::text\)/);
  assert.doesNotMatch(sql, /pg_export_snapshot/);
});

test('private JSON parser rejects diagnostic output and oversized records', () => {
  assert.deepEqual(parsePrivateJson('{"ok":true}\n'), { ok: true });
  assert.throws(() => parsePrivateJson('ERROR: secret\n'), /QUERY_FAILED/);
  assert.throws(() => parsePrivateJson('x'.repeat(270000)), /QUERY_FAILED/);
});

test('candidate contract and synthetic flow have private query interfaces', () => {
  const postcheck = buildCandidatePostcheckSql();
  const flow = buildSyntheticFlowSql('a'.repeat(32));
  assert.match(postcheck, /MIRACLE_LOCAL_CHECKPOINT/);
  assert.match(flow, /MIRACLE_LOCAL_CHECKPOINT/);
  assert.match(flow, /ROLLBACK;/);
  assert.throws(() => buildSyntheticFlowSql("'; DROP TABLE public.\"User\";--"), /CONFIG_REJECTED/);
});

test('child failures expose fixed diagnostics without stderr or stdout data', async () => {
  await assert.rejects(runRedactedChild(process.execPath, ['-e',
    "process.stderr.write('sensitive value'); process.stdout.write('private row'); process.exit(7)"],
  { timeoutMs: 5000 }), error => error.code === 'CHILD_FAILED' &&
    !error.message.includes('sensitive') && !error.message.includes('private'));
});

test('background launcher can avoid an inherited stdout pipe', async () => {
  const result = await runRedactedChild(process.execPath, ['-e', "process.stdout.write('launcher output')"],
    { captureOutput: false, timeoutMs: 5000 });
  assert.equal(result.stdout, '');
  assert.equal(result.exit, 0);
});

test('PostgreSQL start and stop use bounded no-pipe child settings', () => {
  const start = buildPgCtlInvocation('start', 'C:\\fixture\\cluster', 'C:\\fixture', {});
  const stop = buildPgCtlInvocation('stop', 'C:\\fixture\\cluster', 'C:\\fixture', {});
  assert.deepEqual(start.args, ['-D', 'C:\\fixture\\cluster', '-l', 'C:\\fixture\\server.log', '-w', '-t', '60', 'start']);
  assert.deepEqual(stop.args, ['-D', 'C:\\fixture\\cluster', '-m', 'fast', '-w', '-t', '60', 'stop']);
  assert.equal(start.options.captureOutput, false);
  assert.equal(stop.options.captureOutput, false);
  assert.equal(start.options.timeoutMs, 90000);
  assert.equal(stop.options.timeoutMs, 90000);
  assert.throws(() => buildPgCtlInvocation('restart', 'C:\\fixture\\cluster', 'C:\\fixture', {}), /CONFIG_REJECTED/);
});
