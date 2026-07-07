$projectRoot = Split-Path -Parent $PSScriptRoot
$ports = @(3000, 3001, 3002)
$selectedPort = $null

foreach ($port in $ports) {
  if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    $selectedPort = $port
    break
  }
}

if (-not $selectedPort) {
  throw "No free port found in 3000-3002 range."
}

$logPath = Join-Path $projectRoot ".next-dev.log"
if (Test-Path $logPath) {
  Remove-Item -LiteralPath $logPath -Force
}

$innerCommand = "Set-Location -LiteralPath '$projectRoot'; rtk npm run dev -- --port $selectedPort *> '.next-dev.log'"
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoLogo", "-NoProfile", "-Command", $innerCommand -WindowStyle Hidden

Write-Output $selectedPort
