[CmdletBinding()]
param(
    # Start: back up dlc_load.json, create the probe mod (vanilla copies of the probed files), enable
    # only that mod, and start the lab's anvil-play.ps1 (Tongs with input and game calls, Russia save).
    # Stop: end that session (stop.txt), wait for its result.json, restore dlc_load.json, delete the
    # probe mod, and record what was restored.
    [Parameter(Mandatory)][ValidateSet('Start', 'Stop')][string]$Action,
    # New run name; artifacts go to <lab>/work/<RunName> (the gameplay session to <RunName>-play).
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$RunName,
    [string]$Lab = 'C:\Users\styda\repositories\eu4-engine-lab',
    [ValidateRange(5, 60)][int]$MaxMinutes = 30
)
# PROTOTYPE for happy-dwarf-team/etch#6, throwaway. Modelled on the lab's scripts/workshop-e1.ps1.
# eu4.exe, saves and existing mods are not modified; the Process Lasso rule, the EXE hash, settings.txt
# and closing the verified session are handled by the lab's anvil-play.ps1.
$ErrorActionPreference = 'Stop'
$userDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Paradox Interactive\Europa Universalis IV'
$gameDir = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
$dlc = Join-Path $userDir 'dlc_load.json'
$modDir = Join-Path $userDir 'mod'
$probeDescriptor = Join-Path $modDir 'etch-reload-probe.mod'
$probeRoot = Join-Path $modDir 'etch-reload-probe'
$runDir = Join-Path $Lab "work\$RunName"
$playRun = "$RunName-play"
$playDir = Join-Path $Lab "work\$playRun"
# Vanilla files copied unchanged into the probe mod; the probe edits these copies while the game runs.
$probeFiles = @(
    'interface\goto.gui', 'interface\outliner.gui', 'interface\topbar.gui', 'interface\countrydiplomacyview.gui',
    'gfx\interface\topbar_UL.dds')

if ($Action -eq 'Start') {
    if (Test-Path $runDir) { throw "Run exists: $runDir" }
    foreach ($p in $probeDescriptor, $probeRoot) { if (Test-Path $p) { throw "$p already exists; not touching it" } }
    New-Item -ItemType Directory $runDir | Out-Null
    Copy-Item $dlc (Join-Path $runDir 'dlc_load-before.json')
    $before = Get-Content $dlc -Raw | ConvertFrom-Json
    $state = [ordered]@{ dlcSha256Before = (Get-FileHash $dlc).Hash; probeRoot = $probeRoot; gameDir = $gameDir }

    $descriptor = @('version="0.1"', 'tags={', '	"Utilities"', '}', 'name="Etch reload probe (temporary)"', 'supported_version="1.37.*"')
    New-Item -ItemType Directory $probeRoot | Out-Null
    Set-Content (Join-Path $probeRoot 'descriptor.mod') $descriptor -Encoding ascii
    Set-Content $probeDescriptor ($descriptor + 'path="mod/etch-reload-probe"') -Encoding ascii
    foreach ($f in $probeFiles) {
        $target = Join-Path $probeRoot $f
        New-Item -ItemType Directory (Split-Path $target) -Force | Out-Null
        Copy-Item (Join-Path $gameDir $f) $target
    }
    $state.probeFiles = @(Get-ChildItem $probeRoot -Recurse -File | ForEach-Object {
        [ordered]@{ path = $_.FullName.Substring($probeRoot.Length + 1); sha256 = (Get-FileHash $_.FullName).Hash } })
    $after = [ordered]@{ enabled_mods = @('mod/etch-reload-probe.mod'); disabled_dlcs = @($before.disabled_dlcs) }
    # The game writes dlc_load.json without spaces; keep the same shape.
    Set-Content $dlc ($after | ConvertTo-Json -Compress) -Encoding utf8NoBOM -NoNewline
    $state.dlcDuring = Get-Content $dlc -Raw
    $state | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $runDir 'session-start.json') -Encoding UTF8

    $ps7 = 'C:\Program Files\PowerShell\7\pwsh.exe'
    $play = Start-Process $ps7 -PassThru -WindowStyle Hidden -WorkingDirectory $Lab `
        -RedirectStandardOutput (Join-Path $runDir 'play-stdout.txt') -RedirectStandardError (Join-Path $runDir 'play-stderr.txt') -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/anvil-play.ps1', '-RunName', $playRun,
        '-Scenario', 'tongs', '-TongsInput', '-TongsGameCalls', '-MaxMinutes', $MaxMinutes,
        '-AnvilBuild', 'work/etch6-anvil-build', '-TongsBuild', 'work/etch6-tongs-build')
    Set-Content (Join-Path $runDir 'play-pid.txt') $play.Id
    Write-Output "${RunName}: probe mod enabled alone, anvil-play PID $($play.Id) (work/$playRun); stop with -Action Stop"
    return
}

# Stop
if (-not (Test-Path (Join-Path $runDir 'session-start.json'))) { throw "No started run: $runDir" }
$start = Get-Content (Join-Path $runDir 'session-start.json') -Raw | ConvertFrom-Json
$playPid = [int](Get-Content (Join-Path $runDir 'play-pid.txt'))
if (Test-Path $playDir) { New-Item -ItemType File (Join-Path $playDir 'stop.txt') -Force | Out-Null }
$play = Get-Process -Id $playPid -ErrorAction SilentlyContinue
if ($play -and $play.ProcessName -eq 'pwsh') { $play.WaitForExit(180000) | Out-Null }
$playResult = Join-Path $playDir 'result.json'
$warnings = New-Object 'System.Collections.Generic.List[string]'
if (-not (Test-Path $playResult)) { $warnings.Add('anvil-play result.json missing') }

Copy-Item (Join-Path $runDir 'dlc_load-before.json') $dlc -Force
$restored = (Get-FileHash $dlc).Hash -eq $start.dlcSha256Before
if (-not $restored) { $warnings.Add('dlc_load.json hash differs from the backup after restoring') }
# Keep the edited files of the run (small text files and one texture) before deleting the mod.
if (Test-Path $probeRoot) { Copy-Item $probeRoot (Join-Path $runDir 'probe-mod-after') -Recurse -Force }
foreach ($p in $probeDescriptor, $probeRoot) {
    if (Test-Path $p) {
        try { Remove-Item -LiteralPath $p -Recurse -Force } catch { $warnings.Add("$p not removed: $($_.Exception.Message)") }
    }
}
$result = [ordered]@{
    dlcRestored = $restored; probeRemoved = -not ((Test-Path $probeDescriptor) -or (Test-Path $probeRoot))
    play = if (Test-Path $playResult) { Get-Content $playResult -Raw | ConvertFrom-Json } else { $null }; warnings = @($warnings)
}
$result | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir 'session-stop.json') -Encoding UTF8
Write-Output ("{0}: dlc_load restored={1}, probe removed={2}, warnings={3}" -f $RunName, $restored, $result.probeRemoved, $warnings.Count)
