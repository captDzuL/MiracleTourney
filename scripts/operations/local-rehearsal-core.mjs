import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

function fail(code) { const error = new Error(code); error.code = code; return error; }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function assertLocalTarget(target) {
  if (target?.host !== '127.0.0.1' || target.port !== 55438 ||
      !['recovery_baseline', 'migration_candidate'].includes(target.database)) throw fail('TARGET_REJECTED');
  return { host: target.host, port: target.port, database: target.database };
}

export async function assertFreshRehearsalPath(target, root) {
  try {
    if (typeof target !== 'string' || typeof root !== 'string' || !isAbsolute(target) || !isAbsolute(root) ||
        dirname(resolve(target)).toLowerCase() !== resolve(root).toLowerCase() ||
        !/^rehearsal-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/.test(basename(target)) ||
        existsSync(target)) throw fail('PATH_REJECTED');
    try { lstatSync(target); throw fail('PATH_REJECTED'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    for (let cursor = resolve(root); ; cursor = dirname(cursor)) {
      const item = lstatSync(cursor);
      if (item.isSymbolicLink() || !item.isDirectory() ||
          realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) throw fail('PATH_REJECTED');
      if (dirname(cursor) === cursor) break;
    }
    return resolve(target);
  } catch { throw fail('PATH_REJECTED'); }
}

export function inspectMigrationLedger(rows, expected) {
  try {
    if (!Array.isArray(rows) || !Array.isArray(expected) || expected.length === 0 ||
        expected.some(item => !/^(?:\d{12}|\d{14})_[a-z0-9_]+$/.test(item.name) ||
          !/^[a-f0-9]{64}$/.test(item.sha256) || !/^[a-f0-9]{64}$/.test(item.sha256Crlf))) throw fail('MIGRATION_DRIFT');
    const byName = new Map(expected.map((item, index) => [item.name, { ...item, index }]));
    if (byName.size !== expected.length) throw fail('MIGRATION_DRIFT');
    const applied = new Set();
    for (const row of rows) {
      const item = byName.get(row.migration_name);
      if (!item || row.finished_at && row.rolled_back_at || !row.finished_at && !row.rolled_back_at) throw fail('MIGRATION_DRIFT');
      if (row.finished_at) {
        if (applied.has(item.name) || ![item.sha256, item.sha256Crlf].includes(row.checksum)) throw fail('MIGRATION_DRIFT');
        applied.add(item.name);
      }
    }
    if (expected.some((item, index) => applied.has(item.name) !== (index < applied.size))) throw fail('MIGRATION_DRIFT');
    return { applied: applied.size, pending: expected.length - applied.size, unfinished: 0 };
  } catch { throw fail('MIGRATION_DRIFT'); }
}

export function compareRestoredCheckpoint(raw, expected, expectedLedger) {
  const safe = check => { try { return check() === true; } catch { return false; } };
  const shape = !!(raw && expected && Array.isArray(raw.ledger) && Array.isArray(raw.schema) &&
    raw.counts && raw.checksums && raw.integrity);
  let inspected;
  try { if (shape) inspected = inspectMigrationLedger(raw.ledger, expectedLedger); } catch { /* fixed Boolean only */ }
  const names = Array.isArray(expectedLedger) ? new Set(expectedLedger.map(item => item.name)) : new Set();
  const tableNames = expected?.tableCounts && typeof expected.tableCounts === 'object'
    ? Object.keys(expected.tableCounts) : [];
  const checksumNames = expected?.tableChecksumsMd5 && typeof expected.tableChecksumsMd5 === 'object'
    ? Object.keys(expected.tableChecksumsMd5) : [];
  const countsByTable = Object.fromEntries(tableNames.map(table =>
    [table, safe(() => Object.hasOwn(raw.counts, table) && raw.counts[table] === expected.tableCounts[table])]));
  const checksumsByTable = Object.fromEntries(checksumNames.map(table =>
    [table, safe(() => Object.hasOwn(raw.checksums, table) && raw.checksums[table] === expected.tableChecksumsMd5[table])]));
  const predicates = {
    shape,
    ledgerKnown: safe(() => shape && names.size === expectedLedger.length &&
      raw.ledger.every(row => names.has(row.migration_name))),
    ledgerValidPrefix: !!inspected,
    appliedCount: safe(() => inspected?.applied === expected.appliedMigrations),
    ledgerSha256: safe(() => shape && digest(raw.ledger) === expected.ledgerSha256),
    schemaSha256: safe(() => shape && digest(raw.schema) === expected.schemaSha256),
    schemaBinaryOrderSha256: safe(() => shape && digest([...raw.schema].sort((a, b) =>
      a.table_name < b.table_name ? -1 : a.table_name > b.table_name ? 1 :
        a.ordinal_position - b.ordinal_position)) === expected.schemaSha256),
    tableCounts: safe(() => shape && equal(raw.counts, expected.tableCounts)),
    tableChecksumsMd5: safe(() => shape && equal(raw.checksums, expected.tableChecksumsMd5)),
    integrity: safe(() => shape && equal(raw.integrity, expected.integrity)),
    countsByTable,
    checksumsByTable,
  };
  const required = ['shape', 'ledgerKnown', 'ledgerValidPrefix', 'appliedCount', 'ledgerSha256',
    'schemaSha256', 'tableCounts', 'tableChecksumsMd5', 'integrity'];
  if (required.some(name => !predicates[name])) {
    const error = fail('CHECKPOINT_DRIFT');
    error.predicates = predicates;
    throw error;
  }
  return { appliedMigrations: expected.appliedMigrations,
    tableCount: Object.keys(raw.counts).length, rowCount: Object.values(raw.counts).reduce((a, b) => a + b, 0) };
}

export function assessCandidate(value) {
  if (!value || value.migration?.pending !== 0 || value.migration?.unfinished !== 0 ||
      !Number.isSafeInteger(value.migration?.applied) || value.certificateMissing !== 0 ||
      value.certificateDuplicateCodes !== 0 || value.certificateConstraints !== true ||
      value.sessionVersion !== true || value.resetTokenUnique !== true ||
      value.rateLimitBucket !== true || value.invalidConstraints !== 0) throw fail('POSTCHECK_FAILED');
  return { status: 'CANDIDATE_READY', appliedMigrations: value.migration.applied };
}
