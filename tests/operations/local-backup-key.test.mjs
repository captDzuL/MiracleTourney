import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const modulePath = fileURLToPath(new URL('../../scripts/operations/local-backup-key.psm1', import.meta.url));
const ageDirectory = fileURLToPath(new URL('../../.superpowers/sdd/2026-10-04-local-encrypted-backup/runtime/age/', import.meta.url));
const ageKeygen = join(ageDirectory, 'age-keygen.exe');
const age = join(ageDirectory, 'age.exe');
const keygenHash = '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c';
const ageHash = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0';

function psLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function run(script) {
  const command = `$ErrorActionPreference='Stop'; Import-Module ${psLiteral(modulePath)} -Force -DisableNameChecking; ${script}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(/AGE-SECRET-KEY-/.test(result.stdout + result.stderr), false, 'secret appeared in process output');
  return result;
}

function settings(root, overrides = {}) {
  const values = { KeyDirectory: root, ApprovedRoot: root, AgeKeygenPath: ageKeygen, AgePath: age, ExpectedKeygenSha256: keygenHash, ExpectedAgeSha256: ageHash, ...overrides };
  return Object.entries(values).map(([key, value]) => `-${key} ${psLiteral(value)}`).join(' ');
}

async function fixture() { return mkdtemp(join(tmpdir(), 'miracle-key-test-')); }

test('initialization creates only DPAPI identity, public recipient, and restricted directory', async () => {
  const parent = await fixture(); const root = join(parent, 'keys');
  try {
    const result = run(`$r=Initialize-BackupKey ${settings(root)}; $r | ConvertTo-Json -Compress`);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.match(output.recipient, /^age1[0-9a-z]+$/);
    assert.equal(output.status, 'INITIALIZED');
    assert.deepEqual((await readdir(root)).sort(), ['identity.dpapi', 'recipient.txt'].sort());
    assert.equal((await readFile(join(root, 'recipient.txt'), 'utf8')).trim(), output.recipient);
    assert.equal(/AGE-SECRET-KEY-/.test(await readFile(join(root, 'identity.dpapi'), 'latin1')), false);
    const status = run(`Get-BackupKeyStatus ${settings(root)} | ConvertTo-Json -Compress`);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout.trim()).status, 'LOCAL_KEY_PRESENT');
    const acl = run(`$a=[IO.Directory]::GetAccessControl(${psLiteral(root)}); $s=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if(-not $a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $s -or @($a.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $s }).Count -ne 0){throw 'ACL_UNSAFE'}; 'ACL_SAFE'`);
    assert.equal(acl.status, 0, acl.stderr);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('rejects a mismatched root, reparse ancestor, and unsafe existing ACL', async () => {
  const parent = await fixture();
  try {
    const root = join(parent, 'keys');
    const mismatch = run(`Initialize-BackupKey ${settings(root, { ApprovedRoot: join(parent, 'other') })}`);
    assert.notEqual(mismatch.status, 0); assert.match(mismatch.stderr, /KEY_PATH_REJECTED/);
    const driveRoot = run(`Initialize-BackupKey ${settings('C:\\', { ApprovedRoot: 'C:\\' })}`);
    assert.notEqual(driveRoot.status, 0); assert.match(driveRoot.stderr, /KEY_PATH_REJECTED/);
    const dotAlias = run(`Initialize-BackupKey ${settings(parent + '\\.\\keys', { ApprovedRoot: root })}`);
    assert.notEqual(dotAlias.status, 0); assert.match(dotAlias.stderr, /KEY_PATH_REJECTED/);
    const link = join(parent, 'link');
    const linked = run(`New-Item -ItemType Junction -Path ${psLiteral(link)} -Target ${psLiteral(parent)} | Out-Null; Initialize-BackupKey ${settings(join(link, 'keys'))}`);
    assert.notEqual(linked.status, 0); assert.match(linked.stderr, /KEY_PATH_REJECTED/);
    const unsafe = join(parent, 'unsafe');
    const created = run(`New-Item -ItemType Directory -Path ${psLiteral(unsafe)} | Out-Null; Initialize-BackupKey ${settings(unsafe)}`);
    assert.notEqual(created.status, 0); assert.match(created.stderr, /KEY_ACL_REJECTED/);
    const noInheritance = join(parent, 'no-inheritance');
    const badAcl = run(`$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$r=New-Object Security.AccessControl.FileSystemAccessRule($s,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]::None,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$a.AddAccessRule($r);[void][IO.Directory]::CreateDirectory(${psLiteral(noInheritance)},$a); Initialize-BackupKey ${settings(noInheritance)}`);
    assert.notEqual(badAcl.status, 0); assert.match(badAcl.stderr, /KEY_ACL_REJECTED/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('rejects a changed age binary without writing a key', async () => {
  const parent = await fixture(); const root = join(parent, 'keys');
  try {
    const result = run(`Initialize-BackupKey ${settings(root, { ExpectedAgeSha256: '0'.repeat(64) })}`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /TOOL_REJECTED/);
    assert.equal((await readdir(parent)).includes('keys'), false);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('rejects existing identity artifacts and never overwrites them', async () => {
  const parent = await fixture(); const root = join(parent, 'keys');
  try {
    assert.equal(run(`Initialize-BackupKey ${settings(root)} | Out-Null`).status, 0);
    const before = await readFile(join(root, 'identity.dpapi'));
    const result = run(`Initialize-BackupKey ${settings(root)}`);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /KEY_EXISTS/);
    assert.deepEqual(await readFile(join(root, 'identity.dpapi')), before);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('status rejects missing identity and invalid DPAPI bytes', async () => {
  const parent = await fixture(); const root = join(parent, 'keys');
  try {
    assert.equal(run(`Initialize-BackupKey ${settings(root)} | Out-Null`).status, 0);
    await rm(join(root, 'identity.dpapi'));
    const missing = run(`Get-BackupKeyStatus ${settings(root)}`);
    assert.notEqual(missing.status, 0); assert.match(missing.stderr, /KEY_MISSING/);
    await writeFile(join(root, 'identity.dpapi'), 'invalid DPAPI bytes');
    const corrupt = run(`Get-BackupKeyStatus ${settings(root)}`);
    assert.notEqual(corrupt.status, 0); assert.match(corrupt.stderr, /KEY_REJECTED/);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('copied-back identity must derive same recipient and decrypt a real age challenge', async () => {
  const parent = await fixture(); const root = join(parent, 'keys');
  const otherParent = await fixture(); const otherRoot = join(otherParent, 'keys');
  try {
    assert.equal(run(`Initialize-BackupKey ${settings(root)} | Out-Null`).status, 0);
    assert.equal(run(`Initialize-BackupKey ${settings(otherRoot)} | Out-Null`).status, 0);
    const testScript = `function Read-Synthetic($p){$b=[IO.File]::ReadAllBytes([IO.Path]::Combine($p,'identity.dpapi'));$x=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$s=[Text.Encoding]::UTF8.GetString($x);$v=New-Object Security.SecureString;foreach($c in $s.ToCharArray()){$v.AppendChar($c)};[Array]::Clear($x,0,$x.Length);return $v};`;
    const mismatch = run(`${testScript} Verify-BackupRecoveryCopy ${settings(root)} -CopiedIdentity (Read-Synthetic ${psLiteral(otherRoot)})`);
    assert.notEqual(mismatch.status, 0); assert.match(mismatch.stderr, /KEY_REJECTED/);
    assert.equal((await readdir(root)).includes('recovery-verified.json'), false);
    const match = run(`${testScript} Verify-BackupRecoveryCopy ${settings(root)} -CopiedIdentity (Read-Synthetic ${psLiteral(root)}) | ConvertTo-Json -Compress`);
    assert.equal(match.status, 0, match.stderr);
    assert.equal(JSON.parse(match.stdout.trim()).status, 'RECOVERY_VERIFIED');
    const receipt = JSON.parse(await readFile(join(root, 'recovery-verified.json'), 'utf8'));
    assert.equal(receipt.status, 'RECOVERY_VERIFIED');
    assert.equal(/AGE-SECRET-KEY-/.test(JSON.stringify(receipt)), false);
  } finally { await rm(parent, { recursive: true, force: true }); await rm(otherParent, { recursive: true, force: true }); }
});

test('recovery receipt is not written when local DPAPI identity is missing', async () => {
  const parent = await fixture(); const root = join(parent, 'keys');
  try {
    assert.equal(run(`Initialize-BackupKey ${settings(root)} | Out-Null`).status, 0);
    const script = `function Read-Synthetic($p){$b=[IO.File]::ReadAllBytes([IO.Path]::Combine($p,'identity.dpapi'));$x=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$s=[Text.Encoding]::UTF8.GetString($x);$v=New-Object Security.SecureString;foreach($c in $s.ToCharArray()){$v.AppendChar($c)};[Array]::Clear($x,0,$x.Length);return $v}; $copied=Read-Synthetic ${psLiteral(root)}; [IO.File]::Delete([IO.Path]::Combine(${psLiteral(root)},'identity.dpapi')); Verify-BackupRecoveryCopy ${settings(root)} -CopiedIdentity $copied`;
    const result = run(script);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /KEY_MISSING|KEY_REJECTED/);
    assert.equal((await readdir(root)).includes('recovery-verified.json'), false);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
