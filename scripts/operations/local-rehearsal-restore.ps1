param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][ValidateSet('recovery_baseline', 'migration_candidate')][string]$Database
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'local-backup-key.psm1') -Force -DisableNameChecking
$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-local-encrypted-backup\runtime'))

try {
    if ($env:PGHOST -cne '127.0.0.1' -or $env:PGPORT -cne '55438' -or
        $env:PGDATABASE -cne $Database -or $env:PGUSER -cne 'rehearsal_owner' -or
        $env:PGSSLMODE -cne 'disable' -or -not $env:PGPASSWORD) { throw 'RESTORE_FAILED' }
    $result = Restore-BackupArchive -KeyDirectory 'E:\MiracleBackupKeys' -ApprovedKeyRoot 'E:\MiracleBackupKeys' `
        -OutputDirectory 'E:\MiracleBackups' -ApprovedOutputRoot 'E:\MiracleBackups' `
        -ArchivePath $ArchivePath -Database $Database `
        -AgePath ([IO.Path]::Combine($runtime, 'age\age.exe')) `
        -ExpectedAgeSha256 '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0' `
        -PgRestorePath ([IO.Path]::Combine($runtime, 'pg18\bin\pg_restore.exe')) `
        -ExpectedPgRestoreSha256 '94c2b545fb870c08414dcf03cd93723f78662e1d489a0272150b40a0267f0d55'
    $result | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine('RESTORE_FAILED')
    exit 1
}
