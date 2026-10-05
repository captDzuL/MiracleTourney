param(
    [Parameter(Mandatory = $true)][string]$RunName,
    [Parameter(Mandatory = $true)][string]$ZipPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Fail { throw 'RUNTIME_REJECTED' }
function Hash-Stream([IO.Stream]$Stream) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($Stream)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Assert-NoReparse([string]$Path) {
    $cursor = [IO.Path]::GetPathRoot($Path)
    foreach ($part in $Path.Substring($cursor.Length).TrimStart('\').Split('\')) {
        if (-not $part) { continue }
        $cursor = [IO.Path]::Combine($cursor, $part)
        if (([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail }
    }
}
function Assert-OwnerDirectory([string]$Path) {
    $acl = [IO.Directory]::GetAccessControl($Path)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $rules = @($acl.Access)
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or
        $rules.Count -ne 1 -or $rules[0].IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $owner -or
        $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        ($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { Fail }
}

try {
    $root = 'E:\MiracleBackups'
    $approvedZip = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.superpowers\sdd\2026-10-04-local-encrypted-backup\runtime\postgresql-18.6-windows-x64-binaries.zip'))
    if ($RunName -cnotmatch '^rehearsal-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$' -or
        -not [string]::Equals([IO.Path]::GetFullPath($ZipPath), $approvedZip, [StringComparison]::OrdinalIgnoreCase)) { Fail }
    Assert-NoReparse $root
    Assert-OwnerDirectory $root
    Assert-NoReparse $approvedZip
    $zipFile = New-Object IO.FileInfo($approvedZip)
    if ($zipFile.Length -ne 384620317) { Fail }
    $stream = [IO.File]::OpenRead($approvedZip)
    try { if ((Hash-Stream $stream) -cne 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2') { Fail } }
    finally { $stream.Dispose() }
    $run = [IO.Path]::Combine($root, $RunName)
    if ([IO.File]::Exists($run) -or [IO.Directory]::Exists($run)) { Fail }
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($owner)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($owner, [Security.AccessControl.FileSystemRights]::FullControl,
        ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
        [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    [void][IO.Directory]::CreateDirectory($run, $acl)
    Assert-OwnerDirectory $run
    $server = [IO.Path]::Combine($run, 'server')
    [IO.Compression.ZipFile]::ExtractToDirectory($approvedZip, $server)
    $zip = [IO.Compression.ZipFile]::OpenRead($approvedZip)
    try {
        foreach ($name in @('initdb.exe', 'pg_ctl.exe', 'postgres.exe', 'psql.exe')) {
            $relative = 'pgsql/bin/' + $name
            $entry = $zip.GetEntry($relative)
            $extracted = [IO.Path]::Combine($server, 'pgsql', 'bin', $name)
            if (-not $entry -or -not [IO.File]::Exists($extracted)) { Fail }
            Assert-NoReparse $extracted
            $expectedStream = $entry.Open()
            try { $expected = Hash-Stream $expectedStream } finally { $expectedStream.Dispose() }
            $actualStream = [IO.File]::OpenRead($extracted)
            try { $actual = Hash-Stream $actualStream } finally { $actualStream.Dispose() }
            if ($actual -cne $expected) { Fail }
        }
    } finally { $zip.Dispose() }
    [Console]::WriteLine('REHEARSAL_DIRECTORY_READY')
} catch {
    [Console]::Error.WriteLine('RUNTIME_REJECTED')
    exit 1
}
