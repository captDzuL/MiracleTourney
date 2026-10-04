import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadExpectedLedger(root, names) {
  try {
    if (!Array.isArray(names) || names.some(name => !/^\d{14}_[a-z0-9_]+$/.test(name))) throw fail('CHECKPOINT_DRIFT');
    const result = [];
    for (const name of names) {
      const sql = await readFile(join(root, name, 'migration.sql'), 'utf8');
      result.push({ name, sha256: createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex') });
    }
    return result;
  } catch { throw fail('CHECKPOINT_DRIFT'); }
}

function fail(code) { const error = new Error(code); error.code = code; return error; }
const SNAPSHOT_RE = /^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i;

export const LEGACY_MIGRATIONS = Object.freeze([
  '20260812150000_baseline', '20260812160000_multi_organizer', '20260814171500_add_team_logo_url',
  '20260816181154_add_team_captain_relation', '20260816185211_add_password_reset_token',
  '20260816190048_add_user_deactivated_at', '20260817000000_add_player_unique_nickname_per_team',
  '20260817100000_add_match_event_round_slot_unique', '20260820000000_add_player_stat_audit_fields',
  '20260821000000_registration_intake_v2', '20260822000000_event_visual_assets',
  '20260824000000_paid_event_registration', '20260830000000_captain_draft_teams_optional_player_fields',
  '20260831012000_repair_paid_event_schema_drift', '20260831014500_repair_event_visual_asset_schema_drift',
  '20260831031000_repair_paid_registration_tables_drift', '20260903000000_certificate_status_tracking',
]);

export const LEGACY_TABLES = Object.freeze([
  'User', 'Event', 'EventVisualAsset', 'EventStream', 'Team', 'TeamRegistrationRequest',
  'PaymentSettings', 'Player', 'Match', 'EventRoundConfig', 'MatchGame', 'PlayerStat',
  'StatSubmission', 'Certificate', 'PasswordResetToken', 'OrganizerPlan', 'EventPromotion',
  'EventAnalyticsSnapshot', 'Notification', 'CheckIn', 'RegistrationImportProfile',
  'RegistrationImportBatch', 'RegistrationImportItem',
]);

export function buildCheckpointSql() {
  const countPairs = LEGACY_TABLES.map(name => `'${name}', (SELECT count(*)::bigint FROM public."${name}")`).join(',\n      ');
  const checksumPairs = LEGACY_TABLES.map(name => `'${name}', (SELECT md5(coalesce(string_agg(md5(t::text), '' ORDER BY md5(t::text)), '')) FROM public."${name}" t)`).join(',\n      ');
  // The transaction remains open after this final SELECT. The caller sends
  // COMMIT only after the encrypted pair has been published and checked.
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20min';
SELECT 'MIRACLE_CHECKPOINT' || chr(9) || json_build_object(
  'snapshot', pg_export_snapshot(),
  'source', json_build_object('database', current_database(), 'serverVersion', current_setting('server_version_num')::int,
    'ssl', (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid())),
  'ledger', (SELECT coalesce(json_agg(row_to_json(m) ORDER BY m.started_at, m.id), '[]'::json)
    FROM (SELECT migration_name, checksum, finished_at, rolled_back_at, started_at, id FROM public._prisma_migrations) m),
  'schema', (SELECT coalesce(json_agg(row_to_json(c) ORDER BY c.table_name, c.ordinal_position), '[]'::json)
    FROM (SELECT columns.table_name, columns.column_name, columns.data_type, columns.is_nullable, columns.ordinal_position
      FROM information_schema.columns columns JOIN information_schema.tables tables
        ON tables.table_schema = columns.table_schema AND tables.table_name = columns.table_name
      WHERE columns.table_schema = 'public' AND tables.table_type = 'BASE TABLE') c),
  'counts', json_build_object(
      ${countPairs}),
  'checksums', json_build_object(
      ${checksumPairs}),
  'integrity', json_build_object(
    'invalidConstraints', (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND NOT c.convalidated),
    'criticalUniqueIndexes', (
      SELECT count(*) = 4 FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE n.nspname = 'public' AND i.indisunique AND i.indnkeyatts = 1 AND
        ((t.relname = 'User' AND a.attname = 'email') OR
         (t.relname = 'Event' AND a.attname = 'slug') OR
         (t.relname = 'Certificate' AND a.attname = 'eventId') OR
         (t.relname = 'PasswordResetToken' AND a.attname = 'token')))))::text;
`;
}

export async function runSnapshotSession(config, duringSnapshot) {
  if (!config || typeof config.path !== 'string' || !Array.isArray(config.args) ||
      typeof config.sql !== 'string' || !Number.isSafeInteger(config.timeoutMs) ||
      config.timeoutMs < 100 || config.timeoutMs > 7_800_000) throw fail('CHECKPOINT_FAILED');
  let child;
  let timer;
  let settled = false;
  let committing = false;
  const aborter = new AbortController();
  try {
    child = spawn(config.path, config.args, {
      env: config.env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    });
    let rejectEarlyExit;
    const earlyExit = new Promise((_, reject) => { rejectEarlyExit = reject; });
    const closed = new Promise(resolve => {
      child.once('error', () => resolve(false));
      child.once('close', code => {
        resolve(code === 0);
        if (!committing) {
          aborter.abort();
          rejectEarlyExit(fail('CHECKPOINT_FAILED'));
        }
      });
    });
    const checkpointReady = new Promise((resolve, reject) => {
      let buffer = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 262144) { reject(fail('CHECKPOINT_FAILED')); return; }
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const raw of lines) {
          const line = raw.trimEnd();
          if (!line) continue;
          if (!line.startsWith('MIRACLE_CHECKPOINT\t') || settled) { reject(fail('CHECKPOINT_FAILED')); return; }
          settled = true;
          try {
            const parsed = JSON.parse(line.slice('MIRACLE_CHECKPOINT\t'.length));
            if (!SNAPSHOT_RE.test(parsed.snapshot)) throw fail('CHECKPOINT_FAILED');
            resolve(parsed);
          } catch { reject(fail('CHECKPOINT_FAILED')); }
        }
      });
      child.stdout.once('end', () => reject(fail('CHECKPOINT_FAILED')));
      child.stdout.once('error', () => reject(fail('CHECKPOINT_FAILED')));
      child.once('error', () => reject(fail('CHECKPOINT_FAILED')));
    });
    child.stdin.on('error', () => {});
    child.stdin.write(`${config.sql.trimEnd()}\n`);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { aborter.abort(); child.kill(); reject(fail('CHECKPOINT_FAILED')); }, config.timeoutMs);
    });
    const checkpoint = await Promise.race([checkpointReady, earlyExit, timeout]);
    const result = await Promise.race([duringSnapshot(checkpoint, aborter.signal), earlyExit, timeout]);
    committing = true;
    child.stdin.end('COMMIT;\n');
    if (!await Promise.race([closed, timeout])) throw fail('CHECKPOINT_FAILED');
    return result;
  } catch { aborter.abort(); throw fail('CHECKPOINT_FAILED'); }
  finally { if (timer) clearTimeout(timer); if (child && !child.killed) child.kill(); }
}

const CRITICAL_COLUMNS = Object.freeze({
  User: { id: ['text', 'NO'], email: ['text', 'NO'], passwordHash: ['text', 'NO'], deactivatedAt: ['timestamp without time zone', 'YES'] },
  Event: { id: ['text', 'NO'], slug: ['text', 'NO'], organizerUserId: ['text', 'YES'] },
  Certificate: { id: ['text', 'NO'], eventId: ['text', 'NO'], teamId: ['text', 'NO'], status: ['text', 'NO'], attemptCount: ['integer', 'NO'] },
  PasswordResetToken: { id: ['text', 'NO'], userId: ['text', 'NO'], token: ['text', 'NO'], expiresAt: ['timestamp without time zone', 'NO'] },
});

export function validateCheckpoint(checkpoint, expectedLedger, expectedTables = []) {
  try {
    if (!SNAPSHOT_RE.test(checkpoint?.snapshot) || !Array.isArray(checkpoint.ledger) ||
        !Array.isArray(checkpoint.schema) || !checkpoint.counts || typeof checkpoint.counts !== 'object' ||
        checkpoint.integrity?.invalidConstraints !== 0 || !Array.isArray(expectedLedger)) throw fail('CHECKPOINT_DRIFT');
    const applied = new Map();
    for (const row of checkpoint.ledger) {
      const expected = expectedLedger.find(item => item.name === row.migration_name);
      if (!expected || (row.finished_at && row.checksum !== expected.sha256) || (row.finished_at && row.rolled_back_at) ||
          (!row.finished_at && !row.rolled_back_at)) throw fail('CHECKPOINT_DRIFT');
      if (row.finished_at) {
        if (applied.has(row.migration_name)) throw fail('CHECKPOINT_DRIFT');
        applied.set(row.migration_name, row.checksum);
      }
    }
    if (applied.size !== expectedLedger.length || expectedLedger.some(item => applied.get(item.name) !== item.sha256)) throw fail('CHECKPOINT_DRIFT');
    if (expectedTables.length) {
      if (checkpoint.source?.database !== 'neondb' || checkpoint.source.serverVersion < 180000 ||
          checkpoint.source.serverVersion >= 190000 || checkpoint.source.ssl !== true) throw fail('CHECKPOINT_DRIFT');
      if (checkpoint.integrity.criticalUniqueIndexes !== true) throw fail('CHECKPOINT_DRIFT');
      const foundTables = Object.keys(checkpoint.counts).sort();
      if (JSON.stringify(foundTables) !== JSON.stringify([...expectedTables].sort()) ||
          Object.values(checkpoint.counts).some(value => !Number.isSafeInteger(value) || value < 0)) throw fail('CHECKPOINT_DRIFT');
      if (!checkpoint.checksums || JSON.stringify(Object.keys(checkpoint.checksums).sort()) !== JSON.stringify([...expectedTables].sort()) ||
          Object.values(checkpoint.checksums).some(value => !/^[a-f0-9]{32}$/.test(value))) throw fail('CHECKPOINT_DRIFT');
      const physicalTables = [...new Set(checkpoint.schema.map(row => row.table_name))].sort();
      if (JSON.stringify(physicalTables) !== JSON.stringify([...expectedTables, '_prisma_migrations'].sort())) throw fail('CHECKPOINT_DRIFT');
      for (const [table, columns] of Object.entries(CRITICAL_COLUMNS)) {
        for (const [column, [type, nullable]] of Object.entries(columns)) {
          if (!checkpoint.schema.some(row => row.table_name === table && row.column_name === column &&
              row.data_type === type && row.is_nullable === nullable)) throw fail('CHECKPOINT_DRIFT');
        }
      }
    }
    const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return {
      snapshot: checkpoint.snapshot, appliedMigrations: applied.size,
      ledgerSha256: digest(checkpoint.ledger), schemaSha256: digest(checkpoint.schema),
      tableCounts: checkpoint.counts, tableChecksumsMd5: checkpoint.checksums,
      integrity: checkpoint.integrity,
    };
  } catch { throw fail('CHECKPOINT_DRIFT'); }
}
