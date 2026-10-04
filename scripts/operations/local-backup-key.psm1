Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security -ErrorAction Stop

function Assert-KeyPath {
    param([string]$KeyDirectory, [string]$ApprovedRoot)
    if ($KeyDirectory -notmatch '^[A-Za-z]:[\\/]' -or $ApprovedRoot -notmatch '^[A-Za-z]:[\\/]' -or
        $KeyDirectory -match '(^|[\\/])\.{1,2}([\\/]|$)' -or $ApprovedRoot -match '(^|[\\/])\.{1,2}([\\/]|$)') { throw 'KEY_PATH_REJECTED' }
    try {
        $path = [IO.Path]::GetFullPath($KeyDirectory).TrimEnd('\')
        $approved = [IO.Path]::GetFullPath($ApprovedRoot).TrimEnd('\')
        if (-not [string]::Equals($path, $approved, [StringComparison]::OrdinalIgnoreCase)) { throw 'KEY_PATH_REJECTED' }
        $cursor = [IO.Path]::GetPathRoot($path)
        if ([string]::Equals($path, $cursor.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'KEY_PATH_REJECTED' }
        foreach ($part in $path.Substring($cursor.Length).TrimStart('\').Split('\')) {
            if (-not $part) { continue }
            $cursor = [IO.Path]::Combine($cursor, $part)
            if ([IO.File]::Exists($cursor) -or [IO.Directory]::Exists($cursor)) {
                if (([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'KEY_PATH_REJECTED' }
            }
        }
        return $path
    } catch { throw 'KEY_PATH_REJECTED' }
}

function Assert-KeyTools {
    param([string]$AgeKeygenPath, [string]$AgePath, [string]$ExpectedKeygenSha256, [string]$ExpectedAgeSha256)
    try {
        foreach ($entry in @(@{ path = $AgeKeygenPath; hash = $ExpectedKeygenSha256 }, @{ path = $AgePath; hash = $ExpectedAgeSha256 })) {
            if (-not [IO.File]::Exists($entry.path)) { throw 'TOOL_REJECTED' }
            $stream = [IO.File]::OpenRead($entry.path)
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
            finally { $sha.Dispose(); $stream.Dispose() }
            if ($actual -ine $entry.hash) { throw 'TOOL_REJECTED' }
        }
    } catch { throw 'TOOL_REJECTED' }
}

function New-OwnerAcl {
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($owner)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($owner, [Security.AccessControl.FileSystemRights]::FullControl,
        ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
        [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    return $acl
}

function Assert-OwnerAcl {
    param([string]$Path)
    try {
        $acl = [IO.Directory]::GetAccessControl($Path)
        $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner) { throw 'KEY_ACL_REJECTED' }
        $rules = @($acl.Access)
        if ($rules.Count -ne 1) { throw 'KEY_ACL_REJECTED' }
        $rule = $rules[0]
        if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $owner -or
            $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl -or
            ($rule.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ContainerInherit) -eq 0 -or
            ($rule.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ObjectInherit) -eq 0 -or
            $rule.PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) { throw 'KEY_ACL_REJECTED' }
    } catch { throw 'KEY_ACL_REJECTED' }
}

function Open-KeyDirectory {
    param([string]$KeyDirectory, [string]$ApprovedRoot, [switch]$Create)
    $path = Assert-KeyPath $KeyDirectory $ApprovedRoot
    if (-not [IO.Directory]::Exists($path)) {
        if (-not $Create) { throw 'KEY_MISSING' }
        $parent = [IO.Path]::GetDirectoryName($path)
        if (-not [IO.Directory]::Exists($parent)) { throw 'KEY_PATH_REJECTED' }
        try { [void][IO.Directory]::CreateDirectory($path, (New-OwnerAcl)) }
        catch { throw 'KEY_ACL_REJECTED' }
    }
    Assert-OwnerAcl $path
    return $path
}

function Invoke-AgeTool {
    param([string]$Path, [string[]]$Arguments, [byte[]]$InputBytes)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = New-Object Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = $Path
    $process.StartInfo.Arguments = ($Arguments -join ' ')
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardInput = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    try {
        if (-not $process.Start()) { throw 'KEY_REJECTED' }
        $output = New-Object IO.MemoryStream
        $stdoutTask = $process.StandardOutput.BaseStream.CopyToAsync($output)
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if ($InputBytes -and $InputBytes.Length) { $process.StandardInput.BaseStream.Write($InputBytes, 0, $InputBytes.Length) }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(15000)) { $process.Kill(); throw 'KEY_REJECTED' }
        [void]$stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0 -or $output.Length -gt 65536 -or $stderr.Length -gt 65536) { throw 'KEY_REJECTED' }
        return ,$output.ToArray()
    } catch { throw 'KEY_REJECTED' }
    finally { $process.Dispose() }
}

function Get-Identity {
    param([string]$Directory)
    $identityPath = [IO.Path]::Combine($Directory, 'identity.dpapi')
    if (-not [IO.File]::Exists($identityPath)) { throw 'KEY_MISSING' }
    try {
        $encrypted = [IO.File]::ReadAllBytes($identityPath)
        if ($encrypted.Length -gt 4096) { throw 'KEY_REJECTED' }
        return ,[Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    } catch { throw 'KEY_REJECTED' }
}

function Get-PublicRecipient {
    param([string]$Directory)
    try {
        $recipient = [IO.File]::ReadAllText([IO.Path]::Combine($Directory, 'recipient.txt')).Trim()
        if ($recipient -notmatch '^age1[0-9a-z]+$') { throw 'KEY_REJECTED' }
        return $recipient
    } catch { throw 'KEY_REJECTED' }
}

function Initialize-BackupKey {
    param([string]$KeyDirectory, [string]$ApprovedRoot, [string]$AgeKeygenPath, [string]$AgePath,
        [string]$ExpectedKeygenSha256, [string]$ExpectedAgeSha256)
    [void](Assert-KeyPath $KeyDirectory $ApprovedRoot)
    Assert-KeyTools $AgeKeygenPath $AgePath $ExpectedKeygenSha256 $ExpectedAgeSha256
    $directory = Open-KeyDirectory $KeyDirectory $ApprovedRoot -Create
    $identityPath = [IO.Path]::Combine($directory, 'identity.dpapi')
    $recipientPath = [IO.Path]::Combine($directory, 'recipient.txt')
    foreach ($artifact in @($identityPath, $recipientPath,
            [IO.Path]::Combine($directory, 'recovery-verified.json'),
            [IO.Path]::Combine($directory, 'copy-recovery-key.cmd'))) {
        if ([IO.File]::Exists($artifact) -or [IO.Directory]::Exists($artifact)) { throw 'KEY_EXISTS' }
    }
    $identity = $null
    [byte[]]$generated = Invoke-AgeTool $AgeKeygenPath @() @()
    try {
        $text = [Text.Encoding]::UTF8.GetString($generated)
        $match = [regex]::Match($text, '(?m)^AGE-SECRET-KEY-[A-Z0-9]+$')
        if (-not $match.Success) { throw 'KEY_REJECTED' }
        $identity = [Text.Encoding]::UTF8.GetBytes($match.Value + "`n")
        [byte[]]$recipientBytes = Invoke-AgeTool $AgeKeygenPath @('-y') $identity
        $recipient = [Text.Encoding]::UTF8.GetString($recipientBytes).Trim()
        if ($recipient -notmatch '^age1[0-9a-z]+$') { throw 'KEY_REJECTED' }
        $protected = [Security.Cryptography.ProtectedData]::Protect($identity, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $stream = New-Object IO.FileStream($identityPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($protected, 0, $protected.Length) } finally { $stream.Dispose() }
        $stream = New-Object IO.FileStream($recipientPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $bytes = [Text.Encoding]::UTF8.GetBytes($recipient + "`n"); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        return @{ status = 'INITIALIZED'; recipient = $recipient; warnings = @() }
    } catch { throw 'KEY_REJECTED' }
    finally { if ($generated) { [Array]::Clear($generated, 0, $generated.Length) }; if ($identity) { [Array]::Clear($identity, 0, $identity.Length) } }
}

function Get-BackupKeyStatus {
    param([string]$KeyDirectory, [string]$ApprovedRoot, [string]$AgeKeygenPath, [string]$AgePath,
        [string]$ExpectedKeygenSha256, [string]$ExpectedAgeSha256)
    Assert-KeyTools $AgeKeygenPath $AgePath $ExpectedKeygenSha256 $ExpectedAgeSha256
    $directory = Open-KeyDirectory $KeyDirectory $ApprovedRoot
    $identity = Get-Identity $directory
    try {
        $recipient = Get-PublicRecipient $directory
        $derived = [Text.Encoding]::UTF8.GetString((Invoke-AgeTool $AgeKeygenPath @('-y') $identity)).Trim()
        if ($derived -cne $recipient) { throw 'KEY_REJECTED' }
        $receipt = [IO.File]::Exists([IO.Path]::Combine($directory, 'recovery-verified.json'))
        return @{ status = 'LOCAL_KEY_PRESENT'; recipient = $recipient; recoveryVerified = $receipt; warnings = @('OWNER_ESCROW_UNCONFIRMED') }
    } catch { throw 'KEY_REJECTED' }
    finally { [Array]::Clear($identity, 0, $identity.Length) }
}

function Verify-BackupRecoveryCopy {
    param([string]$KeyDirectory, [string]$ApprovedRoot, [string]$AgeKeygenPath, [string]$AgePath,
        [string]$ExpectedKeygenSha256, [string]$ExpectedAgeSha256, [Security.SecureString]$CopiedIdentity)
    if (-not $CopiedIdentity) { throw 'KEY_REJECTED' }
    Assert-KeyTools $AgeKeygenPath $AgePath $ExpectedKeygenSha256 $ExpectedAgeSha256
    $directory = Open-KeyDirectory $KeyDirectory $ApprovedRoot
    $recipient = Get-PublicRecipient $directory
    $localIdentity = Get-Identity $directory
    $identity = $null
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($CopiedIdentity)
    try {
        $localRecipient = [Text.Encoding]::UTF8.GetString((Invoke-AgeTool $AgeKeygenPath @('-y') $localIdentity)).Trim()
        if ($localRecipient -cne $recipient) { throw 'KEY_REJECTED' }
        $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
        if ($secret -notmatch '^AGE-SECRET-KEY-[A-Z0-9]+$') { throw 'KEY_REJECTED' }
        $identity = [Text.Encoding]::UTF8.GetBytes($secret + "`n")
        $derived = [Text.Encoding]::UTF8.GetString((Invoke-AgeTool $AgeKeygenPath @('-y') $identity)).Trim()
        if ($derived -cne $recipient) { throw 'KEY_REJECTED' }
        $challenge = [Text.Encoding]::UTF8.GetBytes('Miracle synthetic recovery challenge 2026-10-04')
        $ciphertext = Invoke-AgeTool $AgePath @('-e', '-r', $recipient) $challenge
        $cipherPath = [IO.Path]::Combine($directory, ([guid]::NewGuid().ToString('N') + '.age'))
        $stream = New-Object IO.FileStream($cipherPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($ciphertext, 0, $ciphertext.Length) } finally { $stream.Dispose() }
        try {
            $plaintext = Invoke-AgeTool $AgePath @('-d', '-i', '-', ('"' + $cipherPath + '"')) $identity
            if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$plaintext, [byte[]]$challenge)) { throw 'KEY_REJECTED' }
        } finally { [IO.File]::Delete($cipherPath) }
        $receiptPath = [IO.Path]::Combine($directory, 'recovery-verified.json')
        $receipt = @{ status = 'RECOVERY_VERIFIED'; recipient = $recipient; verifiedAtUtc = [DateTime]::UtcNow.ToString('o'); note = 'Matching copied-back key; owner must confirm independent vault custody.' } | ConvertTo-Json -Compress
        $stream = New-Object IO.FileStream($receiptPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $bytes = [Text.Encoding]::UTF8.GetBytes($receipt); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        return @{ status = 'RECOVERY_VERIFIED'; recipient = $recipient; warnings = @('OWNER_ESCROW_UNCONFIRMED') }
    } catch { throw 'KEY_REJECTED' }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        if ($identity) { [Array]::Clear($identity, 0, $identity.Length) }
        [Array]::Clear($localIdentity, 0, $localIdentity.Length)
    }
}

function Copy-BackupRecoveryKey {
    param([string]$KeyDirectory, [string]$ApprovedRoot, [string]$AgeKeygenPath, [string]$AgePath,
        [string]$ExpectedKeygenSha256, [string]$ExpectedAgeSha256)
    Assert-KeyTools $AgeKeygenPath $AgePath $ExpectedKeygenSha256 $ExpectedAgeSha256
    $directory = Open-KeyDirectory $KeyDirectory $ApprovedRoot
    $identity = Get-Identity $directory
    try {
        $recipient = Get-PublicRecipient $directory
        $derived = [Text.Encoding]::UTF8.GetString((Invoke-AgeTool $AgeKeygenPath @('-y') $identity)).Trim()
        if ($derived -cne $recipient) { throw 'KEY_REJECTED' }
        $secret = [Text.Encoding]::UTF8.GetString($identity).Trim()
        Import-Module Microsoft.PowerShell.Management -ErrorAction Stop
        Set-Clipboard -Value $secret
        return @{ status = 'COPIED_TO_CLIPBOARD'; recipient = $recipient; warnings = @('CLEAR_CLIPBOARD_AFTER_TRANSFER') }
    } catch { throw 'KEY_REJECTED' }
    finally { [Array]::Clear($identity, 0, $identity.Length) }
}

function Assert-ArchiveFileAcl {
    param([string]$Path)
    if (-not [IO.File]::Exists($Path) -or
        ([IO.File]::GetAttributes($Path) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'ARCHIVE_VERIFY_FAILED' }
    $acl = [IO.File]::GetAccessControl($Path)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $rules = @($acl.Access)
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or $rules.Count -ne 1) { throw 'ARCHIVE_VERIFY_FAILED' }
    $rule = $rules[0]
    if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $owner -or
        $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'ARCHIVE_VERIFY_FAILED' }
}

function Assert-ArchiveTool {
    param([string]$Path, [string]$ExpectedSha256)
    [void](Assert-KeyPath $Path $Path)
    if (-not [IO.File]::Exists($Path) -or
        ([IO.File]::GetAttributes($Path) -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $ExpectedSha256 -notmatch '^[a-f0-9]{64}$') { throw 'ARCHIVE_VERIFY_FAILED' }
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $sha.Dispose(); $stream.Dispose() }
    if ($actual -ine $ExpectedSha256) { throw 'ARCHIVE_VERIFY_FAILED' }
}

function Test-BackupArchive {
    param([string]$KeyDirectory, [string]$ApprovedRoot, [string]$OutputDirectory, [string]$ApprovedOutputRoot,
        [string]$ArchivePath, [string]$AgePath, [string]$ExpectedAgeSha256,
        [string]$PgRestorePath, [string]$ExpectedPgRestoreSha256, [string[]]$PgRestoreArgsPrefix = @(),
        [int]$TimeoutMs = 7200000)
    $identity = $null
    $ageProcess = $null
    $restoreProcess = $null
    try {
        if ($TimeoutMs -lt 100 -or $TimeoutMs -gt 7200000) { throw 'ARCHIVE_VERIFY_FAILED' }
        $keyPath = Open-KeyDirectory $KeyDirectory $ApprovedRoot
        $outputPath = Assert-KeyPath $OutputDirectory $ApprovedOutputRoot
        if (-not [IO.Directory]::Exists($outputPath)) { throw 'ARCHIVE_VERIFY_FAILED' }
        Assert-OwnerAcl $outputPath
        $archive = [IO.Path]::GetFullPath($ArchivePath)
        if (-not [string]::Equals([IO.Path]::GetDirectoryName($archive), $outputPath, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetFileName($archive) -notmatch '^miracle-neondb-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.age$') { throw 'ARCHIVE_VERIFY_FAILED' }
        [void](Assert-KeyPath $archive $archive)
        $manifestPath = [IO.Path]::ChangeExtension($archive, '.json')
        Assert-ArchiveFileAcl $archive
        Assert-ArchiveFileAcl $manifestPath
        $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
        if ($manifest.archive -cne [IO.Path]::GetFileName($archive) -or
            $manifest.bytes -ne (New-Object IO.FileInfo($archive)).Length -or
            $manifest.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'ARCHIVE_VERIFY_FAILED' }
        $archiveStream = [IO.File]::OpenRead($archive)
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($archiveStream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose(); $archiveStream.Dispose() }
        if ($hash -cne $manifest.sha256) { throw 'ARCHIVE_VERIFY_FAILED' }
        Assert-ArchiveTool $AgePath $ExpectedAgeSha256
        Assert-ArchiveTool $PgRestorePath $ExpectedPgRestoreSha256
        $identity = Get-Identity $keyPath
        [void](Get-PublicRecipient $keyPath)
        $ageProcess = New-Object Diagnostics.Process
        $ageProcess.StartInfo = New-Object Diagnostics.ProcessStartInfo
        $ageProcess.StartInfo.FileName = $AgePath
        $ageProcess.StartInfo.Arguments = '--decrypt --identity - "' + $archive + '"'
        $ageProcess.StartInfo.UseShellExecute = $false
        $ageProcess.StartInfo.CreateNoWindow = $true
        $ageProcess.StartInfo.RedirectStandardInput = $true
        $ageProcess.StartInfo.RedirectStandardOutput = $true
        $ageProcess.StartInfo.RedirectStandardError = $true
        $restoreProcess = New-Object Diagnostics.Process
        $restoreProcess.StartInfo = New-Object Diagnostics.ProcessStartInfo
        $restoreProcess.StartInfo.FileName = $PgRestorePath
        $restoreProcess.StartInfo.Arguments = ((@($PgRestoreArgsPrefix) + @('--list', '-')) | ForEach-Object { '"' + $_ + '"' }) -join ' '
        $restoreProcess.StartInfo.UseShellExecute = $false
        $restoreProcess.StartInfo.CreateNoWindow = $true
        $restoreProcess.StartInfo.RedirectStandardInput = $true
        $restoreProcess.StartInfo.RedirectStandardOutput = $true
        $restoreProcess.StartInfo.RedirectStandardError = $true
        foreach ($process in @($ageProcess, $restoreProcess)) {
            foreach ($name in @($process.StartInfo.EnvironmentVariables.Keys)) {
                if ($name -match '^(PG|DATABASE_URL$|DIRECT_URL$|MIRACLE_BACKUP_)') {
                    [void]$process.StartInfo.EnvironmentVariables.Remove($name)
                }
            }
        }
        $clock = [Diagnostics.Stopwatch]::StartNew()
        if (-not $ageProcess.Start() -or -not $restoreProcess.Start()) { throw 'ARCHIVE_VERIFY_FAILED' }
        $copy = $ageProcess.StandardOutput.BaseStream.CopyToAsync($restoreProcess.StandardInput.BaseStream)
        $ageError = $ageProcess.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        $restoreOutput = $restoreProcess.StandardOutput.BaseStream.CopyToAsync([IO.Stream]::Null)
        $restoreError = $restoreProcess.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        $ageProcess.StandardInput.BaseStream.Write($identity, 0, $identity.Length)
        $ageProcess.StandardInput.Close()
        if (-not $copy.Wait([Math]::Max(1, $TimeoutMs - [int]$clock.ElapsedMilliseconds))) { throw 'ARCHIVE_VERIFY_FAILED' }
        [void]$copy.GetAwaiter().GetResult()
        $restoreProcess.StandardInput.Close()
        if (-not $ageProcess.WaitForExit([Math]::Max(1, $TimeoutMs - [int]$clock.ElapsedMilliseconds)) -or
            -not $restoreProcess.WaitForExit([Math]::Max(1, $TimeoutMs - [int]$clock.ElapsedMilliseconds))) { throw 'ARCHIVE_VERIFY_FAILED' }
        foreach ($task in @($ageError, $restoreOutput, $restoreError)) {
            if (-not $task.Wait([Math]::Max(1, $TimeoutMs - [int]$clock.ElapsedMilliseconds))) { throw 'ARCHIVE_VERIFY_FAILED' }
            [void]$task.GetAwaiter().GetResult()
        }
        if ($ageProcess.ExitCode -ne 0 -or $restoreProcess.ExitCode -ne 0) { throw 'ARCHIVE_VERIFY_FAILED' }
        return @{ status = 'ARCHIVE_VERIFIED'; bytes = $manifest.bytes; sha256 = $hash }
    } catch { throw 'ARCHIVE_VERIFY_FAILED' }
    finally {
        if ($ageProcess) { try { if (-not $ageProcess.HasExited) { $ageProcess.Kill() } } catch {}; $ageProcess.Dispose() }
        if ($restoreProcess) { try { if (-not $restoreProcess.HasExited) { $restoreProcess.Kill() } } catch {}; $restoreProcess.Dispose() }
        if ($identity) { [Array]::Clear($identity, 0, $identity.Length) }
    }
}

Export-ModuleMember -Function Initialize-BackupKey, Get-BackupKeyStatus, Verify-BackupRecoveryCopy, Copy-BackupRecoveryKey, Test-BackupArchive
