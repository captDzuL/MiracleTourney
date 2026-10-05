import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import { assertLocalTarget, assertFreshRehearsalPath, compareRestoredCheckpoint, inspectMigrationLedger, assessCandidate } from './local-rehearsal-core.mjs';
import { assertOutputCapacity, assertOwnerOnlyDirectory, verifyPinnedFile } from './local-backup-readiness.mjs';
import { verifyBackupPair, verifyPostgresDependencySet } from './local-backup-core.mjs';
import { loadExpectedLedger, LEGACY_TABLES, buildCriticalUniqueIndexSql } from './local-backup-snapshot.mjs';
import { PG18_DLL_SHA256 } from './pg18-dll-hashes.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '../..');
const outputRoot = resolve('E:/MiracleBackups');
const keyRoot = resolve('E:/MiracleBackupKeys');
const oldRuntime = resolve(projectRoot, '.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime');
const zipPath = join(oldRuntime, 'postgresql-18.6-windows-x64-binaries.zip');
const archiveVerifier = join(scriptDir, 'local-backup-verify.mjs');
const hostScript = join(scriptDir, 'local-rehearsal-host.ps1');
const restoreScript = join(scriptDir, 'local-rehearsal-restore.ps1');
const powershell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const PG_ZIP_HASH = 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2';
const PG_ZIP_BYTES = 384620317;
const APPROVED_ARCHIVE = 'miracle-neondb-2026-10-05T01-23-48-741Z.age';
const APPROVED_ARCHIVE_SHA256 = 'dc30ddf3ae4bb98dacd9d68e293b26cef5a3818664364c405c01d578cf1d7f5b';
const MIGRATION_NAME = /^(?:\d{12}|\d{14})_[a-z0-9_]+$/;

function fail(code) { const error = new Error(code); error.code = code; return error; }
const stamp = () => new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const sqlQuote = value => `'${value.replaceAll("'", "''")}'`;
const localUrl = (db, password) => `postgresql://rehearsal_owner:${encodeURIComponent(password)}@127.0.0.1:55438/${db}?schema=public&sslmode=disable`;

export function buildLocalPgEnv(database, password, inherited = process.env) {
  assertLocalTarget({ host: '127.0.0.1', port: 55438, database });
  if (typeof password !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(password)) throw fail('CONFIG_REJECTED');
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (inherited[key]) env[key] = inherited[key];
  }
  return { ...env, PGHOST: '127.0.0.1', PGPORT: '55438', PGDATABASE: database,
    PGUSER: 'rehearsal_owner', PGPASSWORD: password, PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '10', PGCLIENTENCODING: 'UTF8', PGTZ: 'UTC',
    DATABASE_URL: localUrl(database, password), DIRECT_URL: localUrl(database, password) };
}

function bootstrapEnv(password) {
  const env = buildLocalPgEnv('recovery_baseline', password);
  env.PGDATABASE = 'postgres';
  env.PGUSER = 'rehearsal_bootstrap';
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  return env;
}

