import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertOwnerOnlyDirectory, verifyPinnedFile } from './local-backup-readiness.mjs';

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const caDirectory = join(repository, '.superpowers/sdd/2026-10-04-v3-release-pr-readiness/runtime/ca-trust');
export const PINNED_CA_PATH = join(caDirectory, 'ca-bundle.pem');
const aclScript = fileURLToPath(new URL('./local-backup-ca.ps1', import.meta.url));
const NODE_SHA256 = 'ac51903c4c111815d52280b1fdcc8da067cbb37e2fe1a765097b85c3292c8582';
const CA_SHA256 = '30b7a0242d363aa77faa2b2bb71f802c7890765e3350f8a566c4fccf4b7ad4f2';
const CA_BYTES = 179722;

function reject() { const error = new Error('TOOL_REJECTED'); error.code = 'TOOL_REJECTED'; return error; }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function assertNoReparseOnExistingAncestors(path) {
  let cursor = resolve(path);
  for (;;) {
    if (existsSync(cursor)) {
      const entry = lstatSync(cursor);
      if (entry.isSymbolicLink() || !entry.isDirectory() && cursor === resolve(path) ||
          realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) throw reject();
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

async function pinnedBytes() {
  await verifyPinnedFile(process.execPath, NODE_SHA256);
  if (process.versions.node !== '24.18.1' || tls.rootCertificates.length !== 120) throw reject();
  const bytes = Buffer.from(`${tls.rootCertificates.join('\n')}\n`, 'utf8');
  if (bytes.length !== CA_BYTES || sha256(bytes) !== CA_SHA256) throw reject();
  return bytes;
}

async function protectNewDirectory(directory) {
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', aclScript, '-Directory', directory],
      { timeout: 15000, windowsHide: true, maxBuffer: 1024 });
    if (stdout.trim() !== 'CA_DIRECTORY_PROTECTED') throw reject();
  } catch { throw reject(); }
}

export async function verifyCaBundleAt(directory) {
  try {
    await pinnedBytes();
    assertNoReparseOnExistingAncestors(directory);
    await assertOwnerOnlyDirectory(directory, 'TOOL_REJECTED', ['ca-bundle.pem']);
    const path = join(directory, 'ca-bundle.pem');
    const bytes = await readFile(path);
    if (bytes.length !== CA_BYTES || sha256(bytes) !== CA_SHA256) throw reject();
    return path;
  } catch { throw reject(); }
}

export async function ensureCaBundleAt(directory) {
  try {
    const bytes = await pinnedBytes();
    assertNoReparseOnExistingAncestors(directory);
    await mkdir(dirname(directory), { recursive: true });
    assertNoReparseOnExistingAncestors(directory);
    let created = false;
    try { await mkdir(directory); created = true; }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    if (created) await protectNewDirectory(directory);
    await assertOwnerOnlyDirectory(directory, 'TOOL_REJECTED');
    const path = join(directory, 'ca-bundle.pem');
    try {
      const handle = await open(path, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
    } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    return await verifyCaBundleAt(directory);
  } catch { throw reject(); }
}

export function ensurePinnedCaBundle() { return ensureCaBundleAt(caDirectory); }
export function verifyPinnedCaBundle() { return verifyCaBundleAt(caDirectory); }

export function buildPinnedPgEnv(source) {
  return buildPinnedPgEnvForHost(source, 'ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech');
}

export function buildPinnedTestingPgEnv(source) {
  if (source?.PGCHANNELBINDING !== undefined && source.PGCHANNELBINDING !== 'require') throw reject();
  return buildPinnedPgEnvForHost(source, 'ep-delicate-forest-azuodo4q.c-3.ap-southeast-1.aws.neon.tech');
}

function buildPinnedPgEnvForHost(source, exactHost) {
  if (source?.PGHOST !== exactHost ||
      source.PGPORT !== '5432' || source.PGDATABASE !== 'neondb' ||
      source.PGSSLMODE !== 'verify-full' || source.PGSSLROOTCERT !== 'system' ||
      !source.PGUSER || !source.PGPASSWORD) throw reject();
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_|SSL_CERT_|OPENSSL_)/i.test(name)));
  Object.assign(env, source);
  env.PGPASSWORD = source.PGPASSWORD;
  env.PGSSLROOTCERT = PINNED_CA_PATH;
  env.PGCLIENTENCODING = 'UTF8';
  env.PGCONNECT_TIMEOUT = '15';
  return env;
}
