[CmdletBinding()]
param(
  [switch]$DownloadRelease,
  [string]$InstallDir,
  [string]$DataHome,
  [string[]]$OwnerUserIds,
  [string[]]$AllowedGroups,
  [string]$PersonaFile,
  [string]$Model,
  [string]$CodexPath,
  [string]$QQPath,
  [string]$Name,
  [string[]]$Aliases,
  [switch]$NoLaunch
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT' -or ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64')){throw 'Codex QQ Bridge bootstrap requires Windows x64'}
$supplied=@{};foreach($key in $PSBoundParameters.Keys){$supplied[$key]=$true}
$packageRoot=Split-Path -Parent $PSScriptRoot
$repository='mingjiefan88/Agent-QQ-Bridge'
function Read-Json([string]$Path){try{Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop}catch{throw ('Unable to read JSON; original file preserved: '+$Path)}}
function Assert-Within([string]$Base,[string]$Target){
  $baseFull=[IO.Path]::GetFullPath($Base).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  $targetFull=[IO.Path]::GetFullPath($Target)
  if(!$targetFull.StartsWith($baseFull,[StringComparison]::OrdinalIgnoreCase)){throw 'Path escaped its intended directory'}
}
function Get-Sha256([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Install-LatestRelease {
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $headers=@{'User-Agent'='Codex-QQ-Bridge-bootstrap';Accept='application/vnd.github+json'}
  $release=Invoke-RestMethod -Uri ('https://api.github.com/repos/'+$repository+'/releases/latest') -Headers $headers -TimeoutSec 30
  if($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v?(\d+\.\d+\.\d+)$'){throw 'Latest release is not a stable semantic version'}
  $releaseVersion=$Matches[1]
  $assetName='Codex-QQ-Bridge-'+$releaseVersion+'-Windows-x64.zip'
  $asset=@($release.assets | Where-Object name -eq $assetName)
  $digestAsset=@($release.assets | Where-Object name -eq ($assetName+'.sha256'))
  if($asset.Count -ne 1 -or $digestAsset.Count -ne 1){throw ('Stable release is missing '+$assetName+' or its .sha256 file')}
  $destination=if($InstallDir){[IO.Path]::GetFullPath($InstallDir)}else{Join-Path $env:LOCALAPPDATA ('Programs\CodexQQBridge\'+$releaseVersion)}
  $alreadyInstalled=(Test-Path -LiteralPath $destination) -and @(Get-ChildItem -LiteralPath $destination -Force).Count -gt 0
  $tempRoot=Join-Path ([IO.Path]::GetTempPath()) ('CodexQQBridge-bootstrap-'+[Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  try{
    $zipPath=Join-Path $tempRoot $assetName;$sumPath=$zipPath+'.sha256'
    foreach($pair in @(@($asset[0],$zipPath),@($digestAsset[0],$sumPath))){
      $url=[string]$pair[0].browser_download_url
      if(!$url.StartsWith(('https://github.com/'+$repository+'/releases/download/'),[StringComparison]::Ordinal)){throw 'Unexpected release asset origin'}
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $pair[1] -Headers $headers -TimeoutSec 300
    }
    $line=(Get-Content -LiteralPath $sumPath -Raw).Trim()
    if($line -notmatch '^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)$' -or $Matches[2] -ne $assetName){throw 'Invalid release checksum file'}
    if((Get-Sha256 $zipPath) -ne $Matches[1].ToLowerInvariant()){throw 'Release archive SHA256 mismatch; nothing installed'}
    $extract=Join-Path $tempRoot 'unpacked';New-Item -ItemType Directory -Path $extract | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($zipPath)
    try{
      foreach($entry in $zip.Entries){
        if($entry.FullName -match '(^|[\\/])\.\.([\\/]|$)|:|^[\\/]' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Unsafe archive entry'}
        Assert-Within $extract (Join-Path $extract $entry.FullName)
      }
    }finally{$zip.Dispose()}
    [IO.Compression.ZipFile]::ExtractToDirectory($zipPath,$extract)
    $payload=Join-Path $extract 'Codex-QQ-Bridge'
    if(!(Test-Path -LiteralPath (Join-Path $payload 'package.json'))){throw 'Unexpected release directory layout'}
    $manifest=Read-Json (Join-Path $payload 'package.json')
    if($manifest.name -ne 'codex-qq-bridge' -or $manifest.version -ne $releaseVersion){throw 'Release version does not match package metadata'}
    $checksums=Join-Path $payload 'SHA256SUMS.txt'
    if(!(Test-Path -LiteralPath $checksums)){throw 'Package has no internal checksum manifest'}
    $listed=@{}
    foreach($item in Get-Content -LiteralPath $checksums){
      if(!$item.Trim()){continue}
      if($item -notmatch '^([a-fA-F0-9]{64})\s+\*?(.+)$'){throw 'Invalid internal checksum manifest'}
      $expected=$Matches[1].ToLowerInvariant();$relative=$Matches[2]
      $file=Join-Path $payload $relative;Assert-Within $payload $file
      $canonical=[IO.Path]::GetFullPath($file)
      if($listed.ContainsKey($canonical)){throw 'Duplicate checksum entry'}
      $listed[$canonical]=$true
      if(!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Sha256 $file) -ne $expected){throw ('Internal checksum mismatch: '+$relative)}
    }
    foreach($file in Get-ChildItem -LiteralPath $payload -Recurse -File){
      if($file.FullName -ne $checksums -and !$listed.ContainsKey($file.FullName)){throw ('Unlisted package file: '+$file.Name)}
    }
    if($alreadyInstalled){
      $expectedInstalled=@{}
      foreach($file in Get-ChildItem -LiteralPath $payload -Recurse -File){
        $relative=$file.FullName.Substring($payload.Length+1);$installed=Join-Path $destination $relative
        $expectedInstalled[[IO.Path]::GetFullPath($installed)]=$true
        if(!(Test-Path -LiteralPath $installed -PathType Leaf) -or (Get-Sha256 $installed) -ne (Get-Sha256 $file.FullName)){throw ('InstallDir contains a different or modified installation; select a new directory: '+$destination)}
      }
      foreach($entry in Get-ChildItem -LiteralPath $destination -Recurse -Force){
        if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (!$entry.PSIsContainer -and !$expectedInstalled.ContainsKey($entry.FullName))){throw ('InstallDir contains additional files or links; select a new directory: '+$destination)}
      }
      return $destination
    }
    $parent=Split-Path -Parent $destination;New-Item -ItemType Directory -Path $parent -Force | Out-Null
    if(!(Test-Path -LiteralPath $destination)){New-Item -ItemType Directory -Path $destination | Out-Null}
    foreach($child in Get-ChildItem -LiteralPath $payload -Force){Copy-Item -LiteralPath $child.FullName -Destination $destination -Recurse}
    return $destination
  }finally{
    Assert-Within ([IO.Path]::GetTempPath()) $tempRoot
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
if($DownloadRelease){$packageRoot=Install-LatestRelease}
if(!(Test-Path -LiteralPath (Join-Path $packageRoot 'src\config.js'))){throw 'Run this script from a complete package, or pass -DownloadRelease'}
if(!$DataHome){$DataHome=if($env:CODEX_QQ_HOME){$env:CODEX_QQ_HOME}else{Join-Path $env:LOCALAPPDATA 'CodexQQBridge'}}
$DataHome=[IO.Path]::GetFullPath($DataHome)
$configFile=Join-Path $DataHome 'config.json'
$existing=if(Test-Path -LiteralPath $configFile){Read-Json $configFile}else{$null}
$consolePort=if($existing){[int]$existing.port}else{3790}
if(@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq $consolePort).Count){throw 'A service is listening on the console port. Stop this installation console before applying bootstrap settings; no process was stopped.'}
$patch=@{}
foreach($mapping in @(@('OwnerUserIds','ownerUserIds'),@('AllowedGroups','allowedGroups'),@('Model','model'),@('Name','name'),@('Aliases','aliases'))){
  if($supplied.ContainsKey($mapping[0])){$value=Get-Variable -Name $mapping[0] -ValueOnly;if($mapping[0] -in @('OwnerUserIds','AllowedGroups','Aliases')){$patch[$mapping[1]]=@($value)}else{$patch[$mapping[1]]=$value}}
}
if($supplied.ContainsKey('PersonaFile')){$patch.persona=Get-Content -LiteralPath $PersonaFile -Raw -Encoding UTF8}
if($supplied.ContainsKey('CodexPath')){if(!(Test-Path -LiteralPath $CodexPath -PathType Leaf) -or [IO.Path]::GetExtension($CodexPath) -ne '.exe'){throw 'CodexPath must identify an actual codex.exe'};$patch.codexPath=[IO.Path]::GetFullPath($CodexPath)}
elseif(!$existing -or !$existing.codexPath -or $existing.codexPath -eq 'codex'){
  $codex=Get-Command codex.exe -ErrorAction SilentlyContinue
  if($codex){$patch.codexPath=$codex.Source}else{
    $codexBins=Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if(Test-Path -LiteralPath $codexBins){$candidate=Get-ChildItem -LiteralPath $codexBins -Filter codex.exe -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1;if($candidate){$patch.codexPath=$candidate.FullName}}
  }
}
if($supplied.ContainsKey('QQPath')){if(!(Test-Path -LiteralPath $QQPath -PathType Leaf) -or [IO.Path]::GetFileName($QQPath) -ine 'QQ.exe'){throw 'QQPath must identify the installed official QQ.exe'};$patch.qqPath=[IO.Path]::GetFullPath($QQPath)}
elseif(!$existing -or !$existing.qqPath){
  $candidates=@()
  foreach($key in @('HKCU:\Software\Tencent\QQNT','HKLM:\Software\Tencent\QQNT','HKLM:\Software\WOW6432Node\Tencent\QQNT')){
    $entry=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
    foreach($field in @('InstallPath','InstallLocation','Path')){if($entry -and $entry.$field){$candidates+=Join-Path ([string]$entry.$field) 'QQ.exe'}}
  }
  foreach($base in @($env:ProgramFiles,${env:ProgramFiles(x86)},$env:LOCALAPPDATA)){if($base){$candidates+=Join-Path $base 'Tencent\QQNT\QQ.exe';$candidates+=Join-Path $base 'Programs\Tencent\QQNT\QQ.exe'}}
  $found=@($candidates | Select-Object -Unique | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf})
  if($found.Count -eq 1){$patch.qqPath=[IO.Path]::GetFullPath($found[0])}elseif($found.Count -gt 1){Write-Warning 'Multiple QQ clients found. Select the intended QQ.exe in the console or pass -QQPath.'}
}
. (Join-Path $packageRoot 'scripts\node-runtime.ps1')
$nodePath=Resolve-BridgeNode $packageRoot $DataHome
$apply=@'
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [packageRoot,root]=process.argv.slice(2);
const {defaults,validateConfig,saveConfig}=await import(pathToFileURL(join(packageRoot,'src','config.js')));
let previous;try{previous=JSON.parse(await readFile(join(root,'config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const patch=JSON.parse(process.env.CODEX_QQ_BOOTSTRAP_PATCH);
const next=validateConfig({...previous || defaults(),...patch});
await saveConfig(root,next);
console.log(JSON.stringify({configured:true,owners:next.ownerUserIds.length,groups:next.allowedGroups.length,codexDetected:next.codexPath!=='codex',qqDetected:Boolean(next.qqPath),completed:next.completed}));
'@
$previousPatch=$env:CODEX_QQ_BOOTSTRAP_PATCH
try{$env:CODEX_QQ_BOOTSTRAP_PATCH=ConvertTo-Json -InputObject $patch -Depth 10 -Compress;$apply | & $nodePath --input-type=module - $packageRoot $DataHome;if($LASTEXITCODE -ne 0){throw 'Private configuration validation failed; check the error above'}}finally{$env:CODEX_QQ_BOOTSTRAP_PATCH=$previousPatch}
Write-Output ('Package: '+$packageRoot)
Write-Output ('Private data: '+$DataHome)
if(!$NoLaunch){
  # Start only the control center. Deliberately omit --auto-start: installation is not QQ send authorization.
  $logs=Join-Path $DataHome 'runtime\logs';New-Item -ItemType Directory -Path $logs -Force | Out-Null
  $previousHome=$env:CODEX_QQ_HOME
  try{
    $env:CODEX_QQ_HOME=$DataHome
    Start-Process -FilePath $nodePath -ArgumentList @(('"'+(Join-Path $packageRoot 'bin\bridge.mjs')+'"')) -WorkingDirectory $packageRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'bridge.log') -RedirectStandardError (Join-Path $logs 'bridge.err.log') | Out-Null
  }finally{$env:CODEX_QQ_HOME=$previousHome}
  $url='http://127.0.0.1:'+$consolePort;$ready=$false
  for($attempt=0;$attempt -lt 40;$attempt++){try{$session=Invoke-RestMethod -Uri ($url+'/api/session') -TimeoutSec 2;if($session.app -eq 'codex-qq-bridge'){$ready=$true;break}}catch{Start-Sleep -Milliseconds 250}}
  if(!$ready){throw ('Control center did not become ready. See '+(Join-Path $logs 'bridge.err.log'))}
  Start-Process -FilePath $url | Out-Null
  Write-Output ('Control center (QQ replies paused): '+$url)
}
Write-Output 'Next: verify Codex login, scan QQ QR yourself, confirm owners/groups and persona, then explicitly start the bot in the console.'
