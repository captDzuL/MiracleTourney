import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRecoveryReady, assertOwnerOnlyDirectory, assertOutputCapacity, normalizeProtectedSourceUrl, verifyPinnedFile } from '../../scripts/operations/local-backup-readiness.mjs';

const recipient = 'age1gy00y8k4wct4gap558p3k4h8ppecp86pxr9xnyz0mjajwkhw5ewsjlg8s8';
const status = { status: 'LOCAL_KEY_PRESENT', recipient, recoveryVerified: true };
const source = 'postgresql://backup:synthetic-secret@ep-sparkling-night-azr6wxwd.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

test('normalizes only approved direct source TLS in memory', () => {
  const normalized = normalizeProtectedSourceUrl(source);
  assert.equal(new URL(normalized).searchParams.get('sslmode'), 'verify-full');
  assert.equal(new URL(normalized).searchParams.get('sslrootcert'), 'system');
  assert.throws(() => normalizeProtectedSourceUrl(source.replace('ep-sparkling-night', 'ep-other')), { code: 'SOURCE_REJECTED' });
  assert.throws(() => normalizeProtectedSourceUrl(source.replace('sslmode=require', 'sslmode=disable')), { code: 'SOURCE_REJECTED' });
  assert.throws(() => normalizeProtectedSourceUrl(source + '&application_name=unsafe'), { code: 'SOURCE_REJECTED' });
});

test('recovery receipt must bind verified status, recipient, and a real timestamp', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-receipt-'));
  const path = join(root, 'recovery-verified.json');
  try {
    const receipt = { status: 'RECOVERY_VERIFIED', recipient, verifiedAtUtc: '2026-10-04T16:12:44.712115Z', note: 'Matching copied-back key; owner must confirm independent vault custody.' };
    await writeFile(path, JSON.stringify(receipt));
    await assertRecoveryReady(status, path, recipient);
    for (const altered of [
      { ...receipt, recipient: recipient.replace('gy00', 'qqqq') },
      { ...receipt, status: 'PENDING' },
      { ...receipt, verifiedAtUtc: 'not-a-date' },
    ]) {
      await writeFile(path, JSON.stringify(altered));
      await assert.rejects(assertRecoveryReady(status, path, recipient), { code: 'KEY_NOT_READY' });
    }
    await writeFile(path, JSON.stringify(receipt));
    await assert.rejects(assertRecoveryReady({ ...status, recoveryVerified: false }, path, recipient), { code: 'KEY_NOT_READY' });
    await assert.rejects(assertRecoveryReady({ ...status, recipient: 'age1wrong' }, path, recipient), { code: 'KEY_NOT_READY' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('owner-only directory guard checks the actual Windows DACL and rejects ordinary inherited ACL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-acl-'));
  try {
    await assert.rejects(assertOwnerOnlyDirectory(root), { code: 'OUTPUT_REJECTED' });
    const escaped = root.replaceAll("'", "''");
    const command = `$p='${escaped}';$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$f=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit;$r=New-Object Security.AccessControl.FileSystemAccessRule($s,[Security.AccessControl.FileSystemRights]::FullControl,$f,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$a)`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await assertOwnerOnlyDirectory(root);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('owner-only guard rejects a key artifact with an added broad file ACE', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-key-acl-'));
  const file = join(root, 'receipt.json');
  try {
    await writeFile(file, '{}');
    const escapedRoot = root.replaceAll("'", "''");
    const escapedFile = file.replaceAll("'", "''");
    const command = `$p='${escapedRoot}';$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$f=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit;$r=New-Object Security.AccessControl.FileSystemAccessRule($s,[Security.AccessControl.FileSystemRights]::FullControl,$f,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$a);$x=[IO.File]::GetAccessControl('${escapedFile}');$x.SetAccessRuleProtection($true,$false);$b=New-Object Security.AccessControl.FileSystemAccessRule('Everyone',[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow);$x.AddAccessRule($b);[IO.File]::SetAccessControl('${escapedFile}',$x)`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(assertOwnerOnlyDirectory(root, 'KEY_NOT_READY', ['receipt.json']), { code: 'KEY_NOT_READY' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('pinned file guard rejects changed bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-pin-'));
  const path = join(root, 'tool.zip');
  try {
    await writeFile(path, 'approved synthetic archive');
    const hash = createHash('sha256').update('approved synthetic archive').digest('hex');
    await verifyPinnedFile(path, hash);
    await writeFile(path, 'changed archive');
    await assert.rejects(verifyPinnedFile(path, hash), { code: 'TOOL_REJECTED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('capacity guard rejects a requirement above actual available bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'miracle-capacity-'));
  try {
    await assertOutputCapacity(root, 1n);
    await assert.rejects(assertOutputCapacity(root, 2n ** 63n), { code: 'CAPACITY_REJECTED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI rejects readiness assertions and never prints source credentials', () => {
  const cli = fileURLToPath(new URL('../../scripts/operations/local-backup.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--ready'], { encoding: 'utf8', env: { ...process.env, MIRACLE_BACKUP_READY: 'true', MIRACLE_BACKUP_SOURCE_URL: source, MIRACLE_BACKUP_AGE_RECIPIENT: recipient }, timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CONFIG_REJECTED/);
  assert.equal(result.stderr.includes('synthetic-secret'), false);
  assert.equal(result.stdout.includes('synthetic-secret'), false);
});
