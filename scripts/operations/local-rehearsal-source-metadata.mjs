import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareFixedExport } from './local-backup-operator.mjs';

const MANIFEST = 'E:/MiracleBackups/miracle-neondb-2026-10-05T01-23-48-741Z.json';
const ARCHIVE = 'miracle-neondb-2026-10-05T01-23-48-741Z.age';
const ARCHIVE_SHA256 = 'dc30ddf3ae4bb98dacd9d68e293b26cef5a3818664364c405c01d578cf1d7f5b';
const TABLES = Object.freeze(['User', 'Team', 'Player', 'PlayerStat']);
const DIGEST_TABLES = Object.freeze(['User', 'Team', 'Player', 'PlayerStat', 'Event']);
const SETTINGS = Object.freeze(['TimeZone', 'DateStyle', 'IntervalStyle', 'extra_float_digits',
  'bytea_output', 'server_encoding', 'lc_collate', 'collationProvider', 'collationLocale']);
const FLAGS = Object.freeze(['tableFound', 'hasDropped', 'hasTimestamptz', 'hasTemporal',
  'hasInterval', 'hasFloat', 'hasBytea', 'hasGenerated']);

function fail() { const error = new Error('SOURCE_METADATA_REJECTED'); error.code = error.message; return error; }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function tableSql(name) {
  return `'${name}', (SELECT json_build_object(
    'tableFound', count(*) > 0,
    'hasDropped', coalesce(bool_or(a.attisdropped), false),
    'hasTimestamptz', coalesce(bool_or(NOT a.attisdropped AND a.atttypid = 'timestamptz'::regtype), false),
    'hasTemporal', coalesce(bool_or(NOT a.attisdropped AND a.atttypid IN
      ('date'::regtype, 'time'::regtype, 'timetz'::regtype, 'timestamp'::regtype, 'timestamptz'::regtype)), false),
    'hasInterval', coalesce(bool_or(NOT a.attisdropped AND a.atttypid = 'interval'::regtype), false),
    'hasFloat', coalesce(bool_or(NOT a.attisdropped AND a.atttypid IN ('float4'::regtype, 'float8'::regtype)), false),
    'hasBytea', coalesce(bool_or(NOT a.attisdropped AND a.atttypid = 'bytea'::regtype), false),
    'hasGenerated', coalesce(bool_or(NOT a.attisdropped AND a.attgenerated <> ''), false))
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '${name}' AND c.relkind IN ('r', 'p') AND a.attnum > 0)`;
}

export function buildSourceMetadataSql() {
  const settings = SETTINGS.map(name => {
    const expression = name === 'lc_collate' ? '(SELECT datcollate FROM pg_database WHERE datname = current_database())'
      : name === 'collationProvider' ? '(SELECT datlocprovider::text FROM pg_database WHERE datname = current_database())'
        : name === 'collationLocale' ? "coalesce((SELECT datlocale FROM pg_database WHERE datname = current_database()), '')"
          : `current_setting('${name}')`;
    return `'${name}', ${expression}`;
  }).join(',\n    ');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT 'MIRACLE_SOURCE_METADATA' || chr(9) || json_build_object(
  'schema', (SELECT coalesce(json_agg(row_to_json(c) ORDER BY c.table_name, c.ordinal_position), '[]'::json)
    FROM (SELECT columns.table_name, columns.column_name, columns.data_type, columns.is_nullable, columns.ordinal_position
      FROM information_schema.columns columns JOIN information_schema.tables tables
        ON tables.table_schema = columns.table_schema AND tables.table_name = columns.table_name
      WHERE columns.table_schema = 'public' AND tables.table_type = 'BASE TABLE') c),
  'settings', json_build_object(${settings}),
  'tableMetadata', json_build_object(${TABLES.map(tableSql).join(',\n    ')}))::text;
ROLLBACK;
`;
}

export function buildSourceDigestSql() {
  const checksums = DIGEST_TABLES.map(table =>
    `'${table}', (SELECT md5(coalesce(string_agg(md5(t::text), '' ORDER BY md5(t::text)), '')) FROM public."${table}" t)`).join(',\n    ');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT 'MIRACLE_SOURCE_DIGEST' || chr(9) || json_build_object(
    ${checksums})::text;
ROLLBACK;
`;
}

