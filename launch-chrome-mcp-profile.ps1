$ErrorActionPreference = "Stop"

$profileDir = Join-Path $PSScriptRoot "browser-profile-chrome"
$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  throw "Could not find chrome.exe in the usual install locations."
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
Start-Process -FilePath $chrome -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--new-window",
  "about:blank"
)

Write-Host "Started Chrome with MCP-only profile: $profileDir"
Write-Host "Remote debugging endpoint: http://127.0.0.1:9222/json/version"
