$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-local-encrypted-backup\runtime\postgresql-18.6-windows-x64-binaries.zip'))
$fixtureRoot = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'miracle-task3-pg-' + [guid]::NewGuid().ToString('N'))
$serverRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-v3-release-pr-readiness\runtime\catalog-server'))
$port = $null
$started = $false
$stopped = $false
$bin = [IO.Path]::Combine($serverRoot,'pgsql','bin')
$data = [IO.Path]::Combine($fixtureRoot, 'cluster')
$bootstrapPassword = [Convert]::ToBase64String(([byte[]](1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))).TrimEnd('=').Replace('+','-').Replace('/','_')
$ownerPassword = [Convert]::ToBase64String(([byte[]](1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))).TrimEnd('=').Replace('+','-').Replace('/','_')

function Assert-That([bool]$Condition, [string]$Label) { if (-not $Condition) { throw "FIXTURE_ASSERTION_FAILED:$Label" } }
function Invoke-Tool([string]$Path, [string]$Arguments, [int]$TimeoutMs = 90000) {
    $process = New-Object Diagnostics.Process
    $process.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = $Path; $process.StartInfo.Arguments = $Arguments
    $process.StartInfo.UseShellExecute = $false; $process.StartInfo.CreateNoWindow = $true
    # Never redirect a background server launcher's handles: postmaster can retain them.
    $process.StartInfo.RedirectStandardOutput = $false; $process.StartInfo.RedirectStandardError = $false
    try {
        Assert-That ($process.Start()) 'tool-start'
        if (-not $process.WaitForExit($TimeoutMs)) { $process.Kill(); throw 'FIXTURE_TOOL_TIMEOUT' }
        Assert-That ($process.ExitCode -eq 0) 'tool-exit'
    } finally { $process.Dispose() }
}
function Invoke-Sql([string]$Database, [string]$User, [string]$Password, [string]$Sql,
    [switch]$ExpectFailure, [switch]$ExpectAuthDenial) {
    $env:PGHOST = '127.0.0.1'; $env:PGPORT = [string]$port; $env:PGDATABASE = $Database
    $env:PGUSER = $User; $env:PGPASSWORD = $Password; $env:PGSSLMODE = 'disable'
    $process = New-Object Diagnostics.Process
    $process.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = [IO.Path]::Combine($bin,'psql.exe')
    $process.StartInfo.Arguments = '-X -w -A -t -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p ' + $port + ' -U ' + $User + ' -d ' + $Database
    $process.StartInfo.UseShellExecute = $false; $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardInput = $true; $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    try {
        Assert-That ($process.Start()) 'psql-start'
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = if ($ExpectAuthDenial) { $process.StandardError.ReadToEndAsync() }
            else { $process.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null) }
        $writeTask = $process.StandardInput.WriteLineAsync($Sql)
        $completed = [Threading.Tasks.Task]::WhenAny($writeTask, [Threading.Tasks.Task]::Delay(45000)).GetAwaiter().GetResult()
        if (-not [object]::ReferenceEquals($completed,$writeTask)) { $process.Kill(); throw 'FIXTURE_PSQL_INPUT_TIMEOUT' }
        if ($writeTask.IsFaulted -and -not ($ExpectFailure -or $ExpectAuthDenial)) { throw 'FIXTURE_PSQL_INPUT_FAILED' }
        try { $process.StandardInput.Close() }
        catch { if (-not ($ExpectFailure -or $ExpectAuthDenial)) { throw } }
        if (-not $process.WaitForExit(45000)) { $process.Kill(); throw 'FIXTURE_PSQL_TIMEOUT' }
        $privateError = $errorTask.GetAwaiter().GetResult()
        $output = @($outputTask.GetAwaiter().GetResult() -split '\r?\n' | Where-Object { $_ })
        $code = $process.ExitCode
    } finally { if (-not $process.HasExited) { $process.Kill() }; $process.Dispose() }
    if ($ExpectAuthDenial) {
        Assert-That ($code -eq 2 -and $privateError -match 'password authentication failed for user "fixture_bootstrap"') 'scram-auth-denial'
        return @()
    }
    if ($ExpectFailure) { Assert-That ($code -ne 0) 'expected-sql-failure'; return @() }
    Assert-That ($code -eq 0) 'sql-exit'
    return $output
}
function Query-Json([string]$Sql) {
    $output = @(Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword $Sql)
    $line = @($output | Where-Object { $_.StartsWith("MIRACLE_LOCAL_CHECKPOINT`t") })
    Assert-That ($line.Count -eq 1) 'json-marker'
    return ($line[0].Substring('MIRACLE_LOCAL_CHECKPOINT'.Length + 1) | ConvertFrom-Json)
}
function Build-Sql([string]$Mode, [string]$Token = '') {
    $process = New-Object Diagnostics.Process
    $process.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = (Get-Command node).Source
    $helper = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'local-rehearsal-sql-fixture.mjs'))
    $process.StartInfo.Arguments = '"' + $helper + '" ' + $Mode + ' ' + $Token
    $process.StartInfo.WorkingDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $process.StartInfo.UseShellExecute = $false; $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true; $process.StartInfo.RedirectStandardError = $true
    try {
        Assert-That ($process.Start()) 'sql-build-start'
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        if (-not $process.WaitForExit(15000)) { $process.Kill(); throw 'FIXTURE_SQL_BUILD_TIMEOUT' }
        [void]$errorTask.GetAwaiter().GetResult()
        Assert-That ($process.ExitCode -eq 0) 'sql-build'
        return $outputTask.GetAwaiter().GetResult()
    } finally { $process.Dispose() }
}
function Invoke-Pipeline([string]$SourceDb, [string]$TargetDb) {
    $dump = New-Object Diagnostics.Process
    $dump.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $dump.StartInfo.FileName = [IO.Path]::Combine($bin, 'pg_dump.exe')
    $dump.StartInfo.Arguments = '--host=127.0.0.1 --port=' + $port + ' --username=fixture_owner --dbname=' + $SourceDb + ' --format=custom --no-owner --no-acl'
    $dump.StartInfo.UseShellExecute = $false; $dump.StartInfo.CreateNoWindow = $true
    $dump.StartInfo.RedirectStandardOutput = $true; $dump.StartInfo.RedirectStandardError = $true
    $restore = New-Object Diagnostics.Process
    $restore.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $restore.StartInfo.FileName = [IO.Path]::Combine($bin, 'pg_restore.exe')
    # The filename is intentionally omitted for pg_restore stdin.
    $restore.StartInfo.Arguments = '--host=127.0.0.1 --port=' + $port + ' --username=fixture_owner --dbname=' + $TargetDb + ' --single-transaction --exit-on-error --no-owner --no-acl'
    $restore.StartInfo.UseShellExecute = $false; $restore.StartInfo.CreateNoWindow = $true
    $restore.StartInfo.RedirectStandardInput = $true; $restore.StartInfo.RedirectStandardOutput = $true
    $restore.StartInfo.RedirectStandardError = $true
    $env:PGPASSWORD = $ownerPassword; $env:PGUSER = 'fixture_owner'; $env:PGSSLMODE = 'disable'
    try {
        Assert-That ($restore.Start()) 'restore-start'
        Assert-That ($dump.Start()) 'dump-start'
        $dumpError = $dump.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        $restoreOutput = $restore.StandardOutput.BaseStream.CopyToAsync([IO.Stream]::Null)
        $restoreError = $restore.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        $copy = $dump.StandardOutput.BaseStream.CopyToAsync($restore.StandardInput.BaseStream)
        Assert-That ($copy.Wait(120000)) 'dump-copy-timeout'
        [void]$copy.GetAwaiter().GetResult()
        $restore.StandardInput.Close()
        Assert-That ($dump.WaitForExit(120000) -and $restore.WaitForExit(120000)) 'pipeline-timeout'
        foreach ($task in @($dumpError,$restoreOutput,$restoreError)) { Assert-That ($task.Wait(120000)) 'pipeline-drain'; [void]$task.GetAwaiter().GetResult() }
        Assert-That ($dump.ExitCode -eq 0 -and $restore.ExitCode -eq 0) 'dump-restore-exit'
        return @{ dumpExit = $dump.ExitCode; restoreExit = $restore.ExitCode }
    } finally {
        if (-not $dump.HasExited) { $dump.Kill() }
        if (-not $restore.HasExited) { $restore.Kill() }
        $dump.Dispose(); $restore.Dispose()
    }
}

