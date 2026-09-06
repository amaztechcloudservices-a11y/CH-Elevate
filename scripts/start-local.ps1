param([switch]$Supervise)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localUrl = 'http://localhost:3001/'
$logDirectory = 'D:\CodexData\tmp\ch-elevate-local'
$taskName = 'CH Elevate Local Server'

function Wait-LocalWebsite {
    $deadline = (Get-Date).AddSeconds(180)
    do {
        try {
            $response = Invoke-WebRequest $localUrl -UseBasicParsing -TimeoutSec 10
            if ($response.StatusCode -eq 200 -and $response.Content -match 'CH Elevate') {
                Write-Output "Ready: $localUrl"
                return
            }
        } catch { }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Local website did not become ready. See $logDirectory"
}

if (-not $Supervise) {
    # The task owns the server lifetime, independently of the invoking terminal.
    Start-ScheduledTask -TaskName $taskName
    Wait-LocalWebsite
    exit 0
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$nextPath = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath $nextPath)) { throw 'Run pnpm install before starting the local server.' }

while ($true) {
    $listeners = @(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        # Never terminate or replace another application using this port.
        foreach ($listener in $listeners) {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
            if ($owner.CommandLine -notlike "*$projectRoot*" -or $owner.CommandLine -notmatch 'next') {
                throw 'Port 3001 is occupied by an unrecognized process.'
            }
        }
        Start-Sleep -Seconds 10
        continue
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $server = Start-Process -FilePath $nodePath -ArgumentList @("`"$nextPath`"", 'dev', '--hostname', '127.0.0.1', '--port', '3001') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "$stamp.stdout.log") -RedirectStandardError (Join-Path $logDirectory "$stamp.stderr.log")
    # Wait for the actual process, not the Codex terminal. Restart after an exit.
    $server.WaitForExit()
    Start-Sleep -Seconds 5
}
