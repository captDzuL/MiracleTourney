param([Parameter(Mandatory = $true)][string]$Directory, [string]$RequiredNames = '')

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
    $acl = [IO.Directory]::GetAccessControl($path)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner) { throw 'REJECTED' }
    $rules = @($acl.Access)
    if ($rules.Count -ne 1) { throw 'REJECTED' }
    $rule = $rules[0]
    if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $owner -or
        $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl -or
        ($rule.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ContainerInherit) -eq 0 -or
        ($rule.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ObjectInherit) -eq 0 -or
        $rule.PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) { throw 'REJECTED' }
    foreach ($name in $RequiredNames.Split(',')) {
        if (-not $name) { continue }
        if ($name -notmatch '^[a-z0-9_.-]+$') { throw 'REJECTED' }
        $file = [IO.Path]::Combine($path, $name)
        if (-not [IO.File]::Exists($file) -or
            ([IO.File]::GetAttributes($file) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REJECTED' }
        $fileAcl = [IO.File]::GetAccessControl($file)
        $fileRules = @($fileAcl.Access)
        if ($fileAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or $fileRules.Count -ne 1) { throw 'REJECTED' }
        $fileRule = $fileRules[0]
        if ($fileRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $owner -or
            $fileRule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            ($fileRule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'REJECTED' }
    }
    [Console]::WriteLine('DIRECTORY_SAFE')
} catch {
    [Console]::Error.WriteLine('DIRECTORY_REJECTED')
    exit 1
}
