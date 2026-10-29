param([Parameter(Mandatory=$true)][string]$DataRoot,[Parameter(Mandatory=$true)][string]$PackageRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'file-hash.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$lock=Get-Content -LiteralPath (Join-Path $PackageRoot 'third_party\napcat.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$data=[IO.Path]::GetFullPath($DataRoot)
$vendor=Join-Path $data 'vendor'
New-Item -ItemType Directory -Path $vendor -Force | Out-Null
$target=Join-Path $vendor 'NapCat'
if(Test-Path -LiteralPath (Join-Path $target 'napcat.mjs')){Write-Output 'NapCat already installed';exit 0}
$archive=Join-Path $PackageRoot 'bundled\NapCat.Shell.zip'
if(!(Test-Path -LiteralPath $archive)){
  $downloads=Join-Path $data 'downloads'
  New-Item -ItemType Directory -Path $downloads -Force | Out-Null
  $archive=Join-Path $downloads ('NapCat-'+$lock.version+'.zip')
  if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -UseBasicParsing -Uri $lock.url -OutFile ($archive+'.partial') -TimeoutSec 180;Move-Item -LiteralPath ($archive+'.partial') -Destination $archive}
}
if((Get-BridgeFileHash $archive) -ne $lock.sha256){throw 'NapCat archive SHA256 mismatch; installation stopped'}
$stage=Join-Path $vendor ('napcat-stage-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stage | Out-Null
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
  foreach($entry in $zip.Entries){
    $destination=[IO.Path]::GetFullPath((Join-Path $stage $entry.FullName))
    if(!$destination.StartsWith($stage+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive path escapes installation'}
    if(($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000){throw 'Archive links are not allowed'}
    if($entry.FullName.EndsWith('/')){New-Item -ItemType Directory -Path $destination -Force | Out-Null;continue}
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$false)
  }
}finally{$zip.Dispose()}
if(!(Test-Path -LiteralPath (Join-Path $stage 'napcat.mjs'))){throw 'NapCat entry point missing'}
# Move only the newly created, verified stage within this installation's vendor directory.
if(!(Resolve-Path -LiteralPath $stage).Path.StartsWith($vendor+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected stage location'}
Move-Item -LiteralPath $stage -Destination $target
Copy-Item -LiteralPath (Join-Path $PackageRoot 'third_party\NapCat-LICENSE.txt') -Destination (Join-Path $target 'LICENSE')
Write-Output ('Installed NapCat '+$lock.version)
