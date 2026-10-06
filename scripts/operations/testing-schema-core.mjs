import { createHash } from 'node:crypto';

const DIRECT_HOST = 'ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech';
const TESTING_SOURCE = 'approved-delicate-testing-direct-neondb';
const TESTING_IDENTITY = Object.freeze({
  project: 'steep-tree-47893196', branch: 'br-young-thunder-az5w6nt3', database: 'neondb',
});
const OBSOLETE_INDEX = 'Certificate_eventId_key';

function fail(code) { const error = new Error(code); error.code = code; return error; }

export function validateTestingSourceUrl(value) {
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== DIRECT_HOST ||
        url.port && url.port !== '5432' || url.pathname !== '/neondb' ||
        !url.username || !url.password || url.hash || ![2, 3].includes(keys.length) ||
        new Set(keys).size !== keys.length || url.searchParams.get('sslmode') !== 'verify-full' ||
        keys.some(key => !['sslmode', 'sslrootcert', 'channel_binding'].includes(key)) ||
        url.searchParams.get('sslrootcert') !== 'system' ||
        url.searchParams.has('channel_binding') && url.searchParams.get('channel_binding') !== 'require') throw fail('SOURCE_REJECTED');
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (!user || !password || /[\x00-\x1f\x7f]/.test(user + password)) throw fail('SOURCE_REJECTED');
    const fields = {
      PGHOST: DIRECT_HOST, PGPORT: url.port || '5432', PGDATABASE: 'neondb',
      PGUSER: user, PGSSLMODE: 'verify-full', PGSSLROOTCERT: 'system',
    };
    if (url.searchParams.has('channel_binding')) fields.PGCHANNELBINDING = 'require';
    Object.defineProperty(fields, 'PGPASSWORD', { value: password, enumerable: false });
    return fields;
  } catch { throw fail('SOURCE_REJECTED'); }
}

export function normalizeTestingSourcePair(directRaw, pooledRaw) {
  try {
    const parse = (raw, host) => {
      const url = new URL(raw);
      const keys = [...url.searchParams.keys()];
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host ||
          url.port && url.port !== '5432' || url.pathname !== '/neondb' ||
          !url.username || !url.password || url.hash || keys.length < 1 || keys.length > 3 ||
          new Set(keys).size !== keys.length ||
          keys.some(key => !['sslmode', 'sslrootcert', 'channel_binding'].includes(key)) ||
          !['require', 'verify-full'].includes(url.searchParams.get('sslmode')) ||
          url.searchParams.has('sslrootcert') && url.searchParams.get('sslrootcert') !== 'system' ||
          url.searchParams.has('channel_binding') && url.searchParams.get('channel_binding') !== 'require') throw fail('SOURCE_REJECTED');
      url.searchParams.set('sslmode', 'verify-full');
      url.searchParams.set('sslrootcert', 'system');
      return url;
    };
    const direct = parse(directRaw, DIRECT_HOST);
    const pooled = parse(pooledRaw, DIRECT_HOST.replace('.c-3.', '-pooler.c-3.'));
    if (direct.username !== pooled.username || direct.password !== pooled.password || direct.port !== pooled.port ||
        direct.searchParams.has('channel_binding') !== pooled.searchParams.has('channel_binding')) throw fail('SOURCE_REJECTED');
    validateTestingSourceUrl(direct.href);
    return { direct: direct.href, pooled: pooled.href };
  } catch { throw fail('SOURCE_REJECTED'); }
}

function normalize(value) {
  if (typeof value === 'string') return value.replaceAll('\r\n', '\n');
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, normalize(item)]));
}

