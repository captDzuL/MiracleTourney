import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

assert.ok(['before', 'rollback', 'after', 'noop', 'operational-noop'].includes(mode));
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
      if (mode === 'operational-noop') {
        const checkpointModule = await import('../../scripts/operations/testing-schema-checkpoint.mjs');
        const applyModule = await import('../../scripts/operations/testing-schema-apply.mjs');
        assert.equal(typeof checkpointModule.runTestingCheckpointSession, 'function');
        assert.equal(typeof applyModule.runTestingRepairSession, 'function');
        const { loadExpectedLedger } = await import('../../scripts/operations/local-backup-snapshot.mjs');
        const { runTestingEncryptedBackup, verifyBackupPair } = await import('../../scripts/operations/local-backup-core.mjs');
        const migrationRoot = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));
        const names = (await readdir(migrationRoot, { withFileTypes: true }))
          .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
        const expectedLedger = await loadExpectedLedger(migrationRoot, names);
        const url = new URL(process.env.TASK12_SYNTHETIC_URL);
        const pgEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: url.port, PGUSER: url.username,
          PGPASSWORD: url.password, PGDATABASE: 'task12_reference', PGSSLMODE: 'disable' };
        const psqlPath = new URL('../../.superpowers/sdd/2026-10-04-v3-release-pr-readiness/runtime/catalog-server/pgsql/bin/psql.exe', import.meta.url).pathname.slice(1);
        const identity = { database: 'task12_reference', branch: null };
        const root = dirname(snapshotFile);
        const dump = join(root, 'fake-dump.mjs');
        const age = join(root, 'fake-age.mjs');
        await writeFile(dump, 'process.stdout.write(Buffer.from([0,1,2,255]));');
        await writeFile(age, "const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); process.stdout.write(Buffer.concat([Buffer.from('age-encryption.org/v1\\n'), ...chunks]));");
        const nodeHash = createHash('sha256');
        for await (const chunk of createReadStream(process.execPath)) nodeHash.update(chunk);
        const toolHash = nodeHash.digest('hex');
        const config = { path: psqlPath, args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1'],
          env: pgEnv, timeoutMs: 30_000 };
        const receipt = await checkpointModule.runTestingCheckpointSession(config, expectedLedger, baseline, canonical,
          identity, async ({ state, checkpoint }, signal) => {
            assert.equal(state, 'repaired');
            const pair = await runTestingEncryptedBackup({
              sourceUrl: 'postgresql://synthetic:synthetic@ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full&sslrootcert=system',
              outputDirectory: root, approvedOutputRoot: root,
              pgDumpPath: process.execPath, pgDumpSha256: toolHash, pgDumpArgsPrefix: [dump],
              agePath: process.execPath, ageSha256: toolHash, ageArgsPrefix: [age],
              recipient: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
              escrowConfirmed: true, timeoutMs: 10_000, snapshotId: checkpoint.snapshot, checkpoint, signal,
            });
            return { manifest: JSON.parse(await readFile(pair.manifestPath, 'utf8')),
              verified: await verifyBackupPair(pair.archivePath, pair.manifestPath) };
          });
        const sql = await readFile(new URL('../../scripts/operations/testing-schema-repair.sql', import.meta.url), 'utf8');
        const outcome = await applyModule.runTestingRepairSession({ psqlPath, pgEnv, expectedLedger },
          receipt.manifest, receipt.verified, baseline, canonical, sql, identity);
        assert.equal(outcome.status, 'TESTING_SCHEMA_ALREADY_REPAIRED');
        const afterNoop = await snapshot();
        assert.equal(catalogSha256(afterNoop.catalog), catalogSha256(current.catalog));
        assert.deepEqual(afterNoop.rows, current.rows);
        process.stdout.write('SYNTHETIC_OPERATIONAL_BACKUP_RECEIPT_APPLY_NOOP\n');
      } else process.stdout.write(mode === 'after' ? 'SYNTHETIC_REPAIR_PRESERVED\n' : 'SYNTHETIC_NOOP_STATE\n');
    }
  }
} finally {
  await db.$disconnect();
}
