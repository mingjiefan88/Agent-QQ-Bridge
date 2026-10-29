$ErrorActionPreference='Stop'
$dataRoot=if($env:CODEX_QQ_HOME){$env:CODEX_QQ_HOME}else{Join-Path $env:LOCALAPPDATA 'CodexQQBridge'}
$path=Join-Path $dataRoot 'config.json'
if(!(Test-Path -LiteralPath $path)){Write-Output 'No local console configuration';exit 0}
try{$config=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json}catch{throw 'Cannot read local config; original file preserved'}
$url='http://127.0.0.1:'+[int]$config.port
try{$session=Invoke-RestMethod ($url+'/api/session') -TimeoutSec 3}catch{Write-Output 'Console is not running';exit 0}
if($session.app -ne 'codex-qq-bridge'){throw 'Port belongs to another application; no process stopped'}
Invoke-RestMethod ($url+'/api/shutdown') -Method Post -ContentType 'application/json' -Headers @{'x-bridge-csrf'=$session.csrf} -Body '{}' -TimeoutSec 10 | Out-Null
Write-Output 'Console and bot replies stopped; QQ login is preserved.'