export function buildRestoreCheckpointSql() {
  const counts = LEGACY_TABLES.map(table => `'${table}', (SELECT count(*)::bigint FROM public."${table}")`).join(',\n');
  const checksums = LEGACY_TABLES.map(table => `'${table}', (SELECT md5(coalesce(string_agg(md5(t::text), '' ORDER BY md5(t::text)), '')) FROM public."${table}" t)`).join(',\n');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL TIME ZONE 'UTC';\n` +
    `SELECT 'MIRACLE_LOCAL_CHECKPOINT' || chr(9) || json_build_object(\n` +
    `  'ledger', (SELECT coalesce(json_agg(row_to_json(m) ORDER BY m.started_at, m.id), '[]'::json)\n` +
    `    FROM (SELECT migration_name, checksum, finished_at, rolled_back_at, started_at, id FROM public._prisma_migrations) m),\n` +
    `  'schema', (SELECT coalesce(json_agg(row_to_json(c) ORDER BY c.table_name, c.ordinal_position), '[]'::json)\n` +
    `    FROM (SELECT columns.table_name, columns.column_name, columns.data_type, columns.is_nullable, columns.ordinal_position\n` +
    `      FROM information_schema.columns columns JOIN information_schema.tables tables\n` +
    `        ON tables.table_schema = columns.table_schema AND tables.table_name = columns.table_name\n` +
    `      WHERE columns.table_schema = 'public' AND tables.table_type = 'BASE TABLE') c),\n` +
    `  'counts', json_build_object(${counts}),\n` +
    `  'checksums', json_build_object(${checksums}),\n` +
    `  'integrity', json_build_object(\n` +
    `    'invalidConstraints', (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace\n` +
    `      WHERE n.nspname = 'public' AND NOT c.convalidated),\n` +
    `    'criticalUniqueIndexes', (${buildCriticalUniqueIndexSql()})))::text;\nCOMMIT;\n`;
}

export function parsePrivateJson(value) {
  try {
    if (typeof value !== 'string' || value.length > 262144) throw fail('QUERY_FAILED');
    const parsed = JSON.parse(value.trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail('QUERY_FAILED');
    return parsed;
  } catch { throw fail('QUERY_FAILED'); }
}

async function runChild(path, args, { env, cwd, input = '', timeoutMs = 120000, maxOutput = 262144,
  captureOutput = true } = {}) {
  let child;
  let timer;
  try {
    child = spawn(path, args, { env, cwd,
      stdio: [captureOutput ? 'pipe' : 'ignore', captureOutput ? 'pipe' : 'ignore', 'ignore'], windowsHide: true });
    let stdout = '';
    if (captureOutput) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > maxOutput) child.kill(); });
    }
    if (child.stdin) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    const completion = new Promise((resolve, reject) => {
      child.once('error', () => reject(fail('CHILD_FAILED')));
      child.once('close', code => resolve(code));
    });
    const started = performance.now();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { child.kill(); reject(fail('CHILD_TIMEOUT')); }, timeoutMs);
    });
    const exit = await Promise.race([completion, timeout]);
    if (exit !== 0 || stdout.length > maxOutput) throw fail('CHILD_FAILED');
    return { stdout, exit, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    throw ['CHILD_TIMEOUT', 'CHILD_FAILED'].includes(error?.code) ? error : fail('CHILD_FAILED');
  } finally { if (timer) clearTimeout(timer); if (child && !child.killed) child.kill(); }
}

export const runRedactedChild = runChild;

export function buildPgCtlInvocation(action, data, runRoot, env) {
  if (action !== 'start' && action !== 'stop') throw fail('CONFIG_REJECTED');
  const args = action === 'start'
    ? ['-D', data, '-l', join(runRoot, 'server.log'), '-w', '-t', '60', 'start']
    : ['-D', data, '-m', 'fast', '-w', '-t', '60', 'stop'];
  return { path: join(runRoot, 'server', 'pgsql', 'bin', 'pg_ctl.exe'), args,
    options: { env, timeoutMs: 90000, captureOutput: false } };
}

async function runPsql(bin, database, password, sql, { bootstrap = false } = {}) {
  const env = bootstrap ? bootstrapEnv(password) : buildLocalPgEnv(database, password);
  if (bootstrap) env.PGDATABASE = database;
  return runChild(join(bin, 'psql.exe'), ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1',
    '--host=127.0.0.1', '--port=55438', `--username=${env.PGUSER}`, `--dbname=${database}`],
  { env, input: `${sql.trimEnd()}\n`, timeoutMs: 120000 });
}

async function queryJson(bin, database, password, sql) {
  const { stdout } = await runPsql(bin, database, password, sql);
  const line = stdout.trim().split(/\r?\n/).find(row => row.startsWith('MIRACLE_LOCAL_CHECKPOINT\t'));
  if (!line) throw fail('QUERY_FAILED');
  return parsePrivateJson(line.slice('MIRACLE_LOCAL_CHECKPOINT\t'.length));
}

async function portFree() {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port: 55438 });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => { socket.destroy(); resolve(error?.code === 'ECONNREFUSED'); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function readMigrationNames() {
  const { readdir } = await import('node:fs/promises');
  const root = join(projectRoot, 'prisma/migrations');
  const names = (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory() && MIGRATION_NAME.test(item.name))
    .map(item => item.name).sort();
  if (!names.length || names[0] !== '20260812150000_baseline') throw fail('MIGRATION_DRIFT');
  const standard = await loadExpectedLedger(root, names.filter(name => /^\d{14}_/.test(name)));
  const short = [];
  for (const name of names.filter(name => /^\d{12}_/.test(name))) {
    const sql = await readFile(join(root, name, 'migration.sql'), 'utf8');
    const lf = sql.replaceAll('\r\n', '\n');
    short.push({ name, sha256: createHash('sha256').update(lf).digest('hex'),
      sha256Crlf: createHash('sha256').update(lf.replaceAll('\n', '\r\n')).digest('hex') });
  }
  const byName = new Map([...standard, ...short].map(item => [item.name, item]));
  if (byName.size !== names.length) throw fail('MIGRATION_DRIFT');
  return { names, expected: names.map(name => byName.get(name)) };
}

function ledgerSql() {
  return `SELECT 'MIRACLE_LOCAL_CHECKPOINT' || chr(9) || json_build_object(\n` +
    `  'ledger', (SELECT coalesce(json_agg(row_to_json(m) ORDER BY m.started_at, m.id), '[]'::json)\n` +
    `    FROM (SELECT migration_name, checksum, finished_at, rolled_back_at, started_at, id FROM public._prisma_migrations) m))::text;`;
}

export function buildCandidatePostcheckSql() {
  const index = (table, name, columns) => `EXISTS (SELECT 1 FROM pg_index i\n` +
    `    JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_namespace idx_ns ON idx_ns.oid=idx.relnamespace\n` +
    `    JOIN pg_class tbl ON tbl.oid=i.indrelid JOIN pg_namespace tbl_ns ON tbl_ns.oid=tbl.relnamespace\n` +
    `    JOIN pg_am am ON am.oid=idx.relam\n` +
    `    WHERE idx_ns.nspname='public' AND idx.relname='${name}' AND idx.relkind='i'\n` +
    `      AND tbl_ns.nspname='public' AND tbl.relname='${table}' AND am.amname='btree'\n` +
    `      AND i.indisunique AND i.indimmediate AND i.indisvalid AND i.indisready AND i.indislive\n` +
    `      AND NOT i.indisprimary AND NOT i.indisexclusion AND NOT i.indnullsnotdistinct\n` +
    `      AND i.indpred IS NULL AND i.indexprs IS NULL\n` +
    `      AND i.indnkeyatts=${columns.length} AND i.indnatts=${columns.length}\n` +
    `      AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)\n` +
    `           FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ordinality)\n` +
    `           JOIN pg_attribute a ON a.attrelid=tbl.oid AND a.attnum=k.attnum)\n` +
    `          = ARRAY[${columns.map(sqlQuote).join(',')}]::text[])`;
  const column = (table, name, nullable, exactDefault) =>
    `EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'\n` +
    `    AND column_name='${name}' AND is_nullable='${nullable}'${exactDefault === undefined ? '' : ` AND column_default=${sqlQuote(exactDefault)}`})`;
  return `SELECT 'MIRACLE_LOCAL_CHECKPOINT' || chr(9) || json_build_object(\n` +
    ` 'certificateMissing', (SELECT count(*)::int FROM public."Certificate" WHERE "recipientId" IS NULL OR "recipientName" IS NULL OR "verificationCode" IS NULL),\n` +
    ` 'certificateDuplicateCodes', (SELECT count(*)::int FROM (SELECT "verificationCode" FROM public."Certificate" GROUP BY "verificationCode" HAVING count(*) > 1) x),\n` +
    ` 'certificateConstraints', (${column('Certificate', 'recipientId', 'NO')} AND ${column('Certificate', 'recipientName', 'NO')} AND ${column('Certificate', 'verificationCode', 'NO')} AND ${index('Certificate', 'Certificate_verificationCode_key', ['verificationCode'])} AND ${index('Certificate', 'Certificate_eventId_type_recipientKind_recipientId_version_key', ['eventId', 'type', 'recipientKind', 'recipientId', 'version'])}),\n` +
    ` 'sessionVersion', (${column('User', 'sessionVersion', 'NO', '0')}),\n` +
    ` 'resetTokenUnique', (${column('PasswordResetToken', 'tokenFormat', 'NO', "'legacy_raw'::text")} AND ${index('PasswordResetToken', 'PasswordResetToken_userId_key', ['userId'])}),\n` +
    ` 'rateLimitBucket', (to_regclass('public."RateLimitBucket"') IS NOT NULL AND ${index('RateLimitBucket', 'RateLimitBucket_key_key', ['key'])}),\n` +
    ` 'invalidConstraints', (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated))::text;`;
}

