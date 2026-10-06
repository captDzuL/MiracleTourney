import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadExpectedLedger } from '../../scripts/operations/local-backup-snapshot.mjs';
import { buildPinnedPgEnv, buildPinnedTestingPgEnv } from '../../scripts/operations/local-backup-ca.mjs';
import {
  assertCanonicalLedgerLf, assertCatalogState, assertRepairSql, assertTestingBackupReceipt,
  buildTargetCatalog, normalizeTestingSourcePair, validateTestingSourceUrl,
} from '../../scripts/operations/testing-schema-core.mjs';

const direct = 'postgresql://operator:synthetic-password@ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&sslrootcert=system';
const directBound = `${direct}&channel_binding=require`;
const item = (table, name, definition = name) => ({ table, name, definition });
const baseline = {
  tables: [{ name: 'Certificate', kind: 'r' }, { name: 'CheckIn', kind: 'r' }, { name: '_prisma_migrations', kind: 'r' }],
  columns: [item('Certificate', 'id'), item('CheckIn', 'id'), item('_prisma_migrations', 'id')],
  indexes: [item('Certificate', 'Certificate_eventId_key', 'old unique'), item('CheckIn', 'CheckIn_pkey')],
  constraints: [item('Certificate', 'Certificate_pkey'), item('CheckIn', 'CheckIn_pkey')],
  enums: [], triggers: [], functions: [],
};
const canonical = {
  tables: [{ name: 'Certificate', kind: 'r' }, { name: 'CompetitionPhase', kind: 'r' }],
  columns: [item('Certificate', 'id'), item('Certificate', 'type'), item('CompetitionPhase', 'id')],
  indexes: [item('Certificate', 'Certificate_eventId_type_key', 'new unique'), item('CompetitionPhase', 'CompetitionPhase_pkey')],
  constraints: [item('Certificate', 'Certificate_pkey'), item('CompetitionPhase', 'CompetitionPhase_pkey')],
  enums: [{ name: 'CompetitionPhaseStatus', labels: ['draft', 'active'] }],
  triggers: [item('CompetitionPhase', 'phase_trigger')],
  functions: [{ name: 'enforce_match_result_revision', definition: 'body\r\nline' }],
};

test('testing source admits only the exact direct Delicate database with full certificate verification', () => {
  const fields = validateTestingSourceUrl(direct);
  assert.equal(fields.PGHOST, 'ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech');
  assert.equal(fields.PGDATABASE, 'neondb');
  for (const changed of [
    direct.replace('delicate-forest', 'sparkling-night'),
    direct.replace('.c-3.', '-pooler.c-3.'),
    direct.replace('sslmode=verify-full', 'sslmode=require'),
    direct.replace('/neondb?', '/postgres?'),
    `${direct}&options=-csearch_path%3Dpublic`,
  ]) assert.throws(() => validateTestingSourceUrl(changed), /SOURCE_REJECTED/);
});

test('approved dotenv pair is exact, matching and upgraded to verify-full for libpq', () => {
  const pooled = direct.replace('.c-3.', '-pooler.c-3.').replace('sslmode=verify-full&sslrootcert=system', 'sslmode=require');
  const pair = normalizeTestingSourcePair(direct.replace('sslmode=verify-full&sslrootcert=system', 'sslmode=require'), pooled);
  assert.equal(pair.direct, direct);
  assert.equal(pair.pooled, direct.replace('.c-3.', '-pooler.c-3.'));
  assert.throws(() => normalizeTestingSourcePair(direct, pooled.replace('synthetic-password', 'different')), /SOURCE_REJECTED/);
  assert.throws(() => normalizeTestingSourcePair(direct, pooled.replace('-pooler', '')), /SOURCE_REJECTED/);
});