try {
    Assert-That (([IO.FileInfo]$zipPath).Length -eq 384620317) 'zip-size'
    Assert-That ((Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant() -eq 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2') 'zip-hash'
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($owner); $acl.SetAccessRuleProtection($true,$false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($owner, [Security.AccessControl.FileSystemRights]::FullControl,
        ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
        [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    [void][IO.Directory]::CreateDirectory($fixtureRoot,$acl)
    Assert-That ([IO.Directory]::GetAccessControl($fixtureRoot).AreAccessRulesProtected) 'private-root'
    Assert-That ([IO.Directory]::Exists($bin)) 'retained-server-runtime'
    $zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        foreach ($name in @('postgres.exe','initdb.exe','pg_ctl.exe','psql.exe','pg_dump.exe','pg_restore.exe')) {
            $entry = $zip.GetEntry('pgsql/bin/' + $name)
            Assert-That ($null -ne $entry) 'zip-entry'
            $sha = [Security.Cryptography.SHA256]::Create()
            $source = $entry.Open()
            try { $expected = [BitConverter]::ToString($sha.ComputeHash($source)).Replace('-','').ToLowerInvariant() }
            finally { $source.Dispose(); $sha.Dispose() }
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ([IO.Path]::Combine($bin,$name))).Hash.ToLowerInvariant()
            Assert-That ($actual -eq $expected) ('exe-pin-' + $name)
        }
    } finally { $zip.Dispose() }
    $dllPins = Build-Sql 'dllhashes' | ConvertFrom-Json
    foreach ($entry in $dllPins.PSObject.Properties) {
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath ([IO.Path]::Combine($bin,$entry.Name))).Hash.ToLowerInvariant()
        Assert-That ($actual -eq $entry.Value) ('dll-pin-' + $entry.Name)
    }
    Invoke-Tool ([IO.Path]::Combine($bin,'postgres.exe')) '--version' 15000
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse('127.0.0.1'),0)
    $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    Assert-That ($port -ne 55438) 'port-separation'
    $pwfile = [IO.Path]::Combine($fixtureRoot,'initdb-pw.txt')
    [IO.File]::WriteAllText($pwfile,$bootstrapPassword + "`n")
    try {
        Invoke-Tool ([IO.Path]::Combine($bin,'initdb.exe')) ('-D "' + $data + '" -U fixture_bootstrap --auth-host=scram-sha-256 --auth-local=reject --pwfile="' + $pwfile + '" --encoding=UTF8 --no-instructions') 120000
    } finally { [IO.File]::Delete($pwfile) }
    [IO.File]::AppendAllText([IO.Path]::Combine($data,'postgresql.conf'),"`nlisten_addresses='127.0.0.1'`nport=$port`npassword_encryption='scram-sha-256'`nlog_statement='none'`nlog_min_error_statement='panic'`n")
    [IO.File]::WriteAllText([IO.Path]::Combine($data,'pg_hba.conf'),"host all all 127.0.0.1/32 scram-sha-256`nhost all all ::1/128 reject`nlocal all all reject`n")
    Invoke-Tool ([IO.Path]::Combine($bin,'pg_ctl.exe')) ('-D "' + $data + '" -l "' + ([IO.Path]::Combine($fixtureRoot,'server.log')) + '" -w -t 60 start') 90000
    $started = $true
    $wrongPassword = $(if ($bootstrapPassword[0] -eq 'A') { 'B' } else { 'A' }) + $bootstrapPassword.Substring(1)
    [void](Invoke-Sql 'postgres' 'fixture_bootstrap' $wrongPassword 'SELECT 1;' -ExpectAuthDenial)
    [void](Invoke-Sql 'postgres' 'fixture_bootstrap' $bootstrapPassword "CREATE ROLE fixture_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$ownerPassword';")
    foreach ($db in @('synthetic_source','synthetic_restore','synthetic_candidate')) {
        [void](Invoke-Sql 'postgres' 'fixture_bootstrap' $bootstrapPassword "CREATE DATABASE $db OWNER fixture_owner TEMPLATE template0 ENCODING 'UTF8';")
    }
    [void](Invoke-Sql 'synthetic_source' 'fixture_owner' $ownerPassword 'CREATE TABLE public.synthetic_probe (id integer PRIMARY KEY, dropped_note text, note text NOT NULL); INSERT INTO public.synthetic_probe VALUES (1, ''discarded'', ''synthetic only''); ALTER TABLE public.synthetic_probe DROP COLUMN dropped_note;')
    $pipeline = Invoke-Pipeline 'synthetic_source' 'synthetic_restore'
    $restored = @(Invoke-Sql 'synthetic_restore' 'fixture_owner' $ownerPassword 'SELECT count(*) FROM public.synthetic_probe;')
    Assert-That ($restored[-1] -eq '1') 'fresh-default-db-restore'
    $fingerprintSql = "SELECT md5((SELECT t::text FROM public.synthetic_probe t)), (SELECT string_agg(column_name || ':' || ordinal_position, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'synthetic_probe');"
    $sourceFingerprint = @(Invoke-Sql 'synthetic_source' 'fixture_owner' $ownerPassword $fingerprintSql)
    $restoreFingerprint = @(Invoke-Sql 'synthetic_restore' 'fixture_owner' $ownerPassword $fingerprintSql)
    $sourceParts = $sourceFingerprint[-1] -split '\|'
    $restoreParts = $restoreFingerprint[-1] -split '\|'
    Assert-That ($sourceParts[0] -eq $restoreParts[0]) 'dropped-attribute-composite-hash-stable'
    Assert-That ($sourceParts[1] -ne $restoreParts[1]) 'dropped-attribute-ordinal-drift'

    $schema = @'
CREATE TABLE public."User" ("id" text PRIMARY KEY, "email" text NOT NULL UNIQUE, "name" text NOT NULL,
 "role" text NOT NULL, "passwordHash" text NOT NULL, "sessionVersion" integer NOT NULL DEFAULT 0,
 "createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL);
CREATE TABLE public."Event" ("id" text PRIMARY KEY, "slug" text NOT NULL UNIQUE, "name" text NOT NULL,
 "description" text NOT NULL, "gameId" text NOT NULL, "gameModeId" text NOT NULL, "format" text NOT NULL,
 "status" text NOT NULL, "participantCap" integer NOT NULL, "registrationWindow" text NOT NULL,
 "startsAt" text NOT NULL, "venue" text NOT NULL, "createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL);
CREATE TABLE public."Team" ("id" text PRIMARY KEY, "eventId" text NOT NULL REFERENCES public."Event"("id"),
 "name" text NOT NULL, "logoText" text NOT NULL, "tag" text NOT NULL, "createdAt" timestamp NOT NULL);
CREATE TABLE public."Certificate" ("id" text PRIMARY KEY, "eventId" text NOT NULL REFERENCES public."Event"("id"),
 "teamId" text NOT NULL REFERENCES public."Team"("id"), "type" text NOT NULL, "recipientKind" text NOT NULL,
 "recipientId" text NOT NULL, "recipientName" text NOT NULL, "version" integer NOT NULL,
 "verificationCode" text NOT NULL, "imageUrl" text NOT NULL, "status" text NOT NULL,
 "attemptCount" integer NOT NULL, "createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL);
CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON public."Certificate"("verificationCode");
CREATE UNIQUE INDEX "Certificate_eventId_type_recipientKind_recipientId_version_key"
 ON public."Certificate"("eventId","type","recipientKind","recipientId","version");
CREATE TABLE public."PasswordResetToken" ("id" text PRIMARY KEY, "userId" text NOT NULL REFERENCES public."User"("id"),
 "token" text NOT NULL UNIQUE, "tokenFormat" text NOT NULL DEFAULT 'legacy_raw',
 "expiresAt" timestamp NOT NULL, "usedAt" timestamp, "createdAt" timestamp NOT NULL);
CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."PasswordResetToken"("userId");
CREATE TABLE public."RateLimitBucket" ("id" text PRIMARY KEY, "key" text NOT NULL, "count" integer NOT NULL,
 "resetAt" timestamp NOT NULL);
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON public."RateLimitBucket"("key");
CREATE TABLE public."Player" ("id" text PRIMARY KEY);
CREATE TABLE public."PlayerStat" ("id" text PRIMARY KEY);
'@
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword $schema)
    $metadataOutput = @(Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword (Build-Sql 'source-metadata'))
    $metadataMarker = @($metadataOutput | Where-Object { $_.StartsWith("MIRACLE_SOURCE_METADATA`t") })
    Assert-That ($metadataMarker.Count -eq 1) 'source-metadata-marker'
    $metadata = $metadataMarker[0].Substring('MIRACLE_SOURCE_METADATA'.Length + 1) | ConvertFrom-Json
    Assert-That ($metadata.schema.Count -gt 0 -and $metadata.tableMetadata.User.tableFound -and
      $metadata.tableMetadata.Team.tableFound -and $metadata.tableMetadata.Player.tableFound -and
      $metadata.tableMetadata.PlayerStat.tableFound) 'source-metadata-catalog'
    $digestOutput = @(Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword (Build-Sql 'source-digest'))
    $digestMarker = @($digestOutput | Where-Object { $_.StartsWith("MIRACLE_SOURCE_DIGEST`t") })
    Assert-That ($digestMarker.Count -eq 1) 'source-digest-marker'
    $digest = $digestMarker[0].Substring('MIRACLE_SOURCE_DIGEST'.Length + 1) | ConvertFrom-Json
    $digestCountOk = @($digest.PSObject.Properties).Count -eq 5
    $digestValuesOk = @(@('User','Team','Player','PlayerStat','Event') | Where-Object {
      [string]$digest.PSObject.Properties[$_].Value -notmatch '^[a-f0-9]{32}$'
    }).Count -eq 0
    Assert-That ($digestCountOk -and $digestValuesOk) ('source-digest-shape-' + $digestCountOk + '-' + $digestValuesOk)
    foreach ($mode in @('deep-source','deep-local')) {
        $deepOutput = @(Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword (Build-Sql $mode))
        $deepPrefix = $(if ($mode -eq 'deep-source') { 'MIRACLE_SOURCE_DEEP' } else { 'MIRACLE_LOCAL_CHECKPOINT' })
        $deepMarker = @($deepOutput | Where-Object { $_.StartsWith($deepPrefix + "`t") })
        Assert-That ($deepMarker.Count -eq 1) ('deep-marker-' + $mode)
        $deep = $deepMarker[0].Substring($deepPrefix.Length + 1) | ConvertFrom-Json
        Assert-That ($deep.schema.Count -gt 0 -and
          @($deep.canonical.PSObject.Properties).Count -eq 5 -and
          @($deep.composite.PSObject.Properties).Count -eq 5) ('deep-shape-' + $mode)
    }
    $postcheckSql = Build-Sql 'postcheck'
    $good = Query-Json $postcheckSql
    Assert-That ($good.certificateConstraints -and $good.sessionVersion -and $good.resetTokenUnique -and $good.rateLimitBucket) 'catalog-good'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key"; CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."PasswordResetToken"("tokenFormat");')
    Assert-That (-not (Query-Json $postcheckSql).resetTokenUnique) 'wrong-reset-column-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key"; CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."PasswordResetToken"("userId") WHERE "usedAt" IS NULL;')
    Assert-That (-not (Query-Json $postcheckSql).resetTokenUnique) 'partial-reset-index-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key"; CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."PasswordResetToken"(lower("userId"));')
    Assert-That (-not (Query-Json $postcheckSql).resetTokenUnique) 'expression-reset-index-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key"; CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."PasswordResetToken"("userId") INCLUDE ("token");')
    Assert-That (-not (Query-Json $postcheckSql).resetTokenUnique) 'included-reset-index-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key"; CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."User"("sessionVersion");')
    Assert-That (-not (Query-Json $postcheckSql).resetTokenUnique) 'wrong-reset-table-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key"; CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON public."PasswordResetToken"("userId");')
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'ALTER TABLE public."User" ALTER COLUMN "sessionVersion" SET DEFAULT 10;')
    Assert-That (-not (Query-Json $postcheckSql).sessionVersion) 'default-ten-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'ALTER TABLE public."User" ALTER COLUMN "sessionVersion" SET DEFAULT 0;')
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."Certificate_verificationCode_key"; CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON public."Certificate"("recipientName");')
    Assert-That (-not (Query-Json $postcheckSql).certificateConstraints) 'wrong-certificate-column-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."Certificate_verificationCode_key"; CREATE UNIQUE INDEX "Certificate_verificationCode_key" ON public."Certificate"("verificationCode");')
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."Certificate_eventId_type_recipientKind_recipientId_version_key"; CREATE UNIQUE INDEX "Certificate_eventId_type_recipientKind_recipientId_version_key" ON public."Certificate"("eventId","type","recipientId","recipientKind","version");')
    Assert-That (-not (Query-Json $postcheckSql).certificateConstraints) 'wrong-certificate-order-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."Certificate_eventId_type_recipientKind_recipientId_version_key"; CREATE UNIQUE INDEX "Certificate_eventId_type_recipientKind_recipientId_version_key" ON public."Certificate"("eventId","type","recipientKind","recipientId","version");')
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."RateLimitBucket_key_key"; CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON public."RateLimitBucket"("count");')
    Assert-That (-not (Query-Json $postcheckSql).rateLimitBucket) 'wrong-rate-limit-column-rejected'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."RateLimitBucket_key_key"; CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON public."RateLimitBucket"("key");')
    $flowSql = Build-Sql 'flow' ([guid]::NewGuid().ToString('N'))
    $flowOutput = @(Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword $flowSql)
    $flowLine = @($flowOutput | Where-Object { $_.StartsWith("MIRACLE_LOCAL_CHECKPOINT`t") })
    Assert-That ($flowLine.Count -eq 1) 'flow-marker'
    $flow = $flowLine[0].Substring('MIRACLE_LOCAL_CHECKPOINT'.Length+1) | ConvertFrom-Json
    Assert-That ($flow.certificateUnique -and $flow.sessionIncrement -and $flow.resetOnePerUser -and $flow.resetConsumed -and $flow.rateLimitUnique) 'flow-result'
    $remaining = @(Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'SELECT (SELECT count(*) FROM public."User")+(SELECT count(*) FROM public."Event")+(SELECT count(*) FROM public."Certificate")+(SELECT count(*) FROM public."PasswordResetToken")+(SELECT count(*) FROM public."RateLimitBucket");')
    Assert-That ($remaining[-1] -eq '0') 'flow-rollback'
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword 'DROP INDEX public."PasswordResetToken_userId_key";')
    [void](Invoke-Sql 'synthetic_candidate' 'fixture_owner' $ownerPassword $flowSql -ExpectFailure)
    [Console]::WriteLine('SYNTHETIC_PG18_PASS catalog=10 flow=2 dumpRestore=1 port=' + $port + ' dumpExit=' + $pipeline.dumpExit + ' restoreExit=' + $pipeline.restoreExit)
} finally {
    if ($started) {
        try {
            Invoke-Tool ([IO.Path]::Combine($bin,'pg_ctl.exe')) ('-D "' + $data + '" -m fast -w -t 60 stop') 90000
            $stopped = $true
        } catch { [Console]::Error.WriteLine('FIXTURE_STOP_UNVERIFIED ' + $fixtureRoot) }
    }
    $approvedPrefix = [IO.Path]::Combine([IO.Path]::GetTempPath(),'miracle-task3-pg-')
    if ((-not $started -or $stopped) -and [IO.Directory]::Exists($fixtureRoot) -and
        $fixtureRoot.StartsWith($approvedPrefix,[StringComparison]::OrdinalIgnoreCase)) {
        [IO.Directory]::Delete($fixtureRoot,$true)
    }
}
