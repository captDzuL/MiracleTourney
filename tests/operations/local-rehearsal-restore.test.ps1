$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\..\scripts\operations\local-backup-key.psm1') -Force -DisableNameChecking

$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-local-encrypted-backup\runtime'))
$age = [IO.Path]::Combine($runtime, 'age\age.exe')
$keygen = [IO.Path]::Combine($runtime, 'age\age-keygen.exe')
$fixtureRoot = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'miracle-rehearsal-synthetic-' + [guid]::NewGuid().ToString('N'))
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($owner)
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($owner, [Security.AccessControl.FileSystemRights]::FullControl,
    ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
    [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)

function Assert-Fails([scriptblock]$Operation, [string]$Label) {
    try { [void](& $Operation); throw "ASSERTION_FAILED:$Label" }
    catch { if ($_.Exception.Message -ne 'RESTORE_FAILED') { throw } }
}

try {
    [void][IO.Directory]::CreateDirectory($fixtureRoot, $acl)
    $keyRoot = [IO.Path]::Combine($fixtureRoot, 'key')
    $otherKeyRoot = [IO.Path]::Combine($fixtureRoot, 'other-key')
    $keys = @{
        KeyDirectory = $keyRoot; ApprovedRoot = $keyRoot; AgeKeygenPath = $keygen; AgePath = $age
        ExpectedKeygenSha256 = '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c'
        ExpectedAgeSha256 = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0'
    }
    $recipient = (Initialize-BackupKey @keys).recipient
    $keys.KeyDirectory = $otherKeyRoot
    $keys.ApprovedRoot = $otherKeyRoot
    [void](Initialize-BackupKey @keys)

    $fake = [IO.Path]::Combine($fixtureRoot, 'fake-pg-restore.exe')
    $source = @'
using System;
using System.IO;
using System.Linq;
public static class FakeRestore {
  public static int Main(string[] args) {
    string[] required = { "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl",
      "--host=127.0.0.1", "--port=55438", "--username=rehearsal_owner", "--dbname=recovery_baseline" };
    if (args.Length != required.Length || required.Any(a => !args.Contains(a))) return 9;
    using (var input = Console.OpenStandardInput()) {
      byte[] bytes = new byte[8192];
      int count = 0;
      for (int n; (n = input.Read(bytes, 0, bytes.Length)) > 0;) count += n;
      if (count == 0) return 8;
    }
    return Environment.GetEnvironmentVariable("FAKE_RESTORE_FAIL") == "1" ? 7 : 0;
  }
}
'@
    Add-Type -TypeDefinition $source -OutputAssembly $fake -OutputType ConsoleApplication -ErrorAction Stop
    $fakeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fake).Hash.ToLowerInvariant()

    $archive = [IO.Path]::Combine($fixtureRoot, 'miracle-neondb-2026-10-05T01-23-48-741Z.age')
    $manifestPath = [IO.Path]::ChangeExtension($archive, '.json')
    $process = New-Object Diagnostics.Process
    $process.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = $age
    $process.StartInfo.Arguments = '-e -r ' + $recipient
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    if (-not $process.Start()) { throw 'SYNTHETIC_ENCRYPT_FAILED' }
    $encrypted = New-Object IO.MemoryStream
    $copy = $process.StandardOutput.BaseStream.CopyToAsync($encrypted)
    $err = $process.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
    $plaintext = [Text.Encoding]::UTF8.GetBytes('synthetic restore fixture')
    $process.StandardInput.BaseStream.Write($plaintext, 0, $plaintext.Length)
    $process.StandardInput.Close()
    $process.WaitForExit()
    [void]$copy.GetAwaiter().GetResult()
    [void]$err.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw 'SYNTHETIC_ENCRYPT_FAILED' }
    $process.Dispose()
    [IO.File]::WriteAllBytes($archive, $encrypted.ToArray())
    $encrypted.Dispose()
    $original = [IO.File]::ReadAllBytes($archive)
    function Write-Manifest {
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
        $value = @{ archive = [IO.Path]::GetFileName($archive); bytes = ([IO.FileInfo]$archive).Length; sha256 = $hash } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($manifestPath, $value)
    }
    Write-Manifest
    $restore = @{
        KeyDirectory = $keyRoot; ApprovedKeyRoot = $keyRoot
        OutputDirectory = $fixtureRoot; ApprovedOutputRoot = $fixtureRoot
        ArchivePath = $archive; AgePath = $age
        ExpectedAgeSha256 = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0'
        PgRestorePath = $fake; ExpectedPgRestoreSha256 = $fakeHash
        Database = 'recovery_baseline'; TimeoutMs = 15000
    }
    $success = Restore-BackupArchive @restore
    if ($success.status -ne 'RESTORED' -or $success.ageExit -ne 0 -or $success.restoreExit -ne 0) { throw 'SYNTHETIC_SUCCESS_FAILED' }
    $restore.Database = 'neondb'
    Assert-Fails { Restore-BackupArchive @restore } 'target'
    $restore.Database = 'recovery_baseline'
    $restore.ArchivePath = [IO.Path]::Combine($fixtureRoot, 'unexpected.age')
    Assert-Fails { Restore-BackupArchive @restore } 'path'
    $restore.ArchivePath = $archive
    $directoryAcl = [IO.Directory]::GetAccessControl($fixtureRoot)
    $everyone = New-Object Security.Principal.SecurityIdentifier('S-1-1-0')
    $extra = New-Object Security.AccessControl.FileSystemAccessRule($everyone, [Security.AccessControl.FileSystemRights]::Read,
        [Security.AccessControl.InheritanceFlags]::None, [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow)
    $directoryAcl.AddAccessRule($extra)
    [IO.Directory]::SetAccessControl($fixtureRoot, $directoryAcl)
    try { Assert-Fails { Restore-BackupArchive @restore } 'acl' }
    finally {
        $directoryAcl.RemoveAccessRule($extra) | Out-Null
        [IO.Directory]::SetAccessControl($fixtureRoot, $directoryAcl)
    }
    $restore.KeyDirectory = $otherKeyRoot
    $restore.ApprovedKeyRoot = $otherKeyRoot
    Assert-Fails { Restore-BackupArchive @restore } 'wrong-key'
    $restore.KeyDirectory = $keyRoot
    $restore.ApprovedKeyRoot = $keyRoot
    $env:FAKE_RESTORE_FAIL = '1'
    try { Assert-Fails { Restore-BackupArchive @restore } 'restore-exit' }
    finally { Remove-Item Env:FAKE_RESTORE_FAIL -ErrorAction SilentlyContinue }
    $corrupted = [byte[]]$original.Clone()
    $corrupted[$corrupted.Length - 10] = $corrupted[$corrupted.Length - 10] -bxor 1
    [IO.File]::WriteAllBytes($archive, $corrupted)
    Write-Manifest
    Assert-Fails { Restore-BackupArchive @restore } 'age-authentication'
    [IO.File]::WriteAllBytes($archive, $original)
    Write-Manifest
    [IO.File]::AppendAllText($manifestPath, 'tamper')
    Assert-Fails { Restore-BackupArchive @restore } 'manifest'
    [Console]::WriteLine('SYNTHETIC_RESTORE_PASS 8')
} finally {
    if ([IO.Directory]::Exists($fixtureRoot) -and
        $fixtureRoot.StartsWith([IO.Path]::GetTempPath() + 'miracle-rehearsal-synthetic-', [StringComparison]::OrdinalIgnoreCase)) {
        [IO.Directory]::Delete($fixtureRoot, $true)
    }
}
