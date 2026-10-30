param([string]$Destination)
$ErrorActionPreference='Stop'
$packageRoot=Split-Path -Parent $PSScriptRoot
$launcher=Join-Path $PSScriptRoot 'launcher.ps1'
$icon=Join-Path $packageRoot 'icons\bridge.ico'
if(!(Test-Path -LiteralPath $launcher)){throw 'Bridge launcher is missing.'}
if(!(Test-Path -LiteralPath $icon)){throw 'Bridge icon is missing.'}
if(!$Destination){$Destination=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex QQ Bridge.lnk'}
if([IO.Path]::GetExtension($Destination) -ne '.lnk'){throw 'Destination must be a .lnk file.'}
$shortcutPath=[IO.Path]::GetFullPath($Destination)
$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$launcher+'"'
$shortcut.WorkingDirectory=$packageRoot
$shortcut.IconLocation=$icon+',0'
$shortcut.Description='Codex QQ Bridge - local QQ bot control center'
$shortcut.WindowStyle=7
$shortcut.Save()
Write-Output ('Created shortcut: '+$shortcutPath)
