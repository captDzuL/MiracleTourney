import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { verifyBackupPair } from './local-backup-core.mjs';
import { prepareFixedTestingExport } from './local-backup-operator.mjs';
import { CATALOG_SQL } from './testing-schema-catalog.mjs';
import { assertCatalogState, assertRepairSql, assertTestingBackupReceipt, TESTING_IDENTITY } from './testing-schema-core.mjs';
import { buildTestingCheckpointSql, validateTestingCheckpoint } from './testing-schema-checkpoint.mjs';
import { verifyTestingFrontendTls } from './testing-schema-tls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pins = Object.freeze({
  baseline: '3cfe0977aae5e81852de23b73be5f73958b964456be141352bef0a211dbaf757',
  reference: 'a1d76982fd70ae25de73d86a34f99bc160540205a1926b543592df7aee82949f',
  sql: '7a171cbf94e535d9cf34012ead6dec9b9b553d809dfb179ecdf4f2e931192a25',
});

function fail(code) { const error = new Error(code); error.code = code; return error; }
const digest = value => createHash('sha256').update(value).digest('hex');

async function readPinned(name, pin) {
  const path = join(here, name);
  const bytes = await readFile(path);
  if (digest(bytes) !== pin) throw fail('PLAN_REJECTED');
  return bytes.toString('utf8');
}

function safeName(value) {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value)) throw fail('PLAN_REJECTED');
  return `"${value}"`;
}

export function oldRowProjectionSql(baseline, reference) {
  const previous = new Set(baseline.columns.map(row => `${row.table}.${row.name}`));
  const added = new Map();
  for (const row of reference.columns) {
    if (!previous.has(`${row.table}.${row.name}`)) {
      const list = added.get(row.table) || [];
      list.push(row.name);
      added.set(row.table, list);
    }
  }
  const entries = baseline.tables.map(({ name }) => {
    const removed = added.get(name) || [];
    const projection = removed.length ? `(to_jsonb(t) - ARRAY[${removed.map(column => `'${safeName(column).slice(1, -1)}'`).join(',')}]::text[])` : 'to_jsonb(t)';
    const rowHash = `md5(${projection}::text)`;
    return `'${safeName(name).slice(1, -1)}', (SELECT json_build_object('count', count(*)::bigint,
      'md5', md5(coalesce(string_agg(${rowHash}, '' ORDER BY ${rowHash}), ''))) FROM public.${safeName(name)} t)`;
  });
  return `SELECT 'TASK12_ROWS' || chr(9) || json_build_object(${entries.join(',\n')})::text;`;
}

function fixedReceiptPath(root, value) {
  if (typeof value !== 'string' || !isAbsolute(value) ||
      resolve(dirname(value)).toLowerCase() !== resolve(root).toLowerCase() ||
      !/^miracle-testing-neondb-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.json$/.test(basename(value))) throw fail('BACKUP_REJECTED');
  const entry = lstatSync(value);
  if (!entry.isFile() || entry.isSymbolicLink() || realpathSync.native(value).toLowerCase() !== resolve(value).toLowerCase()) throw fail('BACKUP_REJECTED');
  return resolve(value);
}

export async function readReceipt(root, value) {
  try {
    const manifestPath = fixedReceiptPath(root, value);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const archiveName = basename(manifestPath, '.json') + '.age';
    if (manifest.archive !== archiveName) throw fail('BACKUP_REJECTED');
    const archivePath = join(root, archiveName);
    const entry = lstatSync(archivePath);
    if (!entry.isFile() || entry.isSymbolicLink() || realpathSync.native(archivePath).toLowerCase() !== resolve(archivePath).toLowerCase()) throw fail('BACKUP_REJECTED');
    const completed = Date.parse(manifest.completedAt);
    if (!Number.isFinite(completed) || completed > Date.now() || Date.now() - completed > 3_600_000) throw fail('BACKUP_REJECTED');
    const verified = await verifyBackupPair(archivePath, manifestPath);
    assertTestingBackupReceipt(manifest, verified, manifest.checkpoint);
    return { manifest, verified };
  } catch { throw fail('BACKUP_REJECTED'); }
}

export function checkpointSelect() {
  const source = buildTestingCheckpointSql();
  const start = source.indexOf("SELECT 'MIRACLE_CHECKPOINT'");
  if (start < 0) throw fail('PLAN_REJECTED');
  return source.slice(start).trim();
}

