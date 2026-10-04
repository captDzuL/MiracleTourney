import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, lstatSync, realpathSync } from 'node:fs';
import { link, open, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { PG18_DLL_SHA256 } from './pg18-dll-hashes.mjs';

const DIRECT_HOST = 'ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech';
const DEFAULT_OUTPUT = 'E:/MiracleBackups';
const AGE_HEADER = Buffer.from('age-encryption.org/v1\n');

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validateSourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw failure('SOURCE_REJECTED'); }
  const params = [...url.searchParams.keys()];
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      url.hostname !== DIRECT_HOST || url.port && url.port !== '5432' ||
      url.pathname !== '/neondb' || !url.username || !url.password ||
      url.searchParams.get('sslmode') !== 'verify-full' ||
      url.searchParams.get('sslrootcert') !== 'system' ||
      params.length !== 2 || new Set(params).size !== 2 ||
      url.hash) throw failure('SOURCE_REJECTED');
  let user;
  let password;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); } catch { throw failure('SOURCE_REJECTED'); }
  if (!user || !password || /[\x00-\x1f\x7f]/.test(user + password)) throw failure('SOURCE_REJECTED');
  const fields = {
    PGHOST: DIRECT_HOST,
    PGPORT: url.port || '5432',
    PGDATABASE: 'neondb',
    PGUSER: user,
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: 'system',
  };
  Object.defineProperty(fields, 'PGPASSWORD', { value: password, enumerable: false });
  return fields;
}

