$ErrorActionPreference = 'Stop'
$betaEvidenceDir = 'artifacts/beta-execution/20260930T122429Z'
$betaLogDir = 'artifacts/beta-execution/helper-logs/20260930T122429Z'
New-Item -ItemType Directory -Force -Path $betaLogDir | Out-Null
foreach ($betaTask in @('lint', 'typecheck', 'test', 'test:contract', 'test:integration', 'check:evidence')) {
  $betaMem = Get-CimInstance Win32_OperatingSystem
  $betaSample = [pscustomobject]@{ at = (Get-Date).ToUniversalTime().ToString('o'); task = $betaTask; freePhysicalKiB = $betaMem.FreePhysicalMemory; totalPhysicalKiB = $betaMem.TotalVisibleMemorySize; freeVirtualKiB = $betaMem.FreeVirtualMemory; totalVirtualKiB = $betaMem.TotalVirtualMemorySize }
  $betaSample | ConvertTo-Json -Compress | Add-Content -LiteralPath "$betaEvidenceDir/memory.jsonl"
  if ($betaMem.FreePhysicalMemory -lt 2097152 -or $betaMem.FreeVirtualMemory -lt 4194304) { throw 'Unsafe memory pressure; no test launched' }
  $betaPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 3100,4010,4011)
  if ($betaPorts.Count) { throw 'Test stack is up; stop through its recorded owner before running non-browser gate' }
  $betaName = $betaTask.Replace(':', '-')
  $betaArgs = @('-s', $betaTask)
  if ($betaTask -eq 'test') { $betaArgs += '--maxWorkers=1' }
  Write-Output "START $betaTask"
  $betaSavedErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & pnpm.cmd @betaArgs *> "$betaLogDir/$betaName.log"
  $ErrorActionPreference = $betaSavedErrorAction
  $betaExit = $LASTEXITCODE
  "$(Get-Date -Format o) $betaTask exit=$betaExit" | Add-Content -LiteralPath "$betaEvidenceDir/non-browser-status.txt"
  Write-Output "END $betaTask exit=$betaExit"
  if ($betaExit -ne 0) { exit $betaExit }
}
