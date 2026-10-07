import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LEGACY_TABLES } from '../../scripts/operations/local-backup-snapshot.mjs';
import { buildTargetCatalog } from '../../scripts/operations/testing-schema-core.mjs';

const baseline = JSON.parse(await readFile(new URL('../../scripts/operations/testing-schema-baseline.json', import.meta.url)));
const canonical = JSON.parse(await readFile(new URL('../../scripts/operations/testing-schema-reference.json', import.meta.url)));
const repaired = buildTargetCatalog(baseline, canonical);
const ledger = [{ name: 'synthetic_migration', sha256: 'a'.repeat(64) }];

function raw(catalog) {
  return {
    snapshot: '00000001-00000001-1',
    source: { database: 'neondb', branch: 'br-young-thunder-az5w6nt3', serverVersion: 180006, ssl: true },
    ledger: [{ id: 'synthetic-id', migration_name: ledger[0].name, checksum: ledger[0].sha256,
      finished_at: '2026-10-07T00:00:00Z', rolled_back_at: null, started_at: '2026-10-07T00:00:00Z' }],
    schema: catalog.columns.map((column, index) => ({ table_name: column.table, column_name: column.name,
      data_type: column.type.startsWith('timestamp') ? 'timestamp without time zone' : column.type,
      is_nullable: column.notNull ? 'NO' : 'YES', ordinal_position: index + 1 })),
    counts: Object.fromEntries(LEGACY_TABLES.map(name => [name, 0])),
    checksums: Object.fromEntries(LEGACY_TABLES.map(name => [name, '0'.repeat(32)])),
    integrity: { invalidConstraints: 0, criticalUniqueIndexes: catalog === baseline },
    catalog,
  };
}

test('fixed testing checkpoint admits baseline and exact repaired union while retaining all old-table aggregates', async () => {
  const checkpointApi = await import('../../scripts/operations/testing-schema-checkpoint.mjs').catch(() => ({}));
  assert.equal(typeof checkpointApi.validateTestingCheckpoint, 'function');
  const identity = { database: 'neondb', branch: 'br-young-thunder-az5w6nt3' };
  assert.equal(checkpointApi.validateTestingCheckpoint(raw(baseline), ledger, baseline, canonical, identity).state, 'baseline');
  const after = checkpointApi.validateTestingCheckpoint(raw(repaired), ledger, baseline, canonical, identity);
  assert.equal(after.state, 'repaired');
  assert.equal(Object.keys(after.checkpoint.tableCounts).length, 23);
  assert.equal(Object.keys(after.checkpoint.tableChecksumsMd5).length, 23);
});

test('testing checkpoint rejects repaired catalog drift, missing old checksum, and wrong branch', async () => {
  const checkpointApi = await import('../../scripts/operations/testing-schema-checkpoint.mjs').catch(() => ({}));
  assert.equal(typeof checkpointApi.validateTestingCheckpoint, 'function');
  const identity = { database: 'neondb', branch: 'br-young-thunder-az5w6nt3' };
  const missing = raw(repaired);
  delete missing.checksums.Match;
  assert.throws(() => checkpointApi.validateTestingCheckpoint(missing, ledger, baseline, canonical, identity), /CHECKPOINT_DRIFT/);
  const branch = raw(repaired);
  branch.source.branch = 'br-rough-mountain-azfdh3db';
  assert.throws(() => checkpointApi.validateTestingCheckpoint(branch, ledger, baseline, canonical, identity), /CHECKPOINT_DRIFT/);
  const drift = raw(structuredClone(repaired));
  drift.catalog.indexes = drift.catalog.indexes.filter(index => index.name !== 'Certificate_eventId_type_recipientKind_recipientId_version_key');
  assert.throws(() => checkpointApi.validateTestingCheckpoint(drift, ledger, baseline, canonical, identity), /CATALOG_DRIFT|CHECKPOINT_DRIFT/);
});
