import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  assertLocalTarget, assertFreshRehearsalPath, compareRestoredCheckpoint,
  compareLogicalRecoveryCheckpoint, inspectMigrationLedger, assessCandidate,
} from '../../scripts/operations/local-rehearsal-core.mjs';
import * as recoveryCore from '../../scripts/operations/local-rehearsal-core.mjs';
import { LEGACY_TABLES } from '../../scripts/operations/local-backup-snapshot.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const name = '20260812150000_baseline';
const sql = 'SELECT 1;\n';
const lf = createHash('sha256').update(sql).digest('hex');
const crlf = createHash('sha256').update(sql.replaceAll('\n', '\r\n')).digest('hex');
const migration = { name, sha256: lf, sha256Crlf: crlf };

test('target guard rejects non-loopback, wrong port, and unapproved database', () => {
  for (const target of [
    { host: '0.0.0.0', port: 55438, database: 'recovery_baseline' },
    { host: 'localhost', port: 55438, database: 'recovery_baseline' },
    { host: '127.0.0.1', port: 5432, database: 'recovery_baseline' },
    { host: '127.0.0.1', port: 55438, database: 'neondb' },
  ]) assert.throws(() => assertLocalTarget(target), /TARGET_REJECTED/);
  assert.deepEqual(assertLocalTarget({ host: '127.0.0.1', port: 55438, database: 'migration_candidate' }),
    { host: '127.0.0.1', port: 55438, database: 'migration_candidate' });
});

test('rehearsal path guard rejects existing target, siblings, and junctions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rehearsal-guard-'));
  const child = join(root, 'rehearsal-2026-10-05T01-23-48-741Z');
  await assertFreshRehearsalPath(child, root);
  await assert.rejects(assertFreshRehearsalPath(join(root, '..', 'elsewhere'), root), /PATH_REJECTED/);
  await mkdir(child);
  await assert.rejects(assertFreshRehearsalPath(child, root), /PATH_REJECTED/);
  const linked = join(root, 'rehearsal-2026-10-05T01-23-48-742Z');
  await symlink(child, linked, 'junction');
  await assert.rejects(assertFreshRehearsalPath(linked, root), /PATH_REJECTED/);
});

test('checkpoint comparison accepts trusted CRLF checksum but detects row drift', () => {
  const ledger = [{ migration_name: name, checksum: crlf, finished_at: '2026-01-01T00:00:00.000Z', rolled_back_at: null, started_at: '2026-01-01T00:00:00.000Z', id: 'a' }];
  const schema = [{ table_name: 'User', column_name: 'id', data_type: 'text', is_nullable: 'NO', ordinal_position: 1 }];
  const raw = { ledger, schema, counts: { User: 2 }, checksums: { User: 'a'.repeat(32) }, integrity: { invalidConstraints: 0, criticalUniqueIndexes: true } };
  const expected = { appliedMigrations: 1, ledgerSha256: sha(ledger), schemaSha256: sha(schema), tableCounts: raw.counts,
    tableChecksumsMd5: raw.checksums, integrity: raw.integrity };
  assert.equal(compareRestoredCheckpoint(raw, expected, [migration]).appliedMigrations, 1);
  assert.throws(() => compareRestoredCheckpoint({ ...raw, counts: { User: 3 } }, expected, [migration]), /CHECKPOINT_DRIFT/);
  assert.throws(() => compareRestoredCheckpoint({ ...raw, ledger: [{ ...ledger[0], checksum: 'f'.repeat(64) }] }, expected, [migration]), /CHECKPOINT_DRIFT/);
});

