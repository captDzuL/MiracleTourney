import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { LEGACY_TABLES } from './local-backup-snapshot.mjs';

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

const archiveName = /^miracle-neondb-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)\.age$/;
const sha256 = /^[a-f0-9]{64}$/;

export async function assertFreshArchivePath(archive, root) {
  try {
    if (typeof archive !== 'string' || typeof root !== 'string' ||
        !isAbsolute(archive) || !isAbsolute(root) ||
        archive.split(/[\\/]/).some(part => part === '.' || part === '..') ||
        dirname(resolve(archive)).toLowerCase() !== resolve(root).toLowerCase() ||
        !archiveName.test(basename(archive))) throw fail('ARCHIVE_REJECTED');
    const manifest = join(resolve(root), basename(archive).slice(0, -4) + '.json');
    for (const path of [resolve(archive), manifest]) {
      for (let cursor = path; ; cursor = dirname(cursor)) {
        const entry = lstatSync(cursor);
        if (entry.isSymbolicLink() ||
            realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase() ||
            cursor === path && !entry.isFile()) throw fail('ARCHIVE_REJECTED');
        if (dirname(cursor) === cursor) break;
      }
    }
    return manifest;
  } catch { throw fail('ARCHIVE_REJECTED'); }
}

export function assessAuthenticatedArchive(archiveNameValue, manifest, pair, authentication, now = Date.now()) {
  try {
    const match = archiveName.exec(archiveNameValue);
    if (!match || !manifest || manifest.format !== 'pg_dump-custom+age-v1' ||
        manifest.source !== 'approved-direct-neondb' || manifest.archive !== archiveNameValue ||
        !Number.isSafeInteger(pair?.bytes) || pair.bytes <= 0 || !sha256.test(pair.sha256) ||
        manifest.bytes !== pair.bytes || manifest.sha256 !== pair.sha256 ||
        authentication?.status !== 'ARCHIVE_VERIFIED' ||
        authentication.bytes !== pair.bytes || authentication.sha256 !== pair.sha256 ||
        !manifest.checkpoint ||
        !/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i.test(manifest.checkpoint.snapshot) ||
        !Number.isSafeInteger(manifest.checkpoint.appliedMigrations) ||
        manifest.checkpoint.appliedMigrations < 0 ||
        !sha256.test(manifest.checkpoint.ledgerSha256) ||
        !sha256.test(manifest.checkpoint.schemaSha256) ||
        !manifest.checkpoint.tableCounts || !manifest.checkpoint.tableChecksumsMd5 ||
        manifest.checkpoint.integrity?.invalidConstraints !== 0 ||
        manifest.checkpoint.integrity?.criticalUniqueIndexes !== true ||
        manifest.createdAt !== match[1].replaceAll('-', (part, offset) => offset >= 10 ? ':' : '-')
          .replace(/:(\d{3})Z$/, '.$1Z')) throw fail('ARCHIVE_REJECTED');
    const created = Date.parse(manifest.createdAt);
    const completed = Date.parse(manifest.completedAt);
    if (!Number.isFinite(created) || !Number.isFinite(completed) || !Number.isFinite(now) ||
        completed < created || completed > now || now - completed > 3_600_000) throw fail('ARCHIVE_REJECTED');
    return { bytes: pair.bytes, sha256: pair.sha256 };
  } catch { throw fail('ARCHIVE_REJECTED'); }
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

const recoveryTableNames = [...LEGACY_TABLES, '_prisma_migrations'].sort();
const recoveryContentNames = [...LEGACY_TABLES].sort();
const schemaFields = ['table_name', 'column_name', 'data_type', 'is_nullable'];
const binaryCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

export function normalizeRecoverySchema(schema) {
  try {
    if (!Array.isArray(schema) || schema.length === 0 || schema.length > 4096) throw fail('CHECKPOINT_DRIFT');
    const normalized = schema.map(row => {
      const keys = Object.keys(row || {}).sort();
      if (JSON.stringify(keys) !== JSON.stringify([...schemaFields].sort()) &&
          JSON.stringify(keys) !== JSON.stringify([...schemaFields, 'ordinal_position'].sort()) ||
          !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(row.table_name) ||
          !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(row.column_name) ||
          typeof row.data_type !== 'string' || row.data_type.length === 0 || row.data_type.length > 120 ||
          !['YES', 'NO'].includes(row.is_nullable) ||
          Object.hasOwn(row, 'ordinal_position') &&
            (!Number.isSafeInteger(row.ordinal_position) || row.ordinal_position <= 0)) throw fail('CHECKPOINT_DRIFT');
      return Object.fromEntries(schemaFields.map(key => [key, row[key]]));
    });
    const names = [...new Set(normalized.map(row => row.table_name))].sort();
    if (JSON.stringify(names) !== JSON.stringify(recoveryTableNames)) throw fail('CHECKPOINT_DRIFT');
    normalized.sort((a, b) => binaryCompare(`${a.table_name}\0${a.column_name}`, `${b.table_name}\0${b.column_name}`));
    if (normalized.some((row, index) => index > 0 && row.table_name === normalized[index - 1].table_name &&
        row.column_name === normalized[index - 1].column_name)) throw fail('CHECKPOINT_DRIFT');
    return normalized;
  } catch { throw fail('CHECKPOINT_DRIFT'); }
}

function validCanonical(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(recoveryContentNames) &&
    LEGACY_TABLES.every(table => typeof value[table] === 'string' && /^[a-f0-9]{32}$/.test(value[table]));
}

export function compareLogicalRecoveryCheckpoint(raw, localLogical, sourceReference, expected, expectedLedger) {
  let strictFailure;
  try { compareRestoredCheckpoint(raw, expected, expectedLedger); }
  catch (error) { strictFailure = error; }
  try {
    if (!sourceReference || !localLogical || !validCanonical(sourceReference.canonical) ||
        !validCanonical(localLogical.canonical) ||
        JSON.stringify(normalizeRecoverySchema(sourceReference.schema)) !==
          JSON.stringify(normalizeRecoverySchema(raw?.schema)) ||
        JSON.stringify(normalizeRecoverySchema(sourceReference.logicalSchema)) !==
          JSON.stringify(normalizeRecoverySchema(localLogical.schema))) throw fail('CHECKPOINT_DRIFT');
    const required = ['shape', 'ledgerKnown', 'ledgerValidPrefix', 'appliedCount',
      'ledgerSha256', 'tableCounts', 'integrity'];
    if (strictFailure && (strictFailure.code !== 'CHECKPOINT_DRIFT' ||
        required.some(name => strictFailure.predicates?.[name] !== true))) throw fail('CHECKPOINT_DRIFT');
    if (LEGACY_TABLES.some(table => localLogical.canonical[table] !== sourceReference.canonical[table])) throw fail('CHECKPOINT_DRIFT');
    return {
      appliedMigrations: expected.appliedMigrations,
      tableCount: LEGACY_TABLES.length,
      rowCount: Object.values(raw.counts).reduce((a, b) => a + b, 0),
      representationDifferences: {
        schemaOrdinalOrOrder: strictFailure ? !strictFailure.predicates.schemaSha256 : false,
        originalCompositeTables: LEGACY_TABLES.filter(table =>
          raw.checksums[table] !== expected.tableChecksumsMd5[table]),
      },
      logicalSchemaAndAllValuesMatched: true,
    };
  } catch {
    const error = fail('CHECKPOINT_DRIFT');
    if (strictFailure?.predicates) error.predicates = strictFailure.predicates;
    throw error;
  }
}

export function assessCandidate(value) {
  if (!value || value.migration?.pending !== 0 || value.migration?.unfinished !== 0 ||
      !Number.isSafeInteger(value.migration?.applied) || value.certificateMissing !== 0 ||
      value.certificateDuplicateCodes !== 0 || value.certificateConstraints !== true ||
      value.sessionVersion !== true || value.resetTokenUnique !== true ||
      value.rateLimitBucket !== true || value.invalidConstraints !== 0 ||
      value.bracketAppearanceTable !== true || value.bracketAppearanceDefaults !== true ||
      value.bracketAppearanceConstraints !== true) throw fail('POSTCHECK_FAILED');
  return { status: 'CANDIDATE_READY', appliedMigrations: value.migration.applied };
}
