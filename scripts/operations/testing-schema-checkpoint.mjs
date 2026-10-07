import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LEGACY_TABLES, buildCheckpointSql, runSnapshotSession, validateCheckpoint } from './local-backup-snapshot.mjs';
import { CATALOG_SQL } from './testing-schema-catalog.mjs';
import { assertCanonicalLedgerLf, assertCatalogState } from './testing-schema-core.mjs';

function fail() { const error = new Error('CHECKPOINT_DRIFT'); error.code = 'CHECKPOINT_DRIFT'; return error; }

export async function readPinnedTestingCatalogs() {
  const pins = [
    ['testing-schema-baseline.json', '3cfe0977aae5e81852de23b73be5f73958b964456be141352bef0a211dbaf757'],
    ['testing-schema-reference.json', 'a1d76982fd70ae25de73d86a34f99bc160540205a1926b543592df7aee82949f'],
  ];
  const catalogs = [];
  for (const [name, expected] of pins) {
    const bytes = await readFile(new URL(name, import.meta.url));
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw fail();
    catalogs.push(JSON.parse(bytes.toString('utf8')));
  }
  return { baseline: catalogs[0], reference: catalogs[1] };
}

// Keep the production checkpoint SQL untouched. The added catalog is read in
// the same exported snapshot as the original-table counts and checksums.
export function buildTestingCheckpointSql() {
  const sql = buildCheckpointSql();
  const sourceNeedle = "'source', json_build_object('database', current_database(),";
  const catalogNeedle = "'integrity', json_build_object(";
  if (sql.split(sourceNeedle).length !== 2 || sql.split(catalogNeedle).length !== 2) throw fail();
  return sql.replace(sourceNeedle,
    "'source', json_build_object('branch', current_setting('neon.branch_id', true), 'database', current_database(),")
    .replace(catalogNeedle, `'catalog', (${CATALOG_SQL}),\n  ${catalogNeedle}`);
}

const CRITICAL_COLUMNS = Object.freeze({
  User: { id: ['text', 'NO'], email: ['text', 'NO'], passwordHash: ['text', 'NO'], deactivatedAt: ['timestamp without time zone', 'YES'] },
  Event: { id: ['text', 'NO'], slug: ['text', 'NO'], organizerUserId: ['text', 'YES'] },
  Certificate: { id: ['text', 'NO'], eventId: ['text', 'NO'], teamId: ['text', 'NO'], status: ['text', 'NO'], attemptCount: ['integer', 'NO'] },
  PasswordResetToken: { id: ['text', 'NO'], userId: ['text', 'NO'], token: ['text', 'NO'], expiresAt: ['timestamp without time zone', 'NO'] },
});

export function validateTestingCheckpoint(raw, expectedLedger, baseline, reference, identity) {
  const state = assertCatalogState(raw?.catalog, baseline, reference, 'before');
  try {
    if (raw.source?.database !== identity?.database || raw.source?.branch !== identity?.branch ||
        raw.source.serverVersion < 180000 || raw.source.serverVersion >= 190000 ||
        typeof raw.source.ssl !== 'boolean') throw fail();
    assertCanonicalLedgerLf(raw.ledger, expectedLedger);
    const checkpoint = validateCheckpoint(raw, expectedLedger, []);
    const oldNames = [...LEGACY_TABLES].sort();
    if (JSON.stringify(Object.keys(raw.counts).sort()) !== JSON.stringify(oldNames) ||
        Object.values(raw.counts).some(value => !Number.isSafeInteger(value) || value < 0) ||
        JSON.stringify(Object.keys(raw.checksums || {}).sort()) !== JSON.stringify(oldNames) ||
        Object.values(raw.checksums).some(value => !/^[a-f0-9]{32}$/.test(value))) throw fail();
    const tables = [...new Set(raw.schema.map(row => row.table_name))].sort();
    if (JSON.stringify(tables) !== JSON.stringify(raw.catalog.tables.map(row => row.name).sort())) throw fail();
    const columns = raw.schema.map(row => `${row.table_name}.${row.column_name}`).sort();
    if (JSON.stringify(columns) !== JSON.stringify(raw.catalog.columns.map(row => `${row.table}.${row.name}`).sort())) throw fail();
    for (const [table, tableColumns] of Object.entries(CRITICAL_COLUMNS)) {
      for (const [name, [type, nullable]] of Object.entries(tableColumns)) {
        if (!raw.schema.some(row => row.table_name === table && row.column_name === name &&
            row.data_type === type && row.is_nullable === nullable)) throw fail();
      }
    }
    if (raw.integrity.criticalUniqueIndexes !== (state === 'baseline')) throw fail();
    return { state, checkpoint };
  } catch { throw fail(); }
}

export function runTestingCheckpointSession(config, expectedLedger, baseline, reference, identity, duringSnapshot) {
  return runSnapshotSession({ ...config, sql: buildTestingCheckpointSql(), maxCheckpointBytes: 2_000_000 },
    (raw, signal) => duringSnapshot(validateTestingCheckpoint(raw, expectedLedger, baseline, reference, identity), signal));
}