function localeAndExtensionSql() {
  return `SELECT 'MIRACLE_LOCAL_CHECKPOINT' || chr(9) || json_build_object(\n` +
    ` 'serverVersion', current_setting('server_version'),\n` +
    ` 'encoding', current_setting('server_encoding'),\n` +
    ` 'lcCollate', (SELECT datcollate FROM pg_database WHERE datname=current_database()),\n` +
    ` 'lcCtype', (SELECT datctype FROM pg_database WHERE datname=current_database()),\n` +
    ` 'collationVersion', (SELECT datcollversion FROM pg_database WHERE datname=current_database()),\n` +
    ` 'extensions', (SELECT coalesce(json_agg(json_build_object('name', extname, 'version', extversion) ORDER BY extname), '[]'::json) FROM pg_extension))::text;`;
}

export function buildSyntheticFlowSql(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) throw fail('CONFIG_REJECTED');
  const id = `rehearsal_${token}`;
  const q = value => sqlQuote(`${id}_${value}`);
  return `BEGIN;\nSET LOCAL statement_timeout='30s';\n` +
    `INSERT INTO public."User" ("id","email","name","role","passwordHash","createdAt","updatedAt")\n` +
    ` VALUES (${q('user')},${q('user@example.invalid')},'Synthetic User','USER','synthetic-hash',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n` +
    `INSERT INTO public."Event" ("id","slug","name","description","gameId","gameModeId","format","status",\n` +
    ` "participantCap","registrationWindow","startsAt","venue","createdAt","updatedAt")\n` +
    ` VALUES (${q('event')},${q('slug')},'Synthetic Event','Local fixture','game','mode','single_elimination',\n` +
    ` 'draft',8,'closed','later','local',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n` +
    `INSERT INTO public."Team" ("id","eventId","name","logoText","tag","createdAt")\n` +
    ` VALUES (${q('team')},${q('event')},'Synthetic Team','ST','ST',CURRENT_TIMESTAMP);\n` +
    `DO $$ BEGIN\n` +
    ` IF (SELECT "sessionVersion" FROM public."User" WHERE "id"=${q('user')}) <> 0 THEN RAISE EXCEPTION 'session default'; END IF;\n` +
    ` UPDATE public."User" SET "sessionVersion"="sessionVersion"+1 WHERE "id"=${q('user')};\n` +
    ` IF (SELECT "sessionVersion" FROM public."User" WHERE "id"=${q('user')}) <> 1 THEN RAISE EXCEPTION 'session increment'; END IF;\n` +
    `END $$;\n` +
    `INSERT INTO public."PasswordResetToken" ("id","userId","token","tokenFormat","expiresAt","createdAt")\n` +
    ` VALUES (${q('reset1')},${q('user')},${q('digest1')},'sha256',CURRENT_TIMESTAMP+INTERVAL '30 minutes',CURRENT_TIMESTAMP);\n` +
    `DO $$ BEGIN\n` +
    ` BEGIN\n` +
    `  INSERT INTO public."PasswordResetToken" ("id","userId","token","tokenFormat","expiresAt","createdAt")\n` +
    `   VALUES (${q('reset2')},${q('user')},${q('digest2')},'sha256',CURRENT_TIMESTAMP+INTERVAL '30 minutes',CURRENT_TIMESTAMP);\n` +
    `  RAISE EXCEPTION 'reset user uniqueness absent';\n` +
    ` EXCEPTION WHEN unique_violation THEN NULL; END;\n` +
    ` UPDATE public."PasswordResetToken" SET "usedAt"=CURRENT_TIMESTAMP WHERE "id"=${q('reset1')};\n` +
    ` IF NOT EXISTS (SELECT 1 FROM public."PasswordResetToken" WHERE "id"=${q('reset1')} AND "tokenFormat"='sha256' AND "usedAt" IS NOT NULL)\n` +
    ` THEN RAISE EXCEPTION 'reset consumption'; END IF;\n` +
    `END $$;\n` +
    `INSERT INTO public."Certificate" ("id","eventId","teamId","type","recipientKind","recipientId",\n` +
    ` "recipientName","version","verificationCode","imageUrl","status","attemptCount","createdAt","updatedAt")\n` +
    ` VALUES (${q('cert1')},${q('event')},${q('team')},'champion','team',${q('team')},'Synthetic Team',1,\n` +
    ` ${q('verification')},'','ready',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n` +
    `DO $$ BEGIN\n` +
    ` BEGIN\n` +
    `  INSERT INTO public."Certificate" ("id","eventId","teamId","type","recipientKind","recipientId",\n` +
    `   "recipientName","version","verificationCode","imageUrl","status","attemptCount","createdAt","updatedAt")\n` +
    `   VALUES (${q('cert2')},${q('event')},${q('team')},'champion','team',${q('team')},'Synthetic Team',2,\n` +
    `   ${q('verification')},'','ready',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n` +
    `  RAISE EXCEPTION 'certificate verification uniqueness absent';\n` +
    ` EXCEPTION WHEN unique_violation THEN NULL; END;\n` +
    ` BEGIN\n` +
    `  INSERT INTO public."Certificate" ("id","eventId","teamId","type","recipientKind","recipientId",\n` +
    `   "recipientName","version","verificationCode","imageUrl","status","attemptCount","createdAt","updatedAt")\n` +
    `   VALUES (${q('cert3')},${q('event')},${q('team')},'champion','team',${q('team')},'Synthetic Team',1,\n` +
    `   ${q('verification2')},'','ready',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n` +
    `  RAISE EXCEPTION 'certificate recipient uniqueness absent';\n` +
    ` EXCEPTION WHEN unique_violation THEN NULL; END;\n` +
    `END $$;\n` +
    `INSERT INTO public."RateLimitBucket" ("id", "key", "count", "resetAt")\n` +
    ` VALUES (${q('bucket1')},${q('bucket')},1,CURRENT_TIMESTAMP+INTERVAL '1 minute');\n` +
    `DO $$ BEGIN\n` +
    ` BEGIN\n` +
    `  INSERT INTO public."RateLimitBucket" ("id", "key", "count", "resetAt")\n` +
    `   VALUES (${q('bucket2')},${q('bucket')},1,CURRENT_TIMESTAMP+INTERVAL '1 minute');\n` +
    `  RAISE EXCEPTION 'rate limit uniqueness absent';\n` +
    ` EXCEPTION WHEN unique_violation THEN NULL; END;\n` +
    `END $$;\n` +
    `SELECT 'MIRACLE_LOCAL_CHECKPOINT' || chr(9) || json_build_object(\n` +
    ` 'certificateUnique', true, 'sessionIncrement', true, 'resetOnePerUser', true,\n` +
    ` 'resetConsumed', true, 'rateLimitUnique', true)::text;\nROLLBACK;`;
}

