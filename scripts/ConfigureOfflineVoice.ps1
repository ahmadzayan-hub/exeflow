# Author: Ahmed Zaian. Changes only four user environment values after explicit -Apply.
[CmdletBinding()]
param([switch]$Apply, [switch]$Restore)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Run this script on the Windows laptop.' }
if ($Apply -and $Restore) { throw 'Choose Apply or Restore, not both.' }
$settings = [ordered]@{
    OLLAMA_HOST = '127.0.0.1:11434'
    OLLAMA_NO_CLOUD = '1'
    OLLAMA_NUM_PARALLEL = '1'
    OLLAMA_MAX_LOADED_MODELS = '1'
}
$folder = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ExecFlowVoiceTrial'
$backup = Join-Path $folder 'Ollama Settings Before Change.json'
if (!$Apply -and !$Restore) {
    [ordered]@{ proposedUserEnvironment = $settings; userEnvironmentWritten = $false; runningServerVerified = $false } | ConvertTo-Json -Depth 4
    return
}
if ($Apply) {
    $previous = [ordered]@{}
    foreach ($name in $settings.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'User') }
    if (!(Test-Path -LiteralPath $backup)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        $previous | ConvertTo-Json | Out-File -LiteralPath $backup -Encoding utf8 -NoClobber
    } else {
        $saved = Get-Content -LiteralPath $backup -Raw | ConvertFrom-Json
        foreach ($name in $settings.Keys) {
            $property = $saved.PSObject.Properties[$name]
            if ($null -eq $property -or ($null -ne $property.Value -and $property.Value -isnot [string])) { throw "Existing backup is invalid: $name. Review before applying." }
        }
    }
    foreach ($name in $settings.Keys) { [Environment]::SetEnvironmentVariable($name, $settings[$name], 'User') }
} else {
    $previous = Get-Content -LiteralPath $backup -Raw | ConvertFrom-Json
    foreach ($name in $settings.Keys) {
        $property = $previous.PSObject.Properties[$name]
        if ($null -eq $property -or ($null -ne $property.Value -and $property.Value -isnot [string])) { throw "Backup is incomplete or invalid: $name" }
        if ([Environment]::GetEnvironmentVariable($name, 'User') -ne $settings[$name]) { throw "Settings changed since this profile was applied: $name. Review before restoring." }
    }
    foreach ($name in $settings.Keys) { [Environment]::SetEnvironmentVariable($name, $previous.PSObject.Properties[$name].Value, 'User') }
    Remove-Item -LiteralPath $backup
}
[ordered]@{
    operation = $(if ($Apply) { 'Apply' } else { 'Restore' })
    userEnvironmentWritten = $true
    runningServerVerified = $false
    offlineVerified = $false
    instructions = 'Close idle Ollama normally, then reopen it and use a fresh terminal. These server settings also affect Hermes if it shares Ollama. No process was stopped, model downloaded or firewall changed. Check the cloud-disabled log separately.'
} | ConvertTo-Json
