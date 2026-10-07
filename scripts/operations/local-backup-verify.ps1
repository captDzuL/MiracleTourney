param([Parameter(Mandatory = $true)][string]$ArchivePath)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'local-backup-key.psm1') -Force -DisableNameChecking
$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-local-encrypted-backup\runtime'))

try {
    $result = Test-BackupArchive -KeyDirectory 'E:\MiracleBackupKeys' -ApprovedRoot 'E:\MiracleBackupKeys' `
        -OutputDirectory 'E:\MiracleBackups' -ApprovedOutputRoot 'E:\MiracleBackups' `
        -ArchivePath $ArchivePath `
        -AgePath ([IO.Path]::Combine($runtime, 'age\age.exe')) `
        -ExpectedAgeSha256 '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0' `
        -PgRestorePath ([IO.Path]::Combine($runtime, 'pg18\bin\pg_restore.exe')) `
        -ExpectedPgRestoreSha256 '94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55'
    $result | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine('ARCHIVE_VERIFY_FAILED')
    exit 1
}