async function syntheticFlow(bin, password) {
  const sql = buildSyntheticFlowSql(randomBytes(16).toString('hex'));
  const { stdout } = await runPsql(bin, 'migration_candidate', password, sql);
  const line = stdout.trim().split(/\r?\n/).find(row => row.startsWith('MIRACLE_LOCAL_CHECKPOINT\t'));
  const result = parsePrivateJson(line?.slice('MIRACLE_LOCAL_CHECKPOINT\t'.length));
  if (Object.values(result).some(value => value !== true) || Object.keys(result).length !== 5) throw fail('FLOW_FAILED');
  return { ...result, writes: 'ROLLED_BACK' };
}

async function verifyAuth(bin, bootstrapPassword) {
  try {
    await runPsql(bin, 'postgres', 'incorrect-local-password', 'SELECT 1;', { bootstrap: true });
    throw fail('AUTH_REJECTED');
  } catch (error) { if (error?.code === 'AUTH_REJECTED') throw error; }
  const result = await runPsql(bin, 'postgres', bootstrapPassword,
    `SELECT 'MIRACLE_LOCAL_CHECKPOINT' || chr(9) || json_build_object('listen', current_setting('listen_addresses'),\n` +
    `  'port', current_setting('port'), 'passwordEncryption', current_setting('password_encryption'))::text;`, { bootstrap: true });
  const line = result.stdout.trim().split(/\r?\n/).find(row => row.startsWith('MIRACLE_LOCAL_CHECKPOINT\t'));
  const settings = parsePrivateJson(line?.slice('MIRACLE_LOCAL_CHECKPOINT\t'.length));
  if (settings.listen !== '127.0.0.1' || settings.port !== '55438' || settings.passwordEncryption !== 'scram-sha-256') throw fail('AUTH_REJECTED');
}

