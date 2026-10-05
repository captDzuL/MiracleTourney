import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as rehearsalRunner from '../../scripts/operations/local-rehearsal-runner.mjs';
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

test('host accepts the runner-emitted UTC rehearsal name and rejects extra segments', async () => {
  // The live host script creates E:/MiracleBackups directories, so exercise only its parsed name predicate.
  const host = await readFile(new URL('../../scripts/operations/local-rehearsal-host.ps1', import.meta.url), 'utf8');
  const match = host.match(/\$RunName -cnotmatch '([^']+)'/);
  assert.ok(match, 'host RunName guard exists');
  const name = `rehearsal-${new Date('2026-10-05T02:55:50.980Z').toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
  const accepted = new RegExp(match[1]);
  assert.equal(accepted.test(name), true);
  assert.equal(accepted.test('rehearsal-2026-10-05T02-55-50-44-980Z'), false);
  assert.equal(accepted.test('../rehearsal-2026-10-05T02-55-50-980Z'), false);
});

test('negative SCRAM probe uses a valid wrong password and requires server auth denial', async () => {
  assert.equal(typeof rehearsalRunner.verifyAuth, 'function');
  const bootstrapPassword = 'A'.repeat(43);
  const calls = [];
  const probe = async (...args) => {
    calls.push(args);
    return calls.length === 1 ? { exit: 2, stderrMatched: true, stdout: '' } :
      { exit: 0, stderrMatched: false, stdout: 'MIRACLE_LOCAL_CHECKPOINT\t{"listen":"127.0.0.1","port":"55438","passwordEncryption":"scram-sha-256"}\n' };
  };
  await rehearsalRunner.verifyAuth('C:\\fixture\\bin', bootstrapPassword, probe);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], 'postgres');
  assert.notEqual(calls[0][2], bootstrapPassword);
  assert.match(calls[0][2], /^[A-Za-z0-9_-]{32,}$/);
  assert.doesNotThrow(() => buildLocalPgEnv('recovery_baseline', calls[0][2]));
  assert.equal(calls[0][4].expectAuthFailure, true);
  assert.equal(calls[1][2], bootstrapPassword);
  await assert.rejects(rehearsalRunner.verifyAuth('C:\\fixture\\bin', bootstrapPassword,
    async () => ({ exit: 2, stderrMatched: false, stdout: '' })), /AUTH_REJECTED/);
  await assert.rejects(rehearsalRunner.verifyAuth('C:\\fixture\\bin', bootstrapPassword,
    async () => { const error = new Error('CHILD_TIMEOUT'); error.code = 'CHILD_TIMEOUT'; throw error; }),
  error => error.code === 'CHILD_TIMEOUT');
});

test('bounded child accepts only expected nonzero exit and captures redacted auth diagnostics privately', async () => {
  const args = ['-e', "process.stderr.write('password authentication failed for user \\\"fixture\\\"'); process.exit(2)"];
  const denied = await runRedactedChild(process.execPath, args,
    { timeoutMs: 5000, acceptedExitCodes: [2], stderrPattern: /password authentication failed/ });
  assert.equal(denied.exit, 2);
  assert.equal(denied.stderrMatched, true);
  assert.equal(Object.hasOwn(denied, 'stderr'), false);
  await assert.rejects(runRedactedChild(process.execPath, args, { timeoutMs: 5000 }), /CHILD_FAILED/);
});

test('operator limitation describes the expanded synthetic SQL without implying app integration coverage', () => {
  assert.ok(Array.isArray(rehearsalRunner.REHEARSAL_LIMITATIONS));
  assert.ok(rehearsalRunner.REHEARSAL_LIMITATIONS.includes('SYNTHETIC_FLOW_LOCAL_SQL_ONLY_NO_APP_INTEGRATIONS'));
  assert.equal(rehearsalRunner.REHEARSAL_LIMITATIONS.includes('SYNTHETIC_FLOW_LIMITED_TO_LOCAL_RATE_LIMIT_CONSTRAINT'), false);
});
