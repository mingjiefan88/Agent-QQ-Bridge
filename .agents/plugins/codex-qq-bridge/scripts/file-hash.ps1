function Get-BridgeFileHash([string]$Path) {
  $stream=[IO.File]::OpenRead($Path)
  $algorithm=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
  finally{$stream.Dispose();$algorithm.Dispose()}
}