async function prepareCluster(runRoot, zip, bootstrapPassword, ownerPassword) {
  const hostResult = await runChild(powershell, ['-NoProfile', '-NonInteractive', '-File', hostScript,
    '-RunName', basename(runRoot), '-ZipPath', zip], { timeoutMs: 300000, maxOutput: 1024 });
  if (hostResult.stdout.trim() !== 'REHEARSAL_DIRECTORY_READY') throw fail('RUNTIME_REJECTED');
  await assertOwnerOnlyDirectory(runRoot);
  const bin = join(runRoot, 'server', 'pgsql', 'bin');
  for (const executable of ['initdb.exe', 'pg_ctl.exe', 'postgres.exe', 'psql.exe']) {
    if (!existsSync(join(bin, executable))) throw fail('RUNTIME_REJECTED');
  }
  for (const [dll, hash] of Object.entries(PG18_DLL_SHA256)) await verifyPinnedFile(join(bin, dll), hash);
  for (const executable of ['initdb.exe', 'pg_ctl.exe', 'postgres.exe', 'psql.exe']) {
    const version = await runChild(join(bin, executable), ['--version'], { timeoutMs: 15000, maxOutput: 1024 });
    if (!/\b18\.6\b/.test(version.stdout)) throw fail('RUNTIME_REJECTED');
  }
  const data = join(runRoot, 'cluster');
  const pwfile = join(runRoot, 'initdb-password.txt');
  await writeFile(pwfile, `${bootstrapPassword}\n`, { flag: 'wx', mode: 0o600 });
  try {
    await assertOwnerOnlyDirectory(runRoot, 'RUNTIME_REJECTED', ['initdb-password.txt']);
    await runChild(join(bin, 'initdb.exe'), ['-D', data, '-U', 'rehearsal_bootstrap', '--auth-host=scram-sha-256',
      '--auth-local=reject', `--pwfile=${pwfile}`, '--encoding=UTF8', '--no-instructions'],
    { env: bootstrapEnv(bootstrapPassword), timeoutMs: 300000, maxOutput: 4096 });
  } finally { await unlink(pwfile).catch(() => {}); }
  await appendFile(join(data, 'postgresql.conf'), `\nlisten_addresses = '127.0.0.1'\nport = 55438\n` +
    `password_encryption = 'scram-sha-256'\ntimezone = 'UTC'\nlog_statement = 'none'\n` +
    `log_min_error_statement = 'panic'\nlog_min_messages = 'fatal'\nlogging_collector = off\n` +
    `log_connections = off\nlog_disconnections = off\n`);
  await writeFile(join(data, 'pg_hba.conf'),
    `host all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 reject\nlocal all all reject\n`, { flag: 'w' });
  if (!await portFree()) throw fail('PORT_OCCUPIED');
  const start = buildPgCtlInvocation('start', data, runRoot, bootstrapEnv(bootstrapPassword));
  await runChild(start.path, start.args, start.options);
  await verifyAuth(bin, bootstrapPassword);
  await runPsql(bin, 'postgres', bootstrapPassword,
    `CREATE ROLE rehearsal_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${sqlQuote(ownerPassword)};`,
    { bootstrap: true });
  for (const database of ['recovery_baseline', 'migration_candidate']) {
    await runPsql(bin, 'postgres', bootstrapPassword,
      `CREATE DATABASE ${database} OWNER rehearsal_owner TEMPLATE template0 ENCODING 'UTF8';`, { bootstrap: true });
    await runPsql(bin, database, ownerPassword, 'SELECT 1;');
  }
  return { bin, data };
}