function assertNoLinks(path, code) {
  let cursor = resolve(path);
  for (;;) {
    if (existsSync(cursor)) {
      const entry = lstatSync(cursor);
      if (entry.isSymbolicLink() || !entry.isDirectory() && cursor === resolve(path)) throw failure(code);
      if (realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) throw failure(code);
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export function validateOutputDirectory(value, approvedRoot = DEFAULT_OUTPUT) {
  if (typeof value !== 'string' || typeof approvedRoot !== 'string' ||
      !isAbsolute(value) || !isAbsolute(approvedRoot) ||
      resolve(value).toLowerCase() !== resolve(approvedRoot).toLowerCase() ||
      !existsSync(resolve(value))) throw failure('OUTPUT_REJECTED');
  assertNoLinks(value, 'OUTPUT_REJECTED');
  return resolve(value);
}

async function verifyExecutable(path, expectedSha256) {
  if (typeof path !== 'string' || !isAbsolute(path) ||
      typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedSha256)) throw failure('TOOL_REJECTED');
  try {
    const entry = lstatSync(path);
    if (!entry.isFile() || entry.isSymbolicLink() || realpathSync.native(path).toLowerCase() !== resolve(path).toLowerCase()) throw failure('TOOL_REJECTED');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex').toLowerCase() !== expectedSha256.toLowerCase()) throw failure('TOOL_REJECTED');
  } catch { throw failure('TOOL_REJECTED'); }
}

export async function verifyPostgresDependencySet(directory, expected) {
  try {
    if (!isAbsolute(directory) || !expected || typeof expected !== 'object' || Array.isArray(expected)) throw failure('TOOL_REJECTED');
    assertNoLinks(directory, 'TOOL_REJECTED');
    const required = Object.keys(expected);
    if (required.some(name => !/^[a-z0-9_.-]+\.dll$/i.test(name) || !/^[a-f0-9]{64}$/i.test(expected[name]))) throw failure('TOOL_REJECTED');
    const found = (await readdir(directory)).filter(name => name.toLowerCase().endsWith('.dll'));
    if (found.length !== required.length || found.some(name => !Object.hasOwn(expected, name))) throw failure('TOOL_REJECTED');
    for (const name of required) await verifyExecutable(resolve(directory, name), expected[name]);
  } catch { throw failure('TOOL_REJECTED'); }
}

export async function publishCompleteFile(partialPath, finalPath, cleanupPartial = unlink) {
  try {
    if (!isAbsolute(partialPath) || !isAbsolute(finalPath) || dirname(partialPath) !== dirname(finalPath)) throw failure('BACKUP_FAILED');
    const partial = lstatSync(partialPath);
    if (!partial.isFile() || partial.isSymbolicLink()) throw failure('BACKUP_FAILED');
    await link(partialPath, finalPath);
  } catch (error) {
    throw failure(error?.code === 'EEXIST' ? 'ARCHIVE_COLLISION' : 'BACKUP_FAILED');
  }
  // The final hard link is the publication point. Cleanup failure leaves a
  // complete final file, so report the retained partial without undoing success.
  try { await cleanupPartial(partialPath); return { partialRetained: false }; }
  catch { return { partialRetained: true }; }
}

export async function publishBackupPair(paths, cleanupPartial = unlink) {
  const warnings = [];
  const archive = await publishCompleteFile(paths.archivePartial, paths.archiveFinal, cleanupPartial);
  if (archive.partialRetained) warnings.push('ARCHIVE_PARTIAL_RETAINED');
  const manifest = await publishCompleteFile(paths.manifestPartial, paths.manifestFinal, cleanupPartial);
  if (manifest.partialRetained) warnings.push('MANIFEST_PARTIAL_RETAINED');
  return warnings;
}

function processResult(child) {
  return new Promise(resolve => {
    child.once('error', () => resolve(false));
    child.once('close', code => resolve(code === 0));
  });
}

export async function runEncryptedBackup(config) {
  if (!config?.recipient || !/^age1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(config.recipient) ||
      config.escrowConfirmed !== true) throw failure('KEY_NOT_READY');
  const source = validateSourceUrl(config.sourceUrl);
  const output = validateOutputDirectory(config.outputDirectory, config.approvedOutputRoot);
  await verifyExecutable(config.pgDumpPath, config.pgDumpSha256);
  if (basename(config.pgDumpPath).toLowerCase() === 'pg_dump.exe') {
    await verifyPostgresDependencySet(dirname(config.pgDumpPath), PG18_DLL_SHA256);
  }
  await verifyExecutable(config.agePath, config.ageSha256);
  const timeoutMs = config.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 7_200_000) throw failure('CONFIG_REJECTED');
  if (config.snapshotId !== undefined && !/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/i.test(config.snapshotId)) throw failure('CONFIG_REJECTED');
  const stamp = (config.now instanceof Date ? config.now : new Date()).toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const name = `miracle-neondb-${stamp}`;
  const archivePath = resolve(output, `${name}.age`);
  const manifestPath = resolve(output, `${name}.json`);
  const partialPath = resolve(output, `${name}.partial`);
  const lockPath = resolve(output, '.miracle-local-backup.lock');
  let lock;
  let partial;
  let dump;
  let age;
  let timer;
  let timedOut = false;
  let aborted = false;
  const onAbort = () => { aborted = true; dump?.kill(); age?.kill(); };
  try {
    if (config.signal?.aborted) throw failure('BACKUP_FAILED');
    try { lock = await open(lockPath, 'wx', 0o600); } catch { throw failure('BACKUP_LOCKED'); }
    if (existsSync(archivePath) || existsSync(manifestPath) || existsSync(partialPath)) throw failure('ARCHIVE_COLLISION');
    try { partial = await open(partialPath, 'wx', 0o600); } catch { throw failure('ARCHIVE_COLLISION'); }
    const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_)/i.test(key)));
    Object.assign(safeEnv, source);
    safeEnv.PGPASSWORD = source.PGPASSWORD;
    safeEnv.PGCONNECT_TIMEOUT = '15';
    safeEnv.PGCLIENTENCODING = 'UTF8';
    const startedAt = new Date();
    const dumpArgs = [...(config.pgDumpArgsPrefix || []), ...(config.snapshotId ? [`--snapshot=${config.snapshotId}`] : []), '--format=custom', '--no-owner', '--no-acl'];
    const ageArgs = [...(config.ageArgsPrefix || []), '--encrypt', '--recipient', config.recipient];
    dump = spawn(config.pgDumpPath, dumpArgs, { env: safeEnv, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    age = spawn(config.agePath, ageArgs, { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_)/i.test(key))), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    config.signal?.addEventListener('abort', onAbort, { once: true });
    if (config.signal?.aborted) onAbort();
    timer = setTimeout(() => { timedOut = true; dump.kill(); age.kill(); }, timeoutMs);
    dump.stdout?.on('error', () => {});
    age.stdin?.on('error', () => {});
    age.stdout?.on('error', () => {});
    dump.stdout?.pipe(age.stdin);
    const writer = createWriteStream(partialPath, { fd: partial.fd, autoClose: false });
    age.stdout?.pipe(writer);
    const [dumpOk, ageOk, writerOk] = await Promise.all([
      processResult(dump), processResult(age),
      new Promise(resolve => { writer.once('finish', () => resolve(true)); writer.once('error', () => resolve(false)); }),
    ]);
    clearTimeout(timer);
    if (aborted) throw failure('BACKUP_FAILED');
    if (timedOut) throw failure('BACKUP_TIMEOUT');
    if (!dumpOk) throw failure('DUMP_FAILED');
    if (!ageOk || !writerOk) throw failure('ENCRYPT_FAILED');
    await partial.sync();
    await partial.close();
    partial = null;
    const metadata = await stat(partialPath);
    if (metadata.size === 0) throw failure('EMPTY_ARCHIVE');
    const hash = createHash('sha256');
    let prefix = Buffer.alloc(0);
    for await (const chunk of createReadStream(partialPath)) {
      hash.update(chunk);
      if (prefix.length < AGE_HEADER.length) prefix = Buffer.concat([prefix, chunk.subarray(0, AGE_HEADER.length - prefix.length)]);
    }
    if (!prefix.equals(AGE_HEADER)) throw failure('ARCHIVE_INVALID');
    const sha256 = hash.digest('hex');
    const manifest = {
      format: 'pg_dump-custom+age-v1', source: 'approved-direct-neondb',
      createdAt: startedAt.toISOString(), completedAt: new Date().toISOString(),
      archive: basename(archivePath), bytes: metadata.size, sha256,
    };
    if (config.checkpoint) {
      const cp = config.checkpoint;
      manifest.checkpoint = {
        appliedMigrations: cp.appliedMigrations, ledgerSha256: cp.ledgerSha256,
        schemaSha256: cp.schemaSha256, tableCounts: cp.tableCounts,
        tableChecksumsMd5: cp.tableChecksumsMd5, integrity: cp.integrity,
      };
    }
    const manifestPartial = `${manifestPath}.partial`;
    const handle = await open(manifestPartial, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
    validateOutputDirectory(output, config.approvedOutputRoot);
    if (config.beforePublish) await config.beforePublish();
    if (config.signal?.aborted) throw failure('BACKUP_FAILED');
    const warnings = await publishBackupPair({ archivePartial: partialPath, archiveFinal: archivePath, manifestPartial, manifestFinal: manifestPath });
    return { archivePath, manifestPath, bytes: metadata.size, sha256, warnings };
  } catch (error) {
    if (dump && !dump.killed) dump.kill();
    if (age && !age.killed) age.kill();
    const allowed = new Set(['BACKUP_LOCKED', 'ARCHIVE_COLLISION', 'BACKUP_TIMEOUT', 'DUMP_FAILED', 'ENCRYPT_FAILED', 'EMPTY_ARCHIVE', 'ARCHIVE_INVALID', 'OUTPUT_REJECTED']);
    throw allowed.has(error?.code) ? error : failure('BACKUP_FAILED');
  } finally {
    config.signal?.removeEventListener('abort', onAbort);
    if (timer) clearTimeout(timer);
    if (partial) await partial.close().catch(() => {});
    if (lock) { await lock.close().catch(() => {}); await unlink(lockPath).catch(() => {}); }
  }
}

export async function verifyBackupPair(archivePath, manifestPath) {
  try {
    if (!isAbsolute(archivePath) || !isAbsolute(manifestPath) || dirname(archivePath) !== dirname(manifestPath)) throw failure('ARCHIVE_TAMPERED');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.archive !== basename(archivePath) || !Number.isSafeInteger(manifest.bytes) ||
        manifest.bytes <= 0 || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw failure('ARCHIVE_TAMPERED');
    const metadata = await stat(archivePath);
    if (metadata.size !== manifest.bytes) throw failure('ARCHIVE_TAMPERED');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archivePath)) hash.update(chunk);
    if (hash.digest('hex') !== manifest.sha256) throw failure('ARCHIVE_TAMPERED');
    return { bytes: manifest.bytes, sha256: manifest.sha256 };
  } catch { throw failure('ARCHIVE_TAMPERED'); }
}