test('testing source retains required channel binding through direct and pooled normalization and pinned psql environment', () => {
  const rawDirect = direct.replace('sslmode=verify-full&sslrootcert=system', 'sslmode=require&channel_binding=require');
  const rawPooled = rawDirect.replace('.c-3.', '-pooler.c-3.');
  const pair = normalizeTestingSourcePair(rawDirect, rawPooled);
  for (const [value, host] of [[pair.direct, 'ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech'],
    [pair.pooled, 'ep-delicate-forest-azuodo4q-pooler.c-3.ap-southeast-1.aws.neon.tech']]) {
    const url = new URL(value);
    assert.equal(url.hostname, host);
    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    assert.equal(url.searchParams.get('sslrootcert'), 'system');
    assert.equal(url.searchParams.get('channel_binding'), 'require');
    assert.equal([...url.searchParams.keys()].length, 3);
  }
  const fields = validateTestingSourceUrl(pair.direct);
  assert.equal(fields.PGCHANNELBINDING, 'require');
  assert.equal(buildPinnedTestingPgEnv(fields).PGCHANNELBINDING, 'require');
  assert.equal(buildPinnedTestingPgEnv(fields).PGSSLMODE, 'verify-full');
  assert.equal(buildPinnedTestingPgEnv(fields).PGSSLROOTCERT.endsWith('.pem'), true);
  assert.throws(() => buildPinnedPgEnv(fields), /TOOL_REJECTED/);
});

test('testing source rejects weak, duplicate, unknown and mismatched channel binding', () => {
  const rawDirect = direct.replace('sslmode=verify-full&sslrootcert=system', 'sslmode=require&channel_binding=require');
  const rawPooled = rawDirect.replace('.c-3.', '-pooler.c-3.');
  for (const value of ['', 'prefer', 'disable', 'REQUIRE', 'other']) {
    assert.throws(() => normalizeTestingSourcePair(rawDirect.replace('channel_binding=require', `channel_binding=${value}`), rawPooled), /SOURCE_REJECTED/);
    assert.throws(() => validateTestingSourceUrl(directBound.replace('channel_binding=require', `channel_binding=${value}`)), /SOURCE_REJECTED/);
  }
  for (const suffix of ['&channel_binding=require', '&options=-csearch_path%3Dpublic', '&channel_binding=prefer']) {
    assert.throws(() => normalizeTestingSourcePair(rawDirect + suffix, rawPooled), /SOURCE_REJECTED/);
    assert.throws(() => validateTestingSourceUrl(directBound + suffix), /SOURCE_REJECTED/);
  }
  assert.throws(() => normalizeTestingSourcePair(rawDirect, rawPooled.replace('&channel_binding=require', '')), /SOURCE_REJECTED/);
  assert.throws(() => normalizeTestingSourcePair(rawDirect.replace('&channel_binding=require', ''), rawPooled), /SOURCE_REJECTED/);
  const fields = validateTestingSourceUrl(direct);
  fields.PGCHANNELBINDING = 'prefer';
  assert.throws(() => buildPinnedTestingPgEnv(fields), /TOOL_REJECTED/);
});

test('target catalog preserves legacy objects and replaces only obsolete certificate uniqueness', () => {
  const target = buildTargetCatalog(baseline, canonical);
  assert.equal(target.tables.length, 4);
  assert.equal(target.columns.length, 5);
  assert.deepEqual(target.indexes.map(x => x.name).sort(), ['Certificate_eventId_type_key', 'CheckIn_pkey', 'CompetitionPhase_pkey']);
  assert.equal(target.functions[0].definition, 'body\nline');
  assert.equal(assertCatalogState(baseline, baseline, canonical, 'before'), 'baseline');
  assert.equal(assertCatalogState(target, baseline, canonical, 'after'), 'repaired');
  assert.equal(assertCatalogState(target, baseline, canonical, 'before'), 'repaired');
  const corrupted = structuredClone(baseline);
  corrupted.columns[0].definition = 'changed old value';
  assert.throws(() => assertCatalogState(corrupted, baseline, canonical, 'before'), /CATALOG_DRIFT/);
});

test('repair SQL rejects extra destructive operations and a changed plan digest', () => {
  const sql = 'CREATE TABLE "CompetitionPhase" (id text);\nDROP INDEX IF EXISTS "Certificate_eventId_key";';
  const digest = createHash('sha256').update(sql).digest('hex');
  assert.equal(assertRepairSql(sql, digest), digest);
  assert.throws(() => assertRepairSql(`${sql}\nDROP TABLE "Event";`, digest), /PLAN_REJECTED/);
  assert.throws(() => assertRepairSql(sql.replace('CompetitionPhase', 'Other'), digest), /PLAN_REJECTED/);
});