async function stopCluster(runRoot) {
  const bin = join(runRoot, 'server', 'pgsql', 'bin');
  const data = join(runRoot, 'cluster');
  if (!existsSync(join(bin, 'pg_ctl.exe')) || !existsSync(data)) return { status: 'NOT_STARTED' };
  try {
    const stop = buildPgCtlInvocation('stop', data, runRoot,
      buildLocalPgEnv('recovery_baseline', 'local-only-password-0000000000000000'));
    await runChild(stop.path, stop.args, stop.options);
    return { status: 'STOPPED' };
  } catch { return { status: 'STOP_UNVERIFIED' }; }
}

async function restoreArchive(archive, database, password) {
  const result = await runChild(powershell, ['-NoProfile', '-NonInteractive', '-File', restoreScript,
    '-ArchivePath', archive, '-Database', database],
  { env: buildLocalPgEnv(database, password), timeoutMs: 7200000, maxOutput: 1024 });
  const parsed = parsePrivateJson(result.stdout);
  if (parsed.status !== 'RESTORED' || parsed.database !== database || parsed.ageExit !== 0 || parsed.restoreExit !== 0 ||
      !Number.isSafeInteger(parsed.durationMs)) throw fail('RESTORE_FAILED');
  return parsed;
}

async function stageMigrations(runRoot, names) {
  const target = join(runRoot, 'prisma');
  await mkdir(join(target, 'migrations'), { recursive: true });
  await writeFile(join(target, 'schema.prisma'), await readFile(join(projectRoot, 'prisma', 'schema.prisma')),
    { flag: 'wx', mode: 0o600 });
  await writeFile(join(target, 'migrations', 'migration_lock.toml'),
    await readFile(join(projectRoot, 'prisma', 'migrations', 'migration_lock.toml')),
    { flag: 'wx', mode: 0o600 });
  for (const name of names) {
    const directory = join(target, 'migrations', name);
    await mkdir(directory);
    await writeFile(join(directory, 'migration.sql'),
      await readFile(join(projectRoot, 'prisma', 'migrations', name, 'migration.sql')),
      { flag: 'wx', mode: 0o600 });
  }
  return join(target, 'schema.prisma');
}