test('checkpoint drift exposes only fixed predicate booleans and table-level match flags', () => {
  const ledger = [{ migration_name: name, checksum: lf, finished_at: '2026-01-01', rolled_back_at: null,
    started_at: '2026-01-01', id: 'synthetic-id' }];
  const schema = [
    { table_name: 'Event', column_name: 'id', data_type: 'text', is_nullable: 'NO', ordinal_position: 1 },
    { table_name: 'User', column_name: 'synthetic_private_marker', data_type: 'text', is_nullable: 'NO', ordinal_position: 1 },
  ];
  const raw = { ledger, schema, counts: { Event: 1, User: 2 },
    checksums: { Event: 'a'.repeat(32), User: 'b'.repeat(32) },
    integrity: { invalidConstraints: 0, criticalUniqueIndexes: true } };
  const expected = { appliedMigrations: 1, ledgerSha256: sha(ledger), schemaSha256: sha(schema),
    tableCounts: raw.counts, tableChecksumsMd5: raw.checksums, integrity: raw.integrity };
  assert.equal(compareRestoredCheckpoint(raw, expected, [migration]).tableCount, 2);
  assert.throws(() => compareRestoredCheckpoint({ ...raw, schema: [...schema].reverse() }, expected, [migration]), error => {
    assert.equal(error.code, 'CHECKPOINT_DRIFT');
    assert.ok(error.predicates, 'fixed predicate vector is attached');
    assert.equal(error.predicates.schemaSha256, false);
    assert.equal(error.predicates.schemaBinaryOrderSha256, true);
    assert.equal(error.predicates.ledgerKnown, true);
    assert.equal(error.predicates.appliedCount, true);
    assert.equal(error.predicates.tableCounts, true);
    assert.equal(error.predicates.tableChecksumsMd5, true);
    assert.equal(JSON.stringify(error).includes('synthetic_private_marker'), false);
    return true;
  });
  assert.throws(() => compareRestoredCheckpoint({ ...raw,
    checksums: { Event: raw.checksums.Event, User: 'c'.repeat(32) } }, expected, [migration]), error => {
    assert.equal(error.predicates.tableChecksumsMd5, false);
    assert.deepEqual(error.predicates.checksumsByTable, { Event: true, User: false });
    assert.deepEqual(error.predicates.countsByTable, { Event: true, User: true });
    return true;
  });
  assert.throws(() => compareRestoredCheckpoint({ ...raw,
    ledger: [{ ...ledger[0], migration_name: 'unknown_synthetic_migration' }] }, expected, [migration]), error => {
    assert.equal(error.predicates.ledgerKnown, false);
    assert.equal(error.predicates.ledgerValidPrefix, false);
    return true;
  });
});

test('migration ledger counts applied/pending and refuses unfinished or foreign entries', () => {
  const names = [migration, { name: '20260905010000_v3_event_lifecycle', sha256: 'b'.repeat(64), sha256Crlf: 'b'.repeat(64) }];
  const rows = [{ migration_name: name, checksum: lf, finished_at: '2026-01-01', rolled_back_at: null }];
  assert.deepEqual(inspectMigrationLedger(rows, names), { applied: 1, pending: 1, unfinished: 0 });
  assert.throws(() => inspectMigrationLedger([...rows, { migration_name: names[1].name, checksum: names[1].sha256,
    finished_at: null, rolled_back_at: null }], names), /MIGRATION_DRIFT/);
  assert.throws(() => inspectMigrationLedger([...rows, { migration_name: 'alien', checksum: lf,
    finished_at: '2026-01-01', rolled_back_at: null }], names), /MIGRATION_DRIFT/);
});

test('migration ledger includes the checked-in 12-digit version migration', () => {
  const names = [migration, { name: '202609120001_competition_operation_versions', sha256: 'b'.repeat(64), sha256Crlf: 'b'.repeat(64) }];
  const rows = [{ migration_name: name, checksum: lf, finished_at: '2026-01-01', rolled_back_at: null }];
  assert.deepEqual(inspectMigrationLedger(rows, names), { applied: 1, pending: 1, unfinished: 0 });
});

