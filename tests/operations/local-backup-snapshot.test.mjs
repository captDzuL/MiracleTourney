import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSnapshotSession, validateCheckpoint, loadExpectedLedger } from '../../scripts/operations/local-backup-snapshot.mjs';

const snapshot = '00000003-0000001B-1';
const checkpoint = { snapshot, ledger: [], schema: [], counts: {}, integrity: { invalidConstraints: 0 } };

async function fakeSession(mode = 'good') {
  const root = await mkdtemp(join(tmpdir(), 'miracle-snapshot-'));
  const script = join(root, 'fake-psql.mjs');
  await writeFile(script, `process.stdin.setEncoding('utf8'); let seen=''; process.stdin.on('data', chunk => { seen += chunk; if (seen.includes('pg_export_snapshot') && !globalThis.sent) { globalThis.sent=true; ${mode === 'silent' || mode === 'tls-fail' ? '' : `process.stdout.write('MIRACLE_CHECKPOINT\\t' + JSON.stringify(${JSON.stringify(mode === 'bad' ? { ...checkpoint, snapshot: 'bad' } : checkpoint)}) + '\\n');`} ${mode === 'early-exit' ? 'setTimeout(() => process.exit(0), 20);' : ''} ${mode === 'tls-fail' ? "process.stderr.write('synthetic-private-path SSL error: certificate verify failed'); process.exit(2);" : ''} } if (seen.includes('${mode === 'rollback' ? 'ROLLBACK;' : 'COMMIT;'}')) process.exit(${mode === 'exit-fail' ? 8 : 0}); }); process.stdin.on('end', () => { if (${JSON.stringify(mode)} === 'rollback' && !seen.includes('ROLLBACK;')) process.exit(7); });`);
  return { root, script };
}

