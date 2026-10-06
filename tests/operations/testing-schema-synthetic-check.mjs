import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { CATALOG_SQL } from '../../scripts/operations/testing-schema-catalog.mjs';
import { assertCatalogState, buildTargetCatalog, catalogSha256 } from '../../scripts/operations/testing-schema-core.mjs';

const baseline = JSON.parse(await readFile(new URL('../../scripts/operations/testing-schema-baseline.json', import.meta.url)));
const canonical = JSON.parse(await readFile(new URL('../../scripts/operations/testing-schema-reference.json', import.meta.url)));
const [mode, snapshotFile] = process.argv.slice(2);
const legacy = ['CheckIn', 'EventAnalyticsSnapshot', 'EventPromotion', 'Notification', 'OrganizerPlan', '_prisma_migrations'];
const quote = value => `"${value.replaceAll('"', '""')}"`;

if (mode === 'legacy-sql') {
  const statements = [];
  for (const table of legacy) {
    const columns = baseline.columns.filter(row => row.table === table).map(row =>
      `${quote(row.name)} ${row.type}${row.notNull ? ' NOT NULL' : ''}${row.default ? ` DEFAULT ${row.default}` : ''}`);
    const constraints = baseline.constraints.filter(row => row.table === table && row.type !== 'n').map(row =>
      `CONSTRAINT ${quote(row.name)} ${row.definition}`);
    statements.push(`CREATE TABLE public.${quote(table)} (${[...columns, ...constraints].join(', ')});`);
    for (const index of baseline.indexes.filter(row => row.table === table && !row.name.endsWith('_pkey'))) {
      statements.push(`${index.definition};`);
    }
  }
  for (const name of ['Event_status_idx', 'Match_eventId_status_idx', 'Player_eventId_idx',
    'Player_teamId_idx', 'PlayerStat_matchId_idx']) {
    const index = baseline.indexes.find(row => row.name === name);
    assert.ok(index);
    statements.push(`${index.definition};`);
  }
  process.stdout.write(`${statements.join('\n')}\n`);
  process.exit(0);
}

assert.ok(['before', 'rollback', 'after', 'noop'].includes(mode));
assert.ok(snapshotFile);
const db = new PrismaClient({ datasources: { db: { url: process.env.TASK12_SYNTHETIC_URL } } });
async function snapshot() {
  const [catalogRow] = await db.$queryRawUnsafe(`${CATALOG_SQL} AS catalog`);
  const rows = {};
  for (const { name } of baseline.tables) {
    const [result] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS md5
      FROM public.${quote(name)} t`);
    rows[name] = result;
  }
  return { catalog: catalogRow.catalog, rows };
}

function oldRowSql(name) {
  const existing = new Set(baseline.columns.filter(row => row.table === name).map(row => row.name));
  const added = canonical.columns.filter(row => row.table === name && !existing.has(row.name)).map(row => row.name);
  const projection = added.length ? `to_jsonb(t) - ARRAY[${added.map(row => `'${row}'`).join(',')}]::text[]` : 'to_jsonb(t)';
  return `SELECT count(*)::int AS count,
    md5(coalesce(string_agg(md5((${projection})::text), '' ORDER BY md5((${projection})::text)), '')) AS md5
    FROM public.${quote(name)} t`;
}

try {
  const current = await snapshot();
  if (mode === 'before') {
    assert.equal(assertCatalogState(current.catalog, baseline, canonical, 'before'), 'baseline');
    await writeFile(snapshotFile, JSON.stringify(current));
    process.stdout.write(`SYNTHETIC_BASELINE ${catalogSha256(current.catalog)}\n`);
  } else {
    const before = JSON.parse(await readFile(snapshotFile, 'utf8'));
    if (mode === 'rollback') {
      assert.equal(catalogSha256(current.catalog), catalogSha256(before.catalog));
      assert.deepEqual(current.rows, before.rows);
      process.stdout.write('SYNTHETIC_ROLLBACK_PRESERVED\n');
    } else {
      assert.equal(assertCatalogState(current.catalog, baseline, canonical, 'after'), 'repaired');
      assert.equal(catalogSha256(current.catalog), catalogSha256(buildTargetCatalog(baseline, canonical)));
      assert.deepEqual(['tables', 'columns', 'indexes', 'constraints', 'enums', 'triggers', 'functions']
        .map(key => current.catalog[key].length), [50, 545, 156, 525, 10, 1, 1]);
      // The catalog includes exact old legacy columns/indexes/constraints; compare
      // each old row using only its old columns because canonical backfills add fields.
      for (const { name } of baseline.tables) {
        const [result] = await db.$queryRawUnsafe(oldRowSql(name));
        assert.deepEqual(result, before.rows[name]);
      }
      const [certificate] = await db.$queryRawUnsafe('SELECT "recipientKind", "recipientId", "recipientName", "verificationCode", "publishedUrl", "status" FROM public."Certificate" WHERE id = \'cert1\'');
      assert.deepEqual(certificate, { recipientKind: 'team', recipientId: 'team1', recipientName: 'Synthetic team', verificationCode: 'cert1', publishedUrl: 'https://example.test/cert.png', status: 'ready' });
      process.stdout.write(mode === 'after' ? 'SYNTHETIC_REPAIR_PRESERVED\n' : 'SYNTHETIC_NOOP_STATE\n');
    }
  }
} finally {
  await db.$disconnect();
}