test('candidate postcheck requires backfill, constraints, security and no-op ledger', () => {
  const good = { migration: { applied: 2, pending: 0, unfinished: 0 }, certificateMissing: 0, certificateDuplicateCodes: 0,
    certificateConstraints: true, sessionVersion: true, resetTokenUnique: true, rateLimitBucket: true, invalidConstraints: 0,
    bracketAppearanceTable: true, bracketAppearanceDefaults: true, bracketAppearanceConstraints: true };
  assert.equal(assessCandidate(good).status, 'CANDIDATE_READY');
  for (const key of ['bracketAppearanceTable', 'bracketAppearanceDefaults', 'bracketAppearanceConstraints']) {
    assert.throws(() => assessCandidate({ ...good, [key]: false }), /POSTCHECK_FAILED/);
    const missing = { ...good }; delete missing[key];
    assert.throws(() => assessCandidate(missing), /POSTCHECK_FAILED/);
  }
  assert.throws(() => assessCandidate({ ...good, certificateMissing: 1 }), /POSTCHECK_FAILED/);
  assert.throws(() => assessCandidate({ ...good, migration: { applied: 1, pending: 1, unfinished: 0 } }), /POSTCHECK_FAILED/);
});

test('fresh archive path is an exact owned-root file and rejects collisions or redirection', async () => {
  const { assertFreshArchivePath } = recoveryCore;
  const root = await mkdtemp(join(tmpdir(), 'rehearsal-archive-'));
  const archive = join(root, 'miracle-neondb-2026-10-06T01-23-48-741Z.age');
  const manifest = archive.slice(0, -4) + '.json';
  await writeFile(archive, 'synthetic archive');
  await writeFile(manifest, '{}');
  assert.deepEqual(await assertFreshArchivePath(archive, root), { archivePath: archive, manifestPath: manifest });
  for (const path of [join(root, '..', 'other', 'miracle-neondb-2026-10-06T01-23-48-741Z.age'),
    join(root, 'other.age'), join(root, 'miracle-neondb-2026-10-06T01-23-48-741Z.age.partial'),
    join(root, '.', '..', 'other.age')]) {
    await assert.rejects(assertFreshArchivePath(path, root), /ARCHIVE_REJECTED/);
  }
  const linked = join(root, 'miracle-neondb-2026-10-06T01-23-48-742Z.age');
  await symlink(archive, linked, 'file');
  await writeFile(linked.slice(0, -4) + '.json', '{}');
  await assert.rejects(assertFreshArchivePath(linked, root), /ARCHIVE_REJECTED/);
});

test('fresh archive binding requires matching manifest, authenticated bytes and current age', () => {
  const { assessAuthenticatedArchive } = recoveryCore;
  const archive = 'miracle-neondb-2026-10-06T01-23-48-741Z.age';
  const sha256 = 'a'.repeat(64);
  const pair = { bytes: 123, sha256 };
  const verified = { status: 'ARCHIVE_VERIFIED', ...pair };
  const manifest = { format: 'pg_dump-custom+age-v1', source: 'approved-direct-neondb', archive,
    createdAt: '2026-10-06T01:23:48.741Z', completedAt: '2026-10-06T01:25:00.000Z', ...pair,
    checkpoint: { snapshot: '00000001-00000001-1', appliedMigrations: 17,
      ledgerSha256: sha256, schemaSha256: sha256, tableCounts: {}, tableChecksumsMd5: {},
      integrity: { invalidConstraints: 0, criticalUniqueIndexes: true } } };
  const now = Date.parse('2026-10-06T01:40:00.000Z');
  assert.doesNotThrow(() => assessAuthenticatedArchive(archive, manifest, pair, verified, now));
  for (const changed of [
    { archive: 'other.age' }, { format: 'other' }, { source: 'other' },
    { createdAt: '2026-10-06T01:23:48.742Z' }, { completedAt: '2026-10-06T01:22:00.000Z' },
    { bytes: 124 }, { sha256: 'b'.repeat(64) }, { checkpoint: null },
  ]) assert.throws(() => assessAuthenticatedArchive(archive, { ...manifest, ...changed }, pair, verified, now), /ARCHIVE_REJECTED/);
  assert.throws(() => assessAuthenticatedArchive(archive, manifest, pair,
    { ...verified, sha256: 'b'.repeat(64) }, now), /ARCHIVE_REJECTED/);
  assert.throws(() => assessAuthenticatedArchive(archive, manifest, pair, verified,
    Date.parse('2026-10-06T02:25:00.001Z')), /ARCHIVE_REJECTED/);
  assert.throws(() => assessAuthenticatedArchive(archive, manifest, pair, verified,
    Date.parse('2026-10-06T01:24:00.000Z')), /ARCHIVE_REJECTED/);
});

