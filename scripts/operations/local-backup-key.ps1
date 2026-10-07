param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('Initialize', 'CopyRecoveryKey', 'VerifyRecoveryCopy', 'Status')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'local-backup-key.psm1') -Force -DisableNameChecking

$keyDirectory = 'E:\MiracleBackupKeys'
$ageDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-local-encrypted-backup\runtime\age'))
$settings = @{
    KeyDirectory = $keyDirectory
    ApprovedRoot = $keyDirectory
    AgeKeygenPath = [IO.Path]::Combine($ageDirectory, 'age-keygen.exe')
    AgePath = [IO.Path]::Combine($ageDirectory, 'age.exe')
    ExpectedKeygenSha256 = '1549c7049be32695594bedd09bbd352a94b6013a9d5c43364f3c6cd7a09ab61c'
    ExpectedAgeSha256 = '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0'
}

try {
    switch ($Mode) {
        'Initialize' {
            $result = Initialize-BackupKey @settings
            $launcher = [IO.Path]::Combine($keyDirectory, 'copy-recovery-key.cmd')
            $content = "@echo off`r`npowershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File `"$PSCommandPath`" CopyRecoveryKey`r`n"
            $bytes = [Text.Encoding]::ASCII.GetBytes($content)
            $stream = New-Object IO.FileStream($launcher, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
            break
        }
        'CopyRecoveryKey' {
            [Console]::WriteLine('Warning: Clipboard history, cloud sync, Phone Link cross-device copy, and third-party clipboard managers may retain the private key. Disable them before copying. Paste only into your Bitwarden Secure Note, then clear the clipboard.')
            $confirmation = Read-Host 'Type COPY to place the recovery key on this PC clipboard'
            if ($confirmation -cne 'COPY') { throw 'KEY_COPY_CANCELLED' }
            $result = Copy-BackupRecoveryKey @settings
            [Console]::WriteLine('Private key copied. Paste into the Secure Note, clear the clipboard, then run VerifyRecoveryCopy with the copied-back key.')
            break
        }
        'VerifyRecoveryCopy' {
            $copiedIdentity = Read-Host 'Paste the copied-back private identity (input hidden)' -AsSecureString
            $result = Verify-BackupRecoveryCopy @settings -CopiedIdentity $copiedIdentity
            break
        }
        'Status' { $result = Get-BackupKeyStatus @settings; break }
    }
    $result | ConvertTo-Json -Compress
} catch {
    $code = $_.Exception.Message
    if ($code -notin @('KEY_PATH_REJECTED', 'KEY_ACL_REJECTED', 'TOOL_REJECTED', 'KEY_MISSING', 'KEY_EXISTS', 'KEY_REJECTED', 'KEY_COPY_CANCELLED')) { $code = 'KEY_REJECTED' }
    [Console]::Error.WriteLine($code)
    exit 1
}
