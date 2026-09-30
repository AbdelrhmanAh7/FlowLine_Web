# Memory sampler for the controlled rerun: every 5 s until STOP exists next to this script.
# Test-owned = Playwright browsers (ms-playwright) and node processes whose command line mentions FL-wt-design.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$csv = Join-Path $dir "memory.csv"
$stop = Join-Path $dir "STOP"
"time,available_mb,committed_mb,commit_limit_mb,test_node_count,test_node_private_mb,pw_browser_count,pw_browser_private_mb" | Out-File -FilePath $csv -Encoding utf8
while (-not (Test-Path $stop)) {
  try {
    $c = (Get-Counter '\Memory\Available MBytes','\Memory\Committed Bytes','\Memory\Commit Limit' -ErrorAction Stop).CounterSamples
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='chrome.exe' OR Name='chrome-headless-shell.exe' OR Name='firefox.exe'"
    $node = @($procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'FL-wt-design' })
    $pw = @($procs | Where-Object { $_.ExecutablePath -match 'ms-playwright' })
    $np = [math]::Round((($node | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 }) | Measure-Object -Sum).Sum / 1MB)
    $bp = [math]::Round((($pw | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 }) | Measure-Object -Sum).Sum / 1MB)
    "{0},{1},{2},{3},{4},{5},{6},{7}" -f (Get-Date -Format "HH:mm:ss"), [math]::Round($c[0].CookedValue), [math]::Round($c[1].CookedValue/1MB), [math]::Round($c[2].CookedValue/1MB), $node.Count, $np, $pw.Count, $bp | Out-File -FilePath $csv -Append -Encoding utf8
  } catch { "{0},error,{1}" -f (Get-Date -Format "HH:mm:ss"), ($_.Exception.Message -replace ',',';') | Out-File -FilePath $csv -Append -Encoding utf8 }
  Start-Sleep -Seconds 5
}