test('logical checkpoint permits representation drift only after all named values and schema match', () => {
  const ledger = [{ migration_name: name, checksum: lf, finished_at: '2026-01-01',
    rolled_back_at: null, started_at: '2026-01-01', id: 'fixture' }];
  const sourceSchema = [...LEGACY_TABLES, '_prisma_migrations'].map(table => ({
    table_name: table, column_name: 'id', data_type: 'text', is_nullable: 'NO', ordinal_position: 2,
  }));
  const localSchema = sourceSchema.map(row => row.table_name === 'Event' ? { ...row, ordinal_position: 1 } : row);
  const counts = Object.fromEntries(LEGACY_TABLES.map(table => [table, table === 'User' ? 2 : 0]));
  const sourceChecksums = Object.fromEntries(LEGACY_TABLES.map(table => [table, 'a'.repeat(32)]));
  const localChecksums = { ...sourceChecksums, User: 'c'.repeat(32) };
  const canonical = Object.fromEntries(LEGACY_TABLES.map(table => [table, 'b'.repeat(32)]));
  const integrity = { invalidConstraints: 0, criticalUniqueIndexes: true };
  const expected = { appliedMigrations: 1, ledgerSha256: sha(ledger), schemaSha256: sha(sourceSchema),
    tableCounts: counts, tableChecksumsMd5: sourceChecksums, integrity };
  const raw = { ledger, schema: localSchema, counts, checksums: localChecksums, integrity };
  const schemaWithoutOrdinal = sourceSchema.map(row => ({ table_name: row.table_name,
    column_name: row.column_name, data_type: row.data_type, is_nullable: row.is_nullable }));
  const reference = { schema: schemaWithoutOrdinal, logicalSchema: schemaWithoutOrdinal, canonical };
  const localLogical = { schema: schemaWithoutOrdinal, canonical };
  const proof = compareLogicalRecoveryCheckpoint(raw, localLogical, reference, expected, [migration]);
  assert.equal(proof.tableCount, 23);
  assert.deepEqual(proof.representationDifferences.originalCompositeTables, ['User']);
  assert.equal(proof.representationDifferences.schemaOrdinalOrOrder, true);
  for (const [changedRaw, changedLogical, changedReference] of [
    [raw, { ...localLogical, canonical: { ...canonical, User: 'd'.repeat(32) } }, reference],
    [{ ...raw, schema: localSchema.map(row => row.table_name === 'Event' ? { ...row, data_type: 'integer' } : row) }, localLogical, reference],
    [raw, { ...localLogical, schema: schemaWithoutOrdinal.map(row => row.table_name === 'Event' ?
      { ...row, data_type: 'character varying(20)' } : row) }, reference],
    [{ ...raw, counts: { ...counts, User: 3 } }, localLogical, reference],
    [{ ...raw, integrity: { ...integrity, invalidConstraints: 1 } }, localLogical, reference],
    [{ ...raw, ledger: [{ ...ledger[0], id: 'changed' }] }, localLogical, reference],
    [raw, localLogical, { ...reference, canonical: { User: canonical.User } }],
  ]) assert.throws(() => compareLogicalRecoveryCheckpoint(changedRaw, changedLogical,
    changedReference, expected, [migration]), /CHECKPOINT_DRIFT/);
});
