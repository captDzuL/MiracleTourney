param([switch]$RepairFixture)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$bin = Join-Path $repo '.superpowers/sdd/2026-10-04-v3-release-pr-readiness/runtime/catalog-server/pgsql/bin'
$owned = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'miracle-task12-reference-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $owned 'cluster'
$started = $false
$port = 0

function Invoke-Pinned([string]$tool, [string[]]$arguments) {
  $saved = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($tool -eq 'pg_ctl.exe') {
      # The postmaster retains inherited handles; never redirect this launcher.
      & (Join-Path $bin $tool) @arguments
    } else {
      & (Join-Path $bin $tool) @arguments 1>$null 2>$null
    }
    if ($LASTEXITCODE -ne 0) { throw "SYNTHETIC_TOOL_FAILED:$tool`:$script:stage" }
  } finally { $ErrorActionPreference = $saved }
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $bin 'initdb.exe'))) { throw 'SYNTHETIC_RUNTIME_MISSING' }
  [void][IO.Directory]::CreateDirectory($owned)
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse('127.0.0.1'), 0)
  $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $randomBytes = New-Object byte[] 32
  $rng.GetBytes($randomBytes)
  $bootstrapPassword = [BitConverter]::ToString($randomBytes).Replace('-', '')
  $rng.GetBytes($randomBytes)
  $appPassword = [BitConverter]::ToString($randomBytes).Replace('-', '')
  $rng.Dispose()
  $pwfile = Join-Path $owned 'initdb-pw.txt'
  [IO.File]::WriteAllText($pwfile, $bootstrapPassword + "`n")
  try { Invoke-Pinned 'initdb.exe' @('-D', $data, '-U', 'fixture_bootstrap', '--auth-host=scram-sha-256', '--auth-local=reject', "--pwfile=$pwfile", '--encoding=UTF8', '--no-instructions') }
  finally { Remove-Item -LiteralPath $pwfile -Force -ErrorAction SilentlyContinue }
  [IO.File]::AppendAllText((Join-Path $data 'postgresql.conf'), "`nlisten_addresses='127.0.0.1'`nport=$port`npassword_encryption='scram-sha-256'`nlog_statement='none'`nlog_min_error_statement='panic'`n")
  [IO.File]::WriteAllText((Join-Path $data 'pg_hba.conf'), "host all all 127.0.0.1/32 scram-sha-256`nhost all all ::1/128 reject`nlocal all all reject`n")
  Invoke-Pinned 'pg_ctl.exe' @('-D', $data, '-l', (Join-Path $owned 'server.log'), '-w', '-t', '60', 'start')
  $started = $true
  $env:PGHOST = '127.0.0.1'; $env:PGPORT = [string]$port; $env:PGSSLMODE = 'disable'
  $env:PGUSER = 'fixture_bootstrap'; $env:PGPASSWORD = $bootstrapPassword; $env:PGDATABASE = 'postgres'
  Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-c', "CREATE ROLE fixture_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$appPassword';")
  Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-c', 'CREATE DATABASE task12_reference OWNER fixture_owner TEMPLATE template0 ENCODING ''UTF8'';')
  $env:PGUSER = 'fixture_owner'; $env:PGPASSWORD = $appPassword; $env:PGDATABASE = 'task12_reference'
  $migrations = @(Get-ChildItem -LiteralPath (Join-Path $repo 'prisma/migrations') -Directory | Sort-Object Name)
  if ($migrations.Count -ne 37) { throw 'CANONICAL_MIGRATION_COUNT_REJECTED' }
  $selected = if ($RepairFixture) { @($migrations | Select-Object -First 17) } else { $migrations }
  foreach ($migration in $selected) {
    $script:stage = $migration.Name
    $sql = Join-Path $migration.FullName 'migration.sql'
    if (-not (Test-Path -LiteralPath $sql)) { throw 'CANONICAL_SQL_MISSING' }
    Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-f', $sql)
  }
  if ($RepairFixture) {
    $script:stage = 'setup'
    $legacySql = & node (Join-Path $PSScriptRoot 'testing-schema-synthetic-check.mjs') 'legacy-sql'
    if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_LEGACY_DDL_FAILED' }
    $legacyFile = Join-Path $owned 'legacy.sql'
    [IO.File]::WriteAllText($legacyFile, ($legacySql -join "`n") + "`n")
    Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-f', $legacyFile)
    $setup = @'
INSERT INTO "User" (id,email,name,role,"passwordHash","updatedAt") VALUES ('user1','synthetic@example.test','Synthetic','organizer','hash',now());
INSERT INTO "Event" (id,slug,name,description,"gameId","gameModeId",format,status,"participantCap","registrationWindow","startsAt",venue,"updatedAt")
  VALUES ('event1','synthetic','Synthetic event','test','game','mode','single_elimination','Finished',8,'open','later','test',now());
INSERT INTO "Team" (id,"eventId",name,"logoText",tag) VALUES ('team1','event1','Synthetic team','T','ST');
INSERT INTO "Match" (id,"eventId","roundLabel","homeTeamId","awayTeamId","updatedAt")
  VALUES ('match1','event1','Final','team1','team1',now());
INSERT INTO "Certificate" (id,"eventId","teamId","imageUrl") VALUES ('cert1','event1','team1','https://example.test/cert.png');
INSERT INTO "CheckIn" (id,"eventId","teamId",method) VALUES ('check1','event1','team1','manual');
INSERT INTO "EventAnalyticsSnapshot" (id,"eventId",date,"pageViews","uniqueVisitors",registrations,"shareClicks",metrics)
  VALUES ('analytics1','event1',now(),2,1,1,1,'{}');
INSERT INTO "EventPromotion" (id,"eventId",type,"startsAt","endsAt",config,active,"createdAt")
  VALUES ('promo1','event1','featured',now(),now() + interval '1 day','{}',true,now());
INSERT INTO "Notification" (id,"userId",type,title,body,channel,"sentAt")
  VALUES ('notice1','user1','status','Title','Body','email',now());
INSERT INTO "OrganizerPlan" (id,"userId",tier,"startsAt","maxEvents",features,"createdAt","updatedAt")
  VALUES ('plan1','user1','basic',now(),2,'{}',now(),now());
'@
    $setupFile = Join-Path $owned 'setup.sql'
    [IO.File]::WriteAllText($setupFile, $setup)
    Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-f', $setupFile)
    $ledgerSql = ''
    foreach ($migration in $migrations) {
      $bytes = [Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText((Join-Path $migration.FullName 'migration.sql')).Replace("`r`n", "`n"))
      $sha = [Security.Cryptography.SHA256]::Create()
      try { $digest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
      finally { $sha.Dispose() }
      $name = $migration.Name
      $id = [guid]::NewGuid().ToString()
      $ledgerSql += "INSERT INTO `"_prisma_migrations`" (id,migration_name,checksum,finished_at) VALUES ('$id','$name','$digest',now());`n"
    }
    $ledgerFile = Join-Path $owned 'ledger.sql'
    [IO.File]::WriteAllText($ledgerFile, $ledgerSql)
    $script:stage = 'ledger'
    Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-f', $ledgerFile)
    $functionSource = [IO.File]::ReadAllText((Join-Path $repo 'prisma/migrations/20260912000000_competition_operations_v3_foundation/migration.sql'))
    $functionSql = [regex]::Match($functionSource, 'CREATE FUNCTION "enforce_match_result_revision"\(\) RETURNS TRIGGER AS \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;').Value
    if (-not $functionSql) { throw 'CANONICAL_FUNCTION_MISSING' }
    $script:stage = 'function'
    $functionFile = Join-Path $owned 'function.sql'
    [IO.File]::WriteAllText($functionFile, $functionSql)
    Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '-f', $functionFile)
    $env:TASK12_SYNTHETIC_URL = "postgresql://fixture_owner:${appPassword}@127.0.0.1:${port}/task12_reference"
    $snapshot = Join-Path $owned 'before.json'
    $script:stage = 'before'
    & node (Join-Path $PSScriptRoot 'testing-schema-synthetic-check.mjs') 'before' $snapshot
    if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_BASELINE_MISMATCH' }
    $script:stage = 'rollback'
    $savedPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & (Join-Path $bin 'psql.exe') -X -w -v ON_ERROR_STOP=1 -q --single-transaction -f (Join-Path $repo 'scripts/operations/testing-schema-repair.sql') -c 'SELECT 1 / 0' 1>$null 2>$null
      if ($LASTEXITCODE -eq 0) { throw 'SYNTHETIC_ROLLBACK_NOT_TRIGGERED' }
    } finally { $ErrorActionPreference = $savedPreference }
    & node (Join-Path $PSScriptRoot 'testing-schema-synthetic-check.mjs') 'rollback' $snapshot
    if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_ROLLBACK_DRIFT' }
    $script:stage = 'repair'
    Invoke-Pinned 'psql.exe' @('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-q', '--single-transaction', '-f', (Join-Path $repo 'scripts/operations/testing-schema-repair.sql'))
    & node (Join-Path $PSScriptRoot 'testing-schema-synthetic-check.mjs') 'after' $snapshot
    if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_REPAIR_DRIFT' }
    & node (Join-Path $PSScriptRoot 'testing-schema-synthetic-check.mjs') 'noop' $snapshot
    if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_NOOP_DRIFT' }
  }
  if (-not $RepairFixture) { Write-Output 'SYNTHETIC_REFERENCE_APPLIED' }
} finally {
  if ($started) {
    & (Join-Path $bin 'pg_ctl.exe') -D $data -m immediate -w -t 60 stop
    if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_STOP_FAILED' }
  }
  $resolved = [IO.Path]::GetFullPath($owned)
  $expectedPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\miracle-task12-reference-'
  if ($resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid'))) {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
  }
  foreach ($key in @('PGHOST','PGPORT','PGSSLMODE','PGUSER','PGPASSWORD','PGDATABASE','TASK12_SYNTHETIC_URL')) { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
}