test('repair requires an independently verified testing archive from the same prestate', () => {
  const checkpoint = { appliedMigrations: 37, ledgerSha256: 'b'.repeat(64), schemaSha256: 'c'.repeat(64),
    tableCounts: { Event: 1 }, tableChecksumsMd5: { Event: 'd'.repeat(32) },
    integrity: { invalidConstraints: 0, criticalUniqueIndexes: true } };
  const receipt = {
    format: 'pg_dump-custom+age-v1', source: 'approved-delicate-testing-direct-neondb',
    testing: { project: 'steep-tree-47893196', branch: 'br-young-thunder-az5w6nt3', database: 'neondb' },
    archive: 'archive.age', bytes: 1024, sha256: 'a'.repeat(64),
    checkpoint,
  };
  const verified = { bytes: 1024, sha256: 'a'.repeat(64) };
  assert.equal(assertTestingBackupReceipt(receipt, verified, checkpoint), true);
  assert.throws(() => assertTestingBackupReceipt({ ...receipt, source: 'approved-direct-neondb' }, verified, checkpoint), /BACKUP_REJECTED/);
  assert.throws(() => assertTestingBackupReceipt(receipt, verified, { ...checkpoint, schemaSha256: 'e'.repeat(64) }), /BACKUP_REJECTED/);
  assert.throws(() => assertTestingBackupReceipt(receipt, verified, { ...checkpoint, tableCounts: { Event: 2 } }), /BACKUP_REJECTED/);
});

test('canonical ledger loader accepts the real twelve-digit competition migration name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-task12-ledger-'));
  try {
    const name = '202609120001_competition_operation_versions';
    await mkdir(join(root, name));
    await writeFile(join(root, name, 'migration.sql'), 'SELECT 1;\n');
    const rows = await loadExpectedLedger(root, [name]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, name);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('testing ledger rejects CRLF checksum variants and unfinished rows', () => {
  const expected = [{ name: 'migration_one', sha256: 'a'.repeat(64), sha256Crlf: 'b'.repeat(64) }];
  const row = { migration_name: 'migration_one', checksum: 'a'.repeat(64), finished_at: '2026-10-06T00:00:00Z', rolled_back_at: null };
  assert.equal(assertCanonicalLedgerLf([row], expected), true);
  assert.throws(() => assertCanonicalLedgerLf([{ ...row, checksum: 'b'.repeat(64) }], expected), /CHECKPOINT_DRIFT/);
  assert.throws(() => assertCanonicalLedgerLf([{ ...row, finished_at: null }], expected), /CHECKPOINT_DRIFT/);
});

test('testing export preparation rejects every env path except the approved dotenv file', async () => {
  const { prepareFixedTestingExport } = await import('../../scripts/operations/local-backup-operator.mjs');
  const previous = process.env.E2E_ENV_FILE;
  try {
    process.env.E2E_ENV_FILE = 'E:/dev/MiracleTourney-gitnative/.env.test';
    await assert.rejects(prepareFixedTestingExport(), { code: 'SOURCE_REJECTED' });
  } finally {
    if (previous === undefined) delete process.env.E2E_ENV_FILE;
    else process.env.E2E_ENV_FILE = previous;
  }
});

test('testing backup CLI refuses arguments before reading credentials or starting an export', () => {
  const child = spawnSync(process.execPath, ['scripts/operations/testing-schema-backup.mjs', '--force'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, E2E_ENV_FILE: 'E:/dev/MiracleTourney-gitnative/.env.test' },
  });
  assert.equal(child.status, 1);
  assert.equal(child.stderr.trim(), 'CONFIG_REJECTED');
});

test('testing repair CLI refuses bypass flags before reading a backup or opening a database', () => {
  const child = spawnSync(process.execPath, ['scripts/operations/testing-schema-apply.mjs', '--skip-backup'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, E2E_ENV_FILE: 'E:/dev/MiracleTourney-gitnative/.env.test' },
  });
  assert.equal(child.status, 1);
  assert.equal(child.stderr.trim(), 'CONFIG_REJECTED');
});
