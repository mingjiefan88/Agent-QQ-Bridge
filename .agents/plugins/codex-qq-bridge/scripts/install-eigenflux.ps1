param([Parameter(Mandatory=$true)][string]$DataRoot,[Parameter(Mandatory=$true)][string]$PackageRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'file-hash.ps1')
$lock=Get-Content -LiteralPath (Join-Path $PackageRoot 'third_party\eigenflux.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64'){throw 'EigenFlux integration currently packages Windows x64 only.'}
$uri=[Uri]$lock.url
if($uri.Scheme -ne 'https' -or $uri.Host -ne 'cdn.eigenflux.ai' -or $lock.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid EigenFlux release lock'}
$vendor=Join-Path ([IO.Path]::GetFullPath($DataRoot)) 'vendor\eigenflux'
New-Item -ItemType Directory -Path $vendor -Force | Out-Null
$exe=Join-Path $vendor 'eigenflux.exe'
if(!(Test-Path -LiteralPath $exe) -or (Get-BridgeFileHash $exe) -ne $lock.sha256){
 Invoke-WebRequest -Uri $lock.url -UseBasicParsing -OutFile ($exe+'.partial') -TimeoutSec 180
 if((Get-BridgeFileHash ($exe+'.partial')) -ne $lock.sha256 -or (Get-Item -LiteralPath ($exe+'.partial')).Length -ne $lock.size){throw 'EigenFlux official release checksum mismatch'}
 Move-Item -LiteralPath ($exe+'.partial') -Destination $exe -Force
}
$agentHome=Join-Path ([IO.Path]::GetFullPath($DataRoot)) 'eigenflux\.eigenflux'
$skills=Join-Path $vendor 'skills'
# Deliberately scoped to this QQ robot: no PATH, Codex rules, host plugin, or OpenClaw changes.
& $exe --homedir $agentHome skills sync --host terminal --into $skills
if($LASTEXITCODE -ne 0){throw 'EigenFlux signed Skills synchronization failed'}
foreach($skill in @('ef-onboarding','ef-profile','ef-broadcast','ef-communication')){if(!(Test-Path -LiteralPath (Join-Path $skills ($skill+'\SKILL.md')))){throw ('Missing official Skill: '+$skill)}}
& $exe --homedir $agentHome version
if($LASTEXITCODE -ne 0){throw 'EigenFlux CLI verification failed'}