async function migrate(password, runRoot, schema) {
  const prisma = join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');
  if (!existsSync(prisma)) throw fail('MIGRATION_FAILED');
  const env = buildLocalPgEnv('migration_candidate', password);
  const result = await runChild(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema],
    { env, cwd: runRoot, timeoutMs: 7200000, maxOutput: 262144 });
  return { exit: result.exit, durationMs: result.durationMs };
}

export async function runRehearsal(archive) {
  if (typeof archive !== 'string' || dirname(resolve(archive)).toLowerCase() !== outputRoot.toLowerCase() ||
      basename(archive) !== APPROVED_ARCHIVE) throw fail('ARCHIVE_REJECTED');
  await assertOwnerOnlyDirectory(outputRoot);
  await assertOwnerOnlyDirectory(keyRoot, 'KEY_NOT_READY', ['identity.dpapi', 'recipient.txt', 'recovery-verified.json']);
  await assertOutputCapacity(outputRoot, 3_221_225_472n);
  await verifyPinnedFile(zipPath, PG_ZIP_HASH);
  if ((await stat(zipPath)).size !== PG_ZIP_BYTES) throw fail('RUNTIME_REJECTED');
  await verifyPostgresDependencySet(join(oldRuntime, 'pg18', 'bin'), PG18_DLL_SHA256);
  const pair = await verifyBackupPair(archive, archive.slice(0, -4) + '.json');
  if (pair.sha256 !== APPROVED_ARCHIVE_SHA256 || pair.bytes !== 175055) throw fail('ARCHIVE_REJECTED');
  const manifest = parsePrivateJson(await readFile(archive.slice(0, -4) + '.json', 'utf8'));
  if (!manifest.checkpoint || !manifest.checkpoint.ledgerSha256 || !manifest.checkpoint.schemaSha256) throw fail('CHECKPOINT_DRIFT');
  const authenticated = await runChild(process.execPath, [archiveVerifier, archive], { timeoutMs: 7200000, maxOutput: 1024 });
  const authentication = parsePrivateJson(authenticated.stdout);
  if (authentication.status !== 'ARCHIVE_VERIFIED' || authentication.bytes !== pair.bytes || authentication.sha256 !== pair.sha256) throw fail('ARCHIVE_REJECTED');
  const { names, expected } = await readMigrationNames();
  const runRoot = join(outputRoot, `rehearsal-${stamp()}`);
  await assertFreshRehearsalPath(runRoot, outputRoot);
  const bootstrapPassword = randomBytes(32).toString('base64url');
  const ownerPassword = randomBytes(32).toString('base64url');
  let cluster;
  let result;
  let failure;
  let phase = 'RUNTIME';
  let stop = { status: 'NOT_STARTED' };
  try {
    cluster = await prepareCluster(runRoot, zipPath, bootstrapPassword, ownerPassword);
    const stagedSchema = await stageMigrations(runRoot, names);
    phase = 'RESTORE';
    const restores = [];
    const localEnvironments = [];
    for (const database of ['recovery_baseline', 'migration_candidate']) {
      const restored = await restoreArchive(archive, database, ownerPassword);
      const checkpoint = await queryJson(cluster.bin, database, ownerPassword, buildRestoreCheckpointSql());
      const verified = compareRestoredCheckpoint(checkpoint, manifest.checkpoint, expected);
      localEnvironments.push({ database, ...(await queryJson(cluster.bin, database, ownerPassword, localeAndExtensionSql())) });
      restores.push({ database, ageExit: restored.ageExit, restoreExit: restored.restoreExit,
        durationMs: restored.durationMs, ...verified });
    }
    phase = 'MIGRATION';
    const beforeLedger = (await queryJson(cluster.bin, 'migration_candidate', ownerPassword, ledgerSql())).ledger;
    const before = inspectMigrationLedger(beforeLedger, expected);
    if (before.applied !== manifest.checkpoint.appliedMigrations || before.pending === 0) throw fail('MIGRATION_DRIFT');
    const migration = await migrate(ownerPassword, runRoot, stagedSchema);
    const afterLedger = (await queryJson(cluster.bin, 'migration_candidate', ownerPassword, ledgerSql())).ledger;
    const after = inspectMigrationLedger(afterLedger, expected);
    const postchecks = await queryJson(cluster.bin, 'migration_candidate', ownerPassword, buildCandidatePostcheckSql());
    assessCandidate({ ...postchecks, migration: after });
    const flow = await syntheticFlow(cluster.bin, ownerPassword);
    phase = 'NOOP';
    const second = await migrate(ownerPassword, runRoot, stagedSchema);
    const noopLedger = (await queryJson(cluster.bin, 'migration_candidate', ownerPassword, ledgerSql())).ledger;
    const noop = inspectMigrationLedger(noopLedger, expected);
    if (noop.pending !== 0 || JSON.stringify(noopLedger) !== JSON.stringify(afterLedger)) throw fail('NOOP_FAILED');
    result = { status: 'REHEARSAL_VERIFIED', runRoot, archiveSha256: pair.sha256,
      restores, migrations: { before, after, first: migration, second, noop },
      postchecks, syntheticFlow: flow, localEnvironments,
      limitations: ['LOCAL_RESTORE_NOT_SERVICE_RTO', 'SOURCE_LOCALE_EXTENSION_EQUIVALENCE_NOT_PROVEN',
        'SYNTHETIC_FLOW_LIMITED_TO_LOCAL_RATE_LIMIT_CONSTRAINT'] };
  } catch (error) {
    failure = error;
  } finally {
    if (existsSync(runRoot)) {
      stop = await stopCluster(runRoot);
      const evidence = result && stop.status === 'STOPPED' ? { ...result, cluster: stop } :
        { status: 'REHEARSAL_FAILED', phase, cluster: stop,
          code: failure?.code || (stop.status !== 'STOPPED' ? 'STOP_UNVERIFIED' : 'REHEARSAL_FAILED'),
          archiveSha256: pair.sha256, runRoot };
      await writeFile(join(runRoot, 'rehearsal-result.json'), `${JSON.stringify(evidence, null, 2)}\n`,
        { flag: 'wx', mode: 0o600 }).catch(() => { if (!failure) failure = fail('EVIDENCE_FAILED'); });
    }
  }
  if (failure) throw failure;
  if (stop.status !== 'STOPPED') throw fail('STOP_UNVERIFIED');
  result.cluster = stop;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) { process.stderr.write('REHEARSAL_REJECTED\n'); process.exitCode = 1; }
  else runRehearsal(process.argv[2]).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    const safe = new Set(['ARCHIVE_REJECTED', 'RUNTIME_REJECTED', 'CHECKPOINT_DRIFT', 'MIGRATION_DRIFT',
      'RESTORE_FAILED', 'PORT_OCCUPIED', 'AUTH_REJECTED', 'POSTCHECK_FAILED', 'NOOP_FAILED', 'STOP_UNVERIFIED']);
    process.stderr.write(`${safe.has(error?.code) ? error.code : 'REHEARSAL_FAILED'}\n`);
    process.exitCode = 1;
  });
}