// The CLI below always supplies the fixed Delicate identity; the final
// argument exists only to exercise this same transaction on isolated PG.
export async function runTestingRepairSession(config, manifest, verified, baseline, reference, sql, expectedIdentity = TESTING_IDENTITY) {
  const tables = baseline.tables.map(row => `public.${safeName(row.name)}`).join(', ');
  const rowsSql = oldRowProjectionSql(baseline, reference);
  const child = spawn(config.psqlPath, ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
    { env: config.pgEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  let timer;
  let timedOut = false;
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
  const closed = new Promise(resolve => {
    child.once('error', () => resolve(false));
    child.once('close', code => resolve(code === 0));
  });
  timer = setTimeout(() => { timedOut = true; child.kill(); }, 300_000);
  async function send(command) {
    await new Promise((resolveWrite, rejectWrite) => child.stdin.write(`${command.trimEnd()}\n`, error => error ? rejectWrite(error) : resolveWrite()));
  }
  async function marker(command, name) {
    await send(command);
    const line = await lines.next();
    if (line.done || typeof line.value !== 'string' || line.value.length > 1_000_000 ||
        !line.value.startsWith(`${name}\t`)) throw fail('REPAIR_FAILED');
    try { return JSON.parse(line.value.slice(name.length + 1)); }
    catch { throw fail('REPAIR_FAILED'); }
  }
  try {
    const checkpoint = await marker(`BEGIN ISOLATION LEVEL REPEATABLE READ;
      SET LOCAL lock_timeout = '5s';
      SET LOCAL statement_timeout = '120s';
      SET LOCAL idle_in_transaction_session_timeout = '180s';
      LOCK TABLE ${tables} IN ACCESS EXCLUSIVE MODE NOWAIT;
      ${checkpointSelect()}`, 'MIRACLE_CHECKPOINT');
    const identity = await marker(`SELECT 'TASK12_IDENTITY' || chr(9) || json_build_object(
      'database', current_database(), 'branch', current_setting('neon.branch_id', true),
      'otherActive', (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()
        AND pid <> pg_backend_pid() AND state <> 'idle'))::text;`, 'TASK12_IDENTITY');
    if (identity.database !== expectedIdentity.database || identity.branch !== expectedIdentity.branch ||
        identity.otherActive !== 0) throw fail('SOURCE_REJECTED');
    const catalog = await marker(`SELECT 'TASK12_CATALOG' || chr(9) || (${CATALOG_SQL})::text;`, 'TASK12_CATALOG');
    const { state, checkpoint: validated } = validateTestingCheckpoint(checkpoint, config.expectedLedger,
      baseline, reference, expectedIdentity);
    if (assertCatalogState(catalog, baseline, reference, 'before') !== state) throw fail('CATALOG_DRIFT');
    assertTestingBackupReceipt(manifest, verified, validated);
    if (state === 'repaired') {
      await send('ROLLBACK;');
      child.stdin.end();
      if (!await closed || timedOut) throw fail('REPAIR_FAILED');
      return { status: 'TESTING_SCHEMA_ALREADY_REPAIRED', ledgerSha256: validated.ledgerSha256 };
    }
    const rowsBefore = await marker(rowsSql, 'TASK12_ROWS');
    const afterCatalog = await marker(`${sql}\nSELECT 'TASK12_CATALOG' || chr(9) || (${CATALOG_SQL})::text;`, 'TASK12_CATALOG');
    assertCatalogState(afterCatalog, baseline, reference, 'after');
    const rowsAfter = await marker(rowsSql, 'TASK12_ROWS');
    if (JSON.stringify(rowsBefore) !== JSON.stringify(rowsAfter)) throw fail('ROW_DRIFT');
    await send('COMMIT;');
    child.stdin.end();
    if (!await closed || timedOut) throw fail('REPAIR_FAILED');
    return { status: 'TESTING_SCHEMA_REPAIRED', ledgerSha256: validated.ledgerSha256,
      preCatalogSha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),
      oldRowProjection: rowsBefore };
  } catch (error) {
    child.kill();
    if (timedOut) throw fail('REPAIR_TIMEOUT');
    const allowed = new Set(['SOURCE_REJECTED', 'CATALOG_DRIFT', 'CHECKPOINT_DRIFT', 'BACKUP_REJECTED', 'ROW_DRIFT', 'PLAN_REJECTED']);
    throw allowed.has(error?.code) ? error : fail('REPAIR_FAILED');
  } finally {
    clearTimeout(timer);
    if (!child.killed) child.kill();
    void stderr;
  }
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--manifest') throw fail('CONFIG_REJECTED');
  const [baselineText, referenceText, sql] = await Promise.all([
    readPinned('testing-schema-baseline.json', pins.baseline),
    readPinned('testing-schema-reference.json', pins.reference),
    readPinned('testing-schema-repair.sql', pins.sql),
  ]);
  assertRepairSql(sql, pins.sql);
  const baseline = JSON.parse(baselineText);
  const reference = JSON.parse(referenceText);
  const config = await prepareFixedTestingExport();
  await verifyTestingFrontendTls();
  const { manifest, verified } = await readReceipt(config.output, process.argv[3]);
  const result = await runTestingRepairSession(config, manifest, verified, baseline, reference, sql);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  const allowed = new Set(['CONFIG_REJECTED', 'SOURCE_REJECTED', 'PLAN_REJECTED', 'BACKUP_REJECTED',
    'CHECKPOINT_DRIFT', 'CATALOG_DRIFT', 'ROW_DRIFT', 'REPAIR_FAILED', 'REPAIR_TIMEOUT',
    'TOOL_REJECTED', 'KEY_NOT_READY', 'OUTPUT_REJECTED', 'CAPACITY_REJECTED', 'TLS_REJECTED']);
  process.stderr.write(`${allowed.has(error?.code) ? error.code : 'REPAIR_FAILED'}\n`);
  process.exitCode = 1;
});
