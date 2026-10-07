$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'fixture-safety.ps1')
Add-Type -Path (Join-Path $PSScriptRoot 'FixtureBoundedProcess.cs')

function Assert-That([bool]$Condition, [string]$Label) { if (-not $Condition) { throw "SAFETY_TEST_FAILED:$Label" } }
function Expect-Failure([scriptblock]$Action, [string]$Marker) {
    try { & $Action; throw 'SAFETY_TEST_EXPECTED_FAILURE' }
    catch { Assert-That ($_.Exception.Message -like "*$Marker*") "expected-$Marker-actual-$($_.Exception.Message)" }
}

$calls = New-Object System.Collections.Generic.List[string]
Invoke-OwnedClusterCleanup $true { $calls.Add('stop') > $null } { $calls.Add('status') > $null; $true } { $calls.Add('cleanup') > $null }
Assert-That (($calls -join ',') -eq 'stop,status,cleanup') 'partial-start-stops-before-cleanup'
$calls.Clear()
Expect-Failure { Invoke-OwnedClusterCleanup $true { $calls.Add('stop') > $null; throw 'timeout' } { $calls.Add('status') > $null; $false } { $calls.Add('cleanup') > $null } } 'FIXTURE_STOP_UNVERIFIED'
Assert-That (($calls -join ',') -eq 'stop,status') 'stop-failure-retains-owned-root'
$calls.Clear()
Invoke-OwnedClusterCleanup $true { $calls.Add('stop') > $null; throw 'already stopped' } { $calls.Add('status') > $null; $true } { $calls.Add('cleanup') > $null }
Assert-That (($calls -join ',') -eq 'stop,status,cleanup') 'verified-no-running-instance-cleanup'

$node = (Get-Command node).Source
function New-NodeStart([string]$Script) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $node
    $info.Arguments = '-e "' + $Script.Replace('"','\"') + '"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    return $info
}
$oversize = New-NodeStart 'process.stdout.write("A".repeat(100000));process.stderr.write("B".repeat(100000));'
Expect-Failure { [void][FixtureBoundedProcess]::Run($oversize, 3000, 500, 1024, 1024) } 'FIXTURE_CHILD_OUTPUT_LIMIT'
$stderrOversize = New-NodeStart 'process.stderr.write("B".repeat(100000));'
Expect-Failure { [void][FixtureBoundedProcess]::Run($stderrOversize, 3000, 500, 1024, 1024) } 'FIXTURE_CHILD_OUTPUT_LIMIT'
$slowExit = New-NodeStart 'setTimeout(()=>{},3000);'
Expect-Failure { [void][FixtureBoundedProcess]::Run($slowExit, 150, 500, 1024, 1024) } 'FIXTURE_CHILD_EXIT_TIMEOUT'

$pendingDrain = New-Object 'Threading.Tasks.TaskCompletionSource[bool]'
$completedDrain = [Threading.Tasks.Task]::FromResult($true)
$watch = [Diagnostics.Stopwatch]::StartNew()
Expect-Failure { [FixtureBoundedProcess]::WaitForDrain($pendingDrain.Task, $completedDrain, 200) } 'FIXTURE_CHILD_DRAIN_TIMEOUT'
$watch.Stop()
Assert-That ($watch.ElapsedMilliseconds -lt 1500) 'pending-stream-bounded-drain'
[Console]::WriteLine('FIXTURE_SAFETY_PASS cleanup=3 stdoutOverflow=1 stderrOverflow=1 exitTimeout=1 pendingDrainTimeout=1')