function stableCatalog(catalog) {
  try {
    const keys = ['tables', 'columns', 'indexes', 'constraints', 'enums', 'triggers', 'functions'];
    if (!catalog || keys.some(key => !Array.isArray(catalog[key]))) throw fail('CATALOG_DRIFT');
    return Object.fromEntries(keys.map(key => [key, catalog[key].map(normalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
  } catch { throw fail('CATALOG_DRIFT'); }
}

export function catalogSha256(catalog) {
  return createHash('sha256').update(JSON.stringify(stableCatalog(catalog))).digest('hex');
}

export function buildTargetCatalog(baseline, canonical) {
  const old = stableCatalog(baseline);
  const desired = stableCatalog(canonical);
  const result = {};
  for (const key of Object.keys(old)) {
    const canonicalEntries = desired[key];
    const canonicalNames = new Set(canonicalEntries.map(item => key === 'enums' || key === 'functions' ? item.name :
      key === 'tables' ? item.name : `${item.table}.${item.name}`));
    const retained = old[key].filter(item => {
      if (key === 'indexes' && item.table === 'Certificate' && item.name === OBSOLETE_INDEX) return false;
      const name = key === 'enums' || key === 'functions' || key === 'tables' ? item.name : `${item.table}.${item.name}`;
      return !canonicalNames.has(name);
    });
    result[key] = [...canonicalEntries, ...retained];
  }
  return stableCatalog(result);
}

export function assertCatalogState(actual, baseline, canonical, phase) {
  const digest = catalogSha256(actual);
  const target = catalogSha256(buildTargetCatalog(baseline, canonical));
  if (digest === target) return 'repaired';
  if (phase === 'before' && digest === catalogSha256(baseline)) return 'baseline';
  throw fail('CATALOG_DRIFT');
}

export function assertRepairSql(sql, expectedSha256) {
  if (typeof sql !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw fail('PLAN_REJECTED');
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  const drops = [...withoutComments.matchAll(/\bDROP\s+INDEX\b[^;]*;/gi)].map(x => x[0].replace(/\s+/g, ' ').trim());
  if (/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE|COLUMN|CONSTRAINT)|TRUNCATE|DELETE\s+FROM)\b/i.test(withoutComments) ||
      /\bALTER\s+TABLE\b[^;]*\bDROP\b/i.test(withoutComments) ||
      drops.length !== 1 || drops[0] !== 'DROP INDEX IF EXISTS "Certificate_eventId_key";' ||
      createHash('sha256').update(sql).digest('hex') !== expectedSha256) throw fail('PLAN_REJECTED');
  return expectedSha256;
}

export function assertCanonicalLedgerLf(rows, expected) {
  try {
    if (!Array.isArray(rows) || !Array.isArray(expected) || rows.length !== expected.length) throw fail('CHECKPOINT_DRIFT');
    const allowed = new Map(expected.map(item => [item.name, item.sha256]));
    if (allowed.size !== expected.length) throw fail('CHECKPOINT_DRIFT');
    const seen = new Set();
    for (const row of rows) {
      if (!allowed.has(row.migration_name) || seen.has(row.migration_name) ||
          row.checksum !== allowed.get(row.migration_name) ||
          !row.finished_at || row.rolled_back_at) throw fail('CHECKPOINT_DRIFT');
      seen.add(row.migration_name);
    }
    return true;
  } catch { throw fail('CHECKPOINT_DRIFT'); }
}

export function assertTestingBackupReceipt(manifest, verifiedArchive, currentCheckpoint) {
  try {
    if (manifest?.format !== 'pg_dump-custom+age-v1' || manifest.source !== TESTING_SOURCE ||
        JSON.stringify(manifest.testing) !== JSON.stringify(TESTING_IDENTITY) ||
        !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
        verifiedArchive?.bytes !== manifest.bytes || verifiedArchive.sha256 !== manifest.sha256 ||
        manifest.checkpoint?.appliedMigrations !== 37 || currentCheckpoint?.appliedMigrations !== 37 ||
        manifest.checkpoint.ledgerSha256 !== currentCheckpoint.ledgerSha256 ||
        manifest.checkpoint.schemaSha256 !== currentCheckpoint.schemaSha256 ||
        !/^[a-f0-9]{64}$/.test(currentCheckpoint.ledgerSha256) ||
        !/^[a-f0-9]{64}$/.test(currentCheckpoint.schemaSha256) ||
        JSON.stringify(normalize(manifest.checkpoint.tableCounts)) !== JSON.stringify(normalize(currentCheckpoint.tableCounts)) ||
        JSON.stringify(normalize(manifest.checkpoint.tableChecksumsMd5)) !== JSON.stringify(normalize(currentCheckpoint.tableChecksumsMd5)) ||
        JSON.stringify(normalize(manifest.checkpoint.integrity)) !== JSON.stringify(normalize(currentCheckpoint.integrity))) throw fail('BACKUP_REJECTED');
    return true;
  } catch { throw fail('BACKUP_REJECTED'); }
}

export { TESTING_IDENTITY, TESTING_SOURCE };