test('holds one read-only snapshot session through callback and commits after callback', async () => {
  const f = await fakeSession();
  let called = false;
  try {
    const value = await runSnapshotSession({ path: process.execPath, args: [f.script], env: {}, sql: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();', timeoutMs: 2000 }, async cp => {
      called = true;
      assert.equal(cp.snapshot, snapshot);
      return 'archive-published';
    });
    assert.equal(called, true);
    assert.equal(value, 'archive-published');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('checkpoint-only session rolls back after validation without requiring a dump', async () => {
  const f = await fakeSession('rollback');
  try {
    const result = await runSnapshotSession({
      path: process.execPath, args: [f.script], env: {},
      sql: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();',
      closeSql: 'ROLLBACK;', timeoutMs: 500,
    }, async raw => raw.snapshot);
    assert.equal(result, snapshot);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('checkpoint-only operation returns safe readiness fields and never exposes snapshot or rows', async () => {
  const f = await fakeSession('rollback');
  try {
    const { runCheckpointOnly } = await import('../../scripts/operations/local-backup-snapshot.mjs');
    const result = await runCheckpointOnly({
      path: process.execPath, args: [f.script], env: {},
      sql: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();', timeoutMs: 500,
    }, [], []);
    assert.deepEqual(result, { status: 'BACKUP_PREFLIGHT_READY', appliedMigrations: 0 });
    assert.equal(JSON.stringify(result).includes(snapshot), false);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('checkpoint failure exposes only an allowlisted TLS diagnostic', async () => {
  const f = await fakeSession('tls-fail');
  try {
    await assert.rejects(runSnapshotSession({ path: process.execPath, args: [f.script], env: {}, sql: 'SELECT pg_export_snapshot();', timeoutMs: 500 }, async () => {}), error => {
      assert.equal(error.code, 'CHECKPOINT_FAILED');
      assert.equal(error.diagnostic, 'TLS_CHAIN');
      assert.equal(JSON.stringify(error).includes('synthetic-private-path'), false);
      return true;
    });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

for (const mode of ['bad', 'silent', 'exit-fail']) {
  test(`${mode} snapshot process fails closed with no success callback`, async () => {
    const f = await fakeSession(mode);
    let called = false;
    try {
      await assert.rejects(runSnapshotSession({ path: process.execPath, args: [f.script], env: {}, sql: 'SELECT pg_export_snapshot();', timeoutMs: 300 }, async () => { called = true; }), { code: 'CHECKPOINT_FAILED' });
      assert.equal(called, mode === 'exit-fail');
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

test('a lost snapshot holder aborts work before publication', async () => {
  const f = await fakeSession('early-exit');
  let workSignal;
  try {
    await assert.rejects(runSnapshotSession({ path: process.execPath, args: [f.script], env: {}, sql: 'SELECT pg_export_snapshot();', timeoutMs: 1000 }, async (_checkpoint, signal) => {
      workSignal = signal;
      await new Promise(resolve => setTimeout(resolve, 100));
    }), { code: 'CHECKPOINT_FAILED' });
    assert.equal(workSignal?.aborted, true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('checkpoint rejects an unresolved migration and unvalidated constraint', () => {
  assert.throws(() => validateCheckpoint({ ...checkpoint, ledger: [{ migration_name: 'unexpected', checksum: 'abc', finished_at: null, rolled_back_at: null }] }, []), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...checkpoint, integrity: { invalidConstraints: 1 } }, []), { code: 'CHECKPOINT_DRIFT' });
});

test('checkpoint rejects changed ledger checksum and critical physical schema drift', () => {
  const expected = [{ name: 'first', sha256: 'a'.repeat(64) }, { name: 'second', sha256: 'b'.repeat(64) }];
  const columns = {
    User: [['id', 'text', 'NO'], ['email', 'text', 'NO'], ['passwordHash', 'text', 'NO'], ['deactivatedAt', 'timestamp without time zone', 'YES']],
    Event: [['id', 'text', 'NO'], ['slug', 'text', 'NO'], ['organizerUserId', 'text', 'YES']],
    Certificate: [['id', 'text', 'NO'], ['eventId', 'text', 'NO'], ['teamId', 'text', 'NO'], ['status', 'text', 'NO'], ['attemptCount', 'integer', 'NO']],
    PasswordResetToken: [['id', 'text', 'NO'], ['userId', 'text', 'NO'], ['token', 'text', 'NO'], ['expiresAt', 'timestamp without time zone', 'NO']],
  };
  const schema = Object.entries(columns).flatMap(([table_name, items]) => items.map(([column_name, data_type, is_nullable]) => ({ table_name, column_name, data_type, is_nullable })));
  const good = { ...checkpoint, ledger: expected.map(item => ({ migration_name: item.name, checksum: item.sha256, finished_at: '2026-01-01', rolled_back_at: null })), schema: [...schema, { table_name: '_prisma_migrations', column_name: 'id', data_type: 'text', is_nullable: 'NO' }], counts: Object.fromEntries(Object.keys(columns).map(name => [name, 0])), checksums: Object.fromEntries(Object.keys(columns).map(name => [name, 'd41d8cd98f00b204e9800998ecf8427e'])), integrity: { invalidConstraints: 0, criticalUniqueIndexes: true }, source: { database: 'neondb', serverVersion: 180006, ssl: true } };
  assert.equal(validateCheckpoint(good, expected, Object.keys(columns)).appliedMigrations, 2);
  // pg_stat_ssl describes the backend hop; the operator's pinned libpq
  // verify-full connection is the client transport proof.
  assert.equal(validateCheckpoint({ ...good, source: { ...good.source, ssl: false } }, expected, Object.keys(columns)).appliedMigrations, 2);
  assert.throws(() => validateCheckpoint({ ...good, source: { ...good.source, ssl: null } }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, source: { ...good.source, database: 'wrong' } }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  const historicRollback = { migration_name: 'first', checksum: 'older-failed-attempt', finished_at: null, rolled_back_at: '2026-01-01' };
  assert.equal(validateCheckpoint({ ...good, ledger: [historicRollback, ...good.ledger] }, expected, Object.keys(columns)).appliedMigrations, 2);
  assert.throws(() => validateCheckpoint({ ...good, ledger: [{ ...good.ledger[0], checksum: 'c'.repeat(64) }, good.ledger[1]] }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, ledger: [{ ...good.ledger[0], checksum: undefined }, good.ledger[1]] }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, schema: schema.filter(row => row.column_name !== 'eventId') }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, counts: { ...good.counts, NewV3Table: 0 } }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, integrity: { invalidConstraints: 0, criticalUniqueIndexes: false } }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, checksums: { ...good.checksums, User: 'not-a-checksum' } }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
  assert.throws(() => validateCheckpoint({ ...good, schema: [...good.schema, { table_name: 'Unexpected', column_name: 'id', data_type: 'text', is_nullable: 'NO' }] }, expected, Object.keys(columns)), { code: 'CHECKPOINT_DRIFT' });
});

test('expected ledger admits only hashes of its LF and CRLF SQL bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-ledger-'));
  try {
    await mkdir(join(root, '20260101000000_first'));
    await writeFile(join(root, '20260101000000_first', 'migration.sql'), 'SELECT 1;\r\n');
    const ledger = await loadExpectedLedger(root, ['20260101000000_first']);
    assert.deepEqual(ledger, [{
      name: '20260101000000_first',
      sha256: 'b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd',
      sha256Crlf: 'd3cd5042f97738960d802ad6b3a548dfa18152215118ba18f04493bc6944b0e4',
    }]);
    const success = checksum => ({
      ...checkpoint,
      ledger: [{ migration_name: ledger[0].name, checksum, finished_at: '2026-01-01', rolled_back_at: null }],
    });
    assert.equal(validateCheckpoint(success(ledger[0].sha256Crlf), ledger).appliedMigrations, 1);
    assert.throws(() => validateCheckpoint(success('c'.repeat(64)), ledger), { code: 'CHECKPOINT_DRIFT' });
    await assert.rejects(loadExpectedLedger(root, ['20260101000000_missing']), { code: 'CHECKPOINT_DRIFT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
