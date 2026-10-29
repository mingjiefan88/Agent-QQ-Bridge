param([switch]$NoWindow)
$ErrorActionPreference='Stop'
$packageRoot=Split-Path -Parent $PSScriptRoot
$dataRoot=if($env:CODEX_QQ_HOME){$env:CODEX_QQ_HOME}else{Join-Path $env:LOCALAPPDATA 'CodexQQBridge'}
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$port=3790
$configPath=Join-Path $dataRoot 'config.json'
if(Test-Path -LiteralPath $configPath){$port=[int](Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json).port}
$url='http://127.0.0.1:'+$port
$ready=$false
try{$state=Invoke-RestMethod ($url+'/api/session') -TimeoutSec 2;$ready=$state.app -eq 'codex-qq-bridge'}catch{}
if(!$ready){
  if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Console port occupied by another program; no process was stopped'}
  . (Join-Path $PSScriptRoot 'node-runtime.ps1')
  $nodePath=Resolve-BridgeNode $packageRoot $dataRoot
  $codex=Get-Command codex.exe -ErrorAction SilentlyContinue
  if($codex){$env:CODEX_CLI_PATH=$codex.Source}else{
    $bins=Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if(Test-Path -LiteralPath $bins){$candidate=Get-ChildItem -LiteralPath $bins -Filter codex.exe -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1;if($candidate){$env:CODEX_CLI_PATH=$candidate.FullName}}
  }
  $logs=Join-Path $dataRoot 'runtime\logs';New-Item -ItemType Directory -Path $logs -Force | Out-Null
  $env:CODEX_QQ_HOME=$dataRoot
  Start-Process -FilePath $nodePath -ArgumentList @(('"'+(Join-Path $packageRoot 'bin\bridge.mjs')+'"'),'--auto-start') -WorkingDirectory $packageRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'bridge.log') -RedirectStandardError (Join-Path $logs 'bridge.err.log') | Out-Null
  for($attempt=0;$attempt -lt 40;$attempt++){try{$s=Invoke-RestMethod ($url+'/api/session') -TimeoutSec 2;if($s.app -eq 'codex-qq-bridge'){$ready=$true;break}}catch{Start-Sleep -Milliseconds 300}}
  if(!$ready){throw ('Launcher failed; see '+(Join-Path $logs 'bridge.err.log'))}
}
if(!$NoWindow){
  $edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  if(Test-Path -LiteralPath $edge){Start-Process -FilePath $edge -ArgumentList @(('--app='+$url),'--window-size=1440,960') -WindowStyle Normal | Out-Null}else{Start-Process -FilePath $url | Out-Null}
}
Write-Output ('Control center: '+$url)
