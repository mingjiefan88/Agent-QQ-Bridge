function Resolve-BridgeNode([string]$PackageRoot,[string]$DataRoot) {
  $ErrorActionPreference='Stop'
  . (Join-Path $PSScriptRoot 'file-hash.ps1')
  $command=Get-Command node.exe -ErrorAction SilentlyContinue
  if($command -and [int](((& $command.Source --version) | Select-Object -First 1).TrimStart('v').Split('.')[0]) -ge 22){return $command.Source}
  $lock=Get-Content -LiteralPath (Join-Path $PackageRoot 'third_party\node.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $runtime=Join-Path $DataRoot ('node-v'+$lock.version+'-win-x64')
  $nodePath=Join-Path $runtime 'node.exe'
  if(Test-Path -LiteralPath $nodePath){return $nodePath}
  New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
  $archive=Join-Path $PackageRoot ('bundled\'+$lock.file)
  if(!(Test-Path -LiteralPath $archive)){
    $downloads=Join-Path $DataRoot 'downloads';New-Item -ItemType Directory -Path $downloads -Force | Out-Null
    $archive=Join-Path $downloads $lock.file
    [Console]::Error.WriteLine('Preparing official portable Node.js runtime...')
    if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -UseBasicParsing -Uri $lock.url -OutFile ($archive+'.partial') -TimeoutSec 180;Move-Item -LiteralPath ($archive+'.partial') -Destination $archive}
  }
  if((Get-BridgeFileHash $archive) -ne $lock.sha256){throw 'Node runtime checksum mismatch'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($archive)
  try{foreach($entry in $zip.Entries){$final=[IO.Path]::GetFullPath((Join-Path $DataRoot $entry.FullName));if(!$final.StartsWith([IO.Path]::GetFullPath($runtime)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and $final -ne [IO.Path]::GetFullPath($runtime)){throw 'Runtime archive path invalid'}}}finally{$zip.Dispose()}
  [IO.Compression.ZipFile]::ExtractToDirectory($archive,$DataRoot)
  return $nodePath
}
