import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, lstatSync, realpathSync } from 'node:fs';
import { readFile, statfs } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateSourceUrl } from './local-backup-core.mjs';

const run = promisify(execFile);
const DIRECT_HOST = 'ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech';
const aclScript = fileURLToPath(new URL('./local-backup-readiness.ps1', import.meta.url));

export async function assertOutputCapacity(path, minimumBytes = 1_073_741_824n) {
  try {
    if (typeof minimumBytes !== 'bigint' || minimumBytes <= 0n) throw fail('CAPACITY_REJECTED');
    const disk = await statfs(path, { bigint: true });
    if (disk.bavail * disk.bsize < minimumBytes) throw fail('CAPACITY_REJECTED');
  } catch { throw fail('CAPACITY_REJECTED'); }
}

function fail(code) { const error = new Error(code); error.code = code; return error; }

function assertNoReparse(path, code) {
  if (!isAbsolute(path)) throw fail(code);
  let cursor = resolve(path);
  for (;;) {
    const entry = lstatSync(cursor);
    if (entry.isSymbolicLink() || realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) throw fail(code);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export function normalizeProtectedSourceUrl(value) {
  try {
    const url = new URL(value);
    const params = [...url.searchParams.keys()];
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== DIRECT_HOST ||
        url.pathname !== '/neondb' || !url.username || !url.password || url.hash ||
        (url.port && url.port !== '5432') ||
        params.some(key => !['sslmode', 'sslrootcert'].includes(key)) || new Set(params).size !== params.length ||
        !['require', 'verify-full'].includes(url.searchParams.get('sslmode')) ||
        (url.searchParams.has('sslrootcert') && url.searchParams.get('sslrootcert') !== 'system')) throw fail('SOURCE_REJECTED');
    url.searchParams.set('sslmode', 'verify-full');
    url.searchParams.set('sslrootcert', 'system');
    validateSourceUrl(url.href);
    return url.href;
  } catch { throw fail('SOURCE_REJECTED'); }
}

export async function assertRecoveryReady(status, receiptPath, expectedRecipient) {
  try {
    if (status?.status !== 'LOCAL_KEY_PRESENT' || status.recoveryVerified !== true ||
        status.recipient !== expectedRecipient || !/^age1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(expectedRecipient)) throw fail('KEY_NOT_READY');
    assertNoReparse(receiptPath, 'KEY_NOT_READY');
    if (!lstatSync(receiptPath).isFile()) throw fail('KEY_NOT_READY');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    const timestamp = Date.parse(receipt.verifiedAtUtc);
    if (receipt.status !== 'RECOVERY_VERIFIED' || receipt.recipient !== expectedRecipient ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/.test(receipt.verifiedAtUtc) ||
        !Number.isFinite(timestamp) || timestamp > Date.now()) throw fail('KEY_NOT_READY');
  } catch { throw fail('KEY_NOT_READY'); }
}

export async function assertOwnerOnlyDirectory(path, code = 'OUTPUT_REJECTED', requiredNames = []) {
  try {
    assertNoReparse(path, code);
    if (!lstatSync(path).isDirectory()) throw fail(code);
    if (!Array.isArray(requiredNames) || requiredNames.some(name => !/^[a-z0-9_.-]+$/i.test(name))) throw fail(code);
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', aclScript, '-Directory', path, '-RequiredNames', requiredNames.join(',')],
      { timeout: 15000, windowsHide: true, maxBuffer: 1024 });
    if (stdout.trim() !== 'DIRECTORY_SAFE') throw fail(code);
  } catch { throw fail(code); }
}

export async function verifyPinnedFile(path, expectedSha256) {
  try {
    if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) throw fail('TOOL_REJECTED');
    assertNoReparse(path, 'TOOL_REJECTED');
    if (!lstatSync(path).isFile()) throw fail('TOOL_REJECTED');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== expectedSha256.toLowerCase()) throw fail('TOOL_REJECTED');
  } catch { throw fail('TOOL_REJECTED'); }
}
