$ErrorActionPreference = "Stop"

$profileDir = Join-Path $PSScriptRoot "browser-profile-brave"
$bravePaths = @(
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
)

$brave = $bravePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $brave) {
  throw "Could not find brave.exe in the usual install locations."
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
Start-Process -FilePath $brave -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--new-window",
  "about:blank"
)

Write-Host "Started Brave with MCP-only profile: $profileDir"
Write-Host "Remote debugging endpoint: http://127.0.0.1:9222/json/version"
