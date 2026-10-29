param([ValidateSet('Start','Stop')][string]$Action,[Parameter(Mandatory=$true)][string]$DataRoot,[string]$QQPath='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($DataRoot)
$napcat=Join-Path $root 'vendor\NapCat'
$runtime=Join-Path $root 'runtime'
$pidFile=Join-Path $runtime 'napcat-process.json'
if($Action -eq 'Stop'){
  if(!(Test-Path -LiteralPath $pidFile)){Write-Output 'No managed NapCat process';exit 0}
  $record=Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.pid)"
  if(!$process){exit 0}
  if($process.ExecutablePath -ne $record.executable -or $process.CreationDate.ToUniversalTime().ToString('o') -ne $record.createdAt){throw 'Process identity changed; refusing to stop'}
  $all=@(Get-CimInstance Win32_Process)
  $ids=New-Object 'System.Collections.Generic.HashSet[int]'
  $ids.Add([int]$record.pid) | Out-Null
  do{$changed=$false;foreach($item in $all){if($ids.Contains([int]$item.ParentProcessId) -and $item.CreationDate -ge $process.CreationDate -and $ids.Add([int]$item.ProcessId)){$changed=$true}}}while($changed)
  foreach($targetId in @($ids | Sort-Object -Descending)){Stop-Process -Id $targetId -ErrorAction SilentlyContinue}
  Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
  exit 0
}
if(!(Test-Path -LiteralPath $QQPath -PathType Leaf) -or [IO.Path]::GetFileName($QQPath) -ne 'QQ.exe'){throw 'Select official QQ.exe first'}
$config=Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($port in @($config.oneBotPort,$config.webUiPort)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw ('Port occupied: '+$port)}}
if(Test-Path -LiteralPath $pidFile){$old=Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json;if(Get-Process -Id ([int]$old.pid) -ErrorAction SilentlyContinue){throw 'Managed NapCat is already running'}}
$env:NAPCAT_PATCH_PACKAGE=Join-Path $napcat 'qqnt.json'
$env:NAPCAT_LOAD_PATH=Join-Path $napcat 'loadNapCat.js'
$env:NAPCAT_INJECT_PATH=Join-Path $napcat 'NapCatWinBootHook.dll'
$env:NAPCAT_LAUNCHER_PATH=Join-Path $napcat 'NapCatWinBootMain.exe'
$env:NAPCAT_MAIN_PATH=Join-Path $napcat 'napcat.mjs'
if($config.qqAccount){$env:NAPCAT_QUICK_ACCOUNT=[string]$config.qqAccount}else{Remove-Item Env:NAPCAT_QUICK_ACCOUNT -ErrorAction SilentlyContinue}
$logs=Join-Path $runtime 'logs';New-Item -ItemType Directory -Path $logs -Force | Out-Null
$boot=Start-Process -FilePath $env:NAPCAT_LAUNCHER_PATH -ArgumentList @(('"'+$QQPath+'"'),('"'+$env:NAPCAT_INJECT_PATH+'"')) -WorkingDirectory $napcat -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'napcat.log') -RedirectStandardError (Join-Path $logs 'napcat.err.log') -PassThru
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$($boot.Id)"
@{pid=$boot.Id;executable=$process.ExecutablePath;createdAt=$process.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
Write-Output ('NapCat process started: '+$boot.Id)