export function summarizeSourceMetadataLine(output, expectedSchemaSha256) {
  try {
    if (typeof output !== 'string' || output.length > 262144 ||
        !/^[a-f0-9]{64}$/.test(expectedSchemaSha256)) throw fail();
    const lines = output.trim().split(/\r?\n/);
    if (lines.length !== 1 || !lines[0].startsWith('MIRACLE_SOURCE_METADATA\t')) throw fail();
    const raw = JSON.parse(lines[0].slice('MIRACLE_SOURCE_METADATA\t'.length));
    if (!exactKeys(raw, ['schema', 'settings', 'tableMetadata']) ||
        !Array.isArray(raw.schema) || raw.schema.length === 0 || raw.schema.length > 4096 ||
        !raw.schema.every(row => exactKeys(row, ['table_name', 'column_name', 'data_type', 'is_nullable', 'ordinal_position']) &&
          ['table_name', 'column_name', 'data_type', 'is_nullable'].every(key => typeof row[key] === 'string') &&
          Number.isSafeInteger(row.ordinal_position) && row.ordinal_position > 0) ||
        !exactKeys(raw.settings, SETTINGS) || !SETTINGS.every(name => typeof raw.settings[name] === 'string' &&
          (name === 'collationLocale' || raw.settings[name].length > 0) &&
          raw.settings[name].length <= 120 && !/[\r\n\x00-\x1f]/.test(raw.settings[name])) ||
        !exactKeys(raw.tableMetadata, TABLES) || !TABLES.every(table =>
          exactKeys(raw.tableMetadata[table], FLAGS) && FLAGS.every(flag => typeof raw.tableMetadata[table][flag] === 'boolean') &&
          raw.tableMetadata[table].tableFound)) throw fail();
    return {
      currentSchemaMatchesManifest: createHash('sha256').update(JSON.stringify(raw.schema)).digest('hex') === expectedSchemaSha256,
      settings: raw.settings,
      tableMetadata: raw.tableMetadata,
      historicalSessionSettingsKnown: false,
    };
  } catch { throw fail(); }
}

export function summarizeSourceDigestLine(output, expectedChecksums) {
  try {
    if (typeof output !== 'string' || output.length > 4096 ||
        !DIGEST_TABLES.every(table => /^[a-f0-9]{32}$/.test(expectedChecksums?.[table]))) throw fail();
    const lines = output.trim().split(/\r?\n/);
    if (lines.length !== 1 || !lines[0].startsWith('MIRACLE_SOURCE_DIGEST\t')) throw fail();
    const actual = JSON.parse(lines[0].slice('MIRACLE_SOURCE_DIGEST\t'.length));
    if (!exactKeys(actual, DIGEST_TABLES) ||
        !DIGEST_TABLES.every(table => typeof actual[table] === 'string' && /^[a-f0-9]{32}$/.test(actual[table]))) throw fail();
    return {
      currentMatchesManifest: Object.fromEntries(DIGEST_TABLES.map(table =>
        [table, actual[table] === expectedChecksums[table]])),
      historicalDataStateKnown: false,
    };
  } catch { throw fail(); }
}

async function readManifestCheckpoint() {
  try {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    if (manifest.archive !== ARCHIVE || manifest.sha256 !== ARCHIVE_SHA256 ||
        !/^[a-f0-9]{64}$/.test(manifest.checkpoint?.schemaSha256) ||
        !DIGEST_TABLES.every(table => /^[a-f0-9]{32}$/.test(manifest.checkpoint?.tableChecksumsMd5?.[table]))) throw fail();
    return manifest.checkpoint;
  } catch { throw fail(); }
}

async function runPinnedPsql(path, env, sql) {
  let child;
  let timer;
  try {
    child = spawn(path, ['-X', '-w', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'],
      { env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let output = '';
    let overflow = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 262144) { overflow = true; child.kill(); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
    const completed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    const timed = new Promise((_, reject) => {
      timer = setTimeout(() => { child.kill(); reject(fail()); }, 30000);
    });
    const code = await Promise.race([completed, timed]);
    if (code !== 0 || overflow) throw fail();
    return output;
  } catch { throw fail(); }
  finally { if (timer) clearTimeout(timer); if (child && !child.killed) child.kill(); }
}

async function main() {
  if (process.argv.length !== 3 || !['--source-metadata-diagnostic', '--source-digest-diagnostic'].includes(process.argv[2])) throw fail();
  const checkpoint = await readManifestCheckpoint();
  const config = await prepareFixedExport();
  const digestMode = process.argv[2] === '--source-digest-diagnostic';
  const output = await runPinnedPsql(config.psqlPath, config.pgEnv,
    digestMode ? buildSourceDigestSql() : buildSourceMetadataSql());
  const result = digestMode
    ? summarizeSourceDigestLine(output, checkpoint.tableChecksumsMd5)
    : summarizeSourceMetadataLine(output, checkpoint.schemaSha256);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch(() => { process.stderr.write('SOURCE_METADATA_REJECTED\n'); process.exitCode = 1; });
}
