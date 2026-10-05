param([Parameter(Mandatory = $true)][string]$Directory)

$ErrorActionPreference = 'Stop'
try {
    $path = [IO.Path]::GetFullPath($Directory)
    if (-not [IO.Directory]::Exists($path)) { throw 'REJECTED' }
    $cursor = [IO.Path]::GetPathRoot($path)
    foreach ($part in $path.Substring($cursor.Length).TrimStart('\').Split('\')) {
        if (-not $part) { continue }
        $cursor = [IO.Path]::Combine($cursor, $part)
        if (([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REJECTED' }
    }
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($owner)
    $acl.SetAccessRuleProtection($true, $false)
    $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($owner,
        [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    [IO.Directory]::SetAccessControl($path, $acl)
    [Console]::WriteLine('CA_DIRECTORY_PROTECTED')
} catch {
    [Console]::Error.WriteLine('CA_DIRECTORY_REJECTED')
    exit 1
}
