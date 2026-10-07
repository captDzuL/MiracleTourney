function Invoke-OwnedClusterCleanup([bool]$StartAttempted, [scriptblock]$StopExact,
    [scriptblock]$VerifyStopped, [scriptblock]$CleanupOwned) {
    if ($StartAttempted) {
        # A failed start can still leave the exact owned postmaster running.
        try { & $StopExact } catch { }
        $verifiedStopped = $false
        try { $verifiedStopped = (& $VerifyStopped) -eq $true } catch { }
        if (-not $verifiedStopped) { throw 'FIXTURE_STOP_UNVERIFIED' }
    }
    & $CleanupOwned
}
