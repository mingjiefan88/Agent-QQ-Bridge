$ErrorActionPreference='Stop'
$packageRoot=Split-Path -Parent $PSScriptRoot
$dataRoot=if($env:CODEX_QQ_HOME){$env:CODEX_QQ_HOME}else{Join-Path $env:LOCALAPPDATA 'CodexQQBridge'}
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath=Resolve-BridgeNode $packageRoot $dataRoot
& $nodePath (Join-Path $packageRoot 'bin\mcp.mjs')
exit $LASTEXITCODE
