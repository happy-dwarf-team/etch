[CmdletBinding()]
param(
    # Prepare: build the vanilla game host install under <lab>/work/etch18-host (junction copy with
    #   Anvil, anvil-game, Bellows, Tongs main + the etch#21 main-menu patch, etch-capture; private
    #   profile with only the overlay mod; the probe window in the overlay) and save the named
    #   settings baseline.
    # Run: one verified game session at -Width x -Height in -Mode, from a named settings variant of
    #   the baseline; runs probe.mjs once the game is ready, closes only the verified process,
    #   checks the variant's allowed differences and restores the baseline.
    [Parameter(Mandatory)][ValidateSet('Prepare', 'Run')][string]$Action,
    [ValidatePattern('^[a-z0-9-]+$')][string]$RunName,
    [int]$Width, [int]$Height,
    [ValidateSet('windowed', 'borderless')][string]$Mode = 'windowed',
    [string]$Lab = 'C:\Users\styda\repositories\eu4-engine-lab',
    [ValidateRange(2, 30)][int]$MaxMinutes = 5
)
# PROTOTYPE for happy-dwarf-team/etch#18, throwaway, never merged. Follows the lab's AGENTS.md:
# Process Lasso baseline and EXE hashes checked before the start, the game started suspended with
# CreateProcess and the 1-7 mask, readiness = native marker (anvil-game.ready through
# etch-capture) and `Running application` in system.log, closed only after PID, image path and
# creation time are verified again. The original eu4.exe, the player's profile, saves and mods are
# only read; nothing is installed into the Steam folder; Windows display settings are not touched.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $Lab 'scripts\lib\LabProcess.psm1') -Force
$knownSha = '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A'
$steamGame = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
$playerProfile = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Paradox Interactive\Europa Universalis IV'
$root = Join-Path $Lab 'work\etch18-host'
$copy = Join-Path $root 'game'
$profileDir = Join-Path $root 'profile'
$overlay = Join-Path $root 'overlay'
$baselines = Join-Path $root 'baselines'
$baselineFile = Join-Path $baselines 'settings-baseline.txt'
$exe = Join-Path $copy 'eu4.exe'
$build21 = Join-Path $Lab 'work\etch21-build'
$build18 = Join-Path $Lab 'work\etch18-build'
function Slash([string]$p) { ($p -replace '\\', '/').TrimEnd('/') + '/' }
function Sha([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }

if ($Action -eq 'Prepare') {
    if (Test-Path $root) { throw "$root exists; remove it first to prepare again" }
    New-Item -ItemType Directory $copy, $profileDir, (Join-Path $profileDir 'mod'), (Join-Path $overlay 'interface'), $baselines | Out-Null
    foreach ($d in Get-ChildItem -LiteralPath $steamGame -Directory) {
        New-Item -ItemType Junction -Path (Join-Path $copy $d.Name) -Target $d.FullName | Out-Null
    }
    foreach ($f in Get-ChildItem -LiteralPath $steamGame -File) {
        if ($f.Name -like 'launcher-installer*' -or $f.Name -eq 'userdir.txt') { continue }
        Copy-Item -LiteralPath $f.FullName (Join-Path $copy $f.Name)
    }
    Set-Content (Join-Path $copy 'userdir.txt') '' -NoNewline -Encoding ascii
    Copy-Item (Join-Path $build21 'anvil\version.dll') (Join-Path $copy 'version.dll')
    $plugins = Join-Path $copy 'anvil\plugins'
    New-Item -ItemType Directory $plugins | Out-Null
    foreach ($p in (Join-Path $build21 'anvil\plugin\anvil-game'), (Join-Path $build21 'bellows\plugin\bellows'),
        (Join-Path $build18 'tongs\plugin\tongs'), (Join-Path $build21 'capture\plugin\etch-capture-proto')) {
        Copy-Item $p $plugins -Recurse
    }
    New-Item -ItemType Directory (Join-Path $copy 'anvil\data\tongs') | Out-Null
    Set-Content (Join-Path $copy 'anvil\data\tongs\settings.toml') @('enabled = true', 'input = false', 'game_calls = true') -Encoding ascii
    # Private profile: the lab's start-up baseline settings.txt (3440x1440 borderless, UI scale 1),
    # vanilla playset (only the overlay mod), all DLC on.
    Copy-Item (Join-Path $Lab 'work\startup-config-baseline\settings.txt') (Join-Path $profileDir 'settings.txt')
    Copy-Item (Join-Path $profileDir 'settings.txt') $baselineFile
    $descriptor = @('name="Etch resolution probe (prototype)"', 'supported_version="v1.37.*.*"', 'tags={', '	"Utilities"', '}')
    Set-Content (Join-Path $overlay 'descriptor.mod') $descriptor -Encoding ascii
    Set-Content (Join-Path $profileDir 'mod\etch-overlay.mod') ($descriptor + "path=`"$($overlay -replace '\\', '/')`"") -Encoding ascii
    Set-Content (Join-Path $profileDir 'dlc_load.json') ([ordered]@{ enabled_mods = @('mod/etch-overlay.mod'); disabled_dlcs = @() } | ConvertTo-Json -Compress) -Encoding utf8NoBOM -NoNewline
    & (Join-Path $PSScriptRoot 'probe-gui.ps1') -Overlay $overlay
    "copy $copy; profile $profileDir; overlay $overlay; baseline $baselineFile $(Sha $baselineFile)"
    return
}

# ---- Run --------------------------------------------------------------------------------------
if (-not $RunName -or -not $Width -or -not $Height) { throw '-RunName, -Width and -Height are required for Run' }
$runDir = Join-Path $Lab "work\etch18-runs\$RunName"
if (Test-Path $runDir) { throw "Run exists: $runDir" }
foreach ($n in 'version.dll', 'anvil') { if (Test-Path (Join-Path $steamGame $n)) { throw "$n is in the Steam game folder; not starting" } }
Assert-LabPreflight | Out-Null
Assert-LabPreflight -ExePath $exe -ExpectedHash $knownSha | Out-Null
Assert-NoGameRunning -ExePath $exe | Out-Null
foreach ($j in Get-ChildItem $copy -Directory | Where-Object Name -ne 'anvil') {
    if (-not ($j.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Not a junction: $($j.FullName)" }
}
$settings = Join-Path $profileDir 'settings.txt'
if ((Sha $settings) -ne (Sha $baselineFile)) { throw "Private settings.txt is not the baseline; restore $baselineFile first" }
New-Item -ItemType Directory $runDir -Force | Out-Null

# Named settings variant: the baseline with graphics.size, fullScreen and borderless replaced.
$text = [IO.File]::ReadAllText($baselineFile)
$sizeRe = [regex]'(?s)(graphics=\{\s*size=\{\s*x=)\d+(\s*y=)\d+'
if (-not $sizeRe.IsMatch($text)) { throw 'graphics.size not found in the baseline' }
$variantText = $sizeRe.Replace($text, "`${1}$Width`${2}$Height", 1)
$variantText = ([regex]'(?m)^(\s*fullScreen=)\w+').Replace($variantText, '${1}no', 1)
$variantText = ([regex]'(?m)^(\s*borderless=)\w+').Replace($variantText, "`${1}$(if ($Mode -eq 'borderless') { 'yes' } else { 'no' })", 1)
$variantName = "settings-${Width}x${Height}-$Mode.txt"
$variantFile = Join-Path $baselines $variantName
[IO.File]::WriteAllText($variantFile, $variantText)
Copy-Item $variantFile $settings
Copy-Item $variantFile (Join-Path $runDir 'settings-before.txt')
# pdx_settings.txt, written by the game at its first start from settings.txt, is what the game
# reads afterwards (run r2): its own named baseline (the file after the first start) and variant.
$pdx = Join-Path $profileDir 'pdx_settings.txt'
$pdxBaseline = Join-Path $baselines 'pdx-settings-baseline.txt'
if (-not (Test-Path $pdxBaseline)) { throw "Save $pdx as $pdxBaseline first" }
if ((Sha $pdx) -ne (Sha $pdxBaseline)) { throw "Private pdx_settings.txt is not the baseline; restore $pdxBaseline first" }
$pdxText = [IO.File]::ReadAllText($pdxBaseline)
$pdxText = ([regex]'(?s)("windowed_resolution"=\{\s*value=")[^"]*').Replace($pdxText, "`${1}${Width}x$Height", 1)
$pdxText = ([regex]'(?s)("display_mode"=\{\s*value=")[^"]*').Replace($pdxText, "`${1}$(if ($Mode -eq 'borderless') { 'borderless_fullscreen' } else { 'windowed' })", 1)
$pdxVariantName = "pdx-settings-${Width}x${Height}-$Mode.txt"
$pdxVariant = Join-Path $baselines $pdxVariantName
[IO.File]::WriteAllText($pdxVariant, $pdxText)
Copy-Item $pdxVariant $pdx
Copy-Item $pdxVariant (Join-Path $runDir 'pdx-settings-before.txt')

function Snapshot([string]$Dir) {
    $rows = [ordered]@{}
    foreach ($f in Get-ChildItem -LiteralPath $Dir -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\(shadercache|cache|gfx|pops_filestorage)\\' }) {
        $rows[$f.FullName.Substring($Dir.Length + 1)] = '{0}|{1}' -f $f.Length, $f.LastWriteTimeUtc.Ticks
    }
    return $rows
}
function Diff($a, $b) { @(Compare-Object @($a.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) @($b.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }) }
$playerBefore = Snapshot $playerProfile
$hashes = [ordered]@{
    originalExe = Sha (Join-Path $steamGame 'eu4.exe'); copyExe = Sha $exe; versionDll = Sha (Join-Path $copy 'version.dll')
    plugins = @(Get-ChildItem (Join-Path $copy 'anvil\plugins') -Recurse -Filter *.dll | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($copy.Length + 1); sha256 = Sha $_.FullName } })
    baseline = Sha $baselineFile; variant = Sha $variantFile
}
# Old screenshots out of the way, so the probe's are the only ones.
$shots = Join-Path $copy 'anvil\data\tongs\screenshots'
if (Test-Path $shots) { Get-ChildItem $shots -File | Remove-Item }

function Ping-EtchPipe {
    $client = [IO.Pipes.NamedPipeClientStream]::new('.', 'etch-proto', [IO.Pipes.PipeDirection]::InOut)
    try {
        $client.Connect(200)
        $w = [IO.StreamWriter]::new($client); $w.AutoFlush = $true; $r = [IO.StreamReader]::new($client)
        $w.WriteLine('ping'); return ($r.ReadLine() | ConvertFrom-Json)
    } catch { return $null } finally { $client.Dispose() }
}

$systemLog = Join-Path $profileDir 'logs\system.log'
$started = Get-Date
$game = Start-LabGame -ExePath $exe -WorkingDirectory $copy -ArgumentList @("-userdir=$(Slash $profileDir)") -AffinityMask 0xFE
ConvertTo-VerifiedSessionRecord $game | ConvertTo-Json | Set-Content (Join-Path $runDir 'verified-session.json') -Encoding UTF8
Write-Output ("{0}: game PID {1}, {2}x{3} {4} ({5})" -f $RunName, $game.Pid, $Width, $Height, $Mode, $variantName)
$ready = $null; $closeOutcome = $null; $probeExit = $null
try {
    while ((Test-VerifiedSessionAlive $game) -and -not $ready -and ((Get-Date) - $started).TotalMinutes -lt $MaxMinutes) {
        $p = Ping-EtchPipe
        $running = (Test-Path $systemLog) -and ((Get-Item $systemLog).LastWriteTimeUtc -gt $game.CreationUtc) -and
            (Select-String -LiteralPath $systemLog -SimpleMatch 'Running application' -Quiet)
        if ($p -and $p.ready -and $running) {
            $ready = [ordered]@{ hostMs = [math]::Round(((Get-Date).ToUniversalTime() - $game.CreationUtc).TotalMilliseconds); ping = $p }
        } else { Start-Sleep -Milliseconds 250 }
    }
    if ($ready) {
        Start-Sleep -Seconds 3   # let the menu's opening animation settle
        & node (Join-Path $PSScriptRoot 'probe.mjs') $runDir $Width $Height
        $probeExit = $LASTEXITCODE
    }
}
finally {
    $exitedByItself = -not (Test-VerifiedSessionAlive $game)
    if (Test-VerifiedSessionAlive $game) { $closeOutcome = Stop-VerifiedSession $game }
    $children = @(Stop-RestartedGame -Session $game -ExePath $exe)
    $reporters = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($game.Pid) AND Name = 'CrashReporter.exe'" | ForEach-Object { [int]$_.ProcessId })
    Close-VerifiedSession $game
}
# Settings: the variant may differ only in refreshRate and graceful_exit; then the baseline returns.
Copy-Item $settings (Join-Path $runDir 'settings-after.txt')
$allowed = '^\s*(refreshRate|graceful_exit)='
$settingsDiff = @(Compare-Object @(Get-Content $variantFile | Where-Object { $_ -notmatch $allowed }) @(Get-Content $settings | Where-Object { $_ -notmatch $allowed }) | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" })
Copy-Item $baselineFile $settings -Force
Copy-Item $pdx (Join-Path $runDir 'pdx-settings-after.txt')
$pdxDiff = @(Compare-Object @(Get-Content $pdxVariant) @(Get-Content $pdx) | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" })
Copy-Item $pdxBaseline $pdx -Force
$baselineRestored = ((Sha $settings) -eq (Sha $baselineFile)) -and ((Sha $pdx) -eq (Sha $pdxBaseline))
if (Test-Path $shots) { Copy-Item (Join-Path $shots '*') $runDir }
foreach ($n in 'system.log', 'error.log') { $f = Join-Path $profileDir "logs\$n"; if (Test-Path $f) { Copy-Item $f $runDir } }
$playerDiff = Diff $playerBefore (Snapshot $playerProfile)
$result = [ordered]@{
    runName = $RunName; width = $Width; height = $Height; mode = $Mode; variant = $variantName; pdxVariant = $pdxVariantName; hashes = $hashes
    pdxUnexpectedDiff = $pdxDiff
    pid = $game.Pid; createdUtc = $game.CreationUtc.ToString('o'); affinityMask = ('0x{0:X}' -f $game.AffinityMask)
    ready = $ready; probeExit = $probeExit; exitedByItself = $exitedByItself; closeOutcome = $closeOutcome
    restartedChildren = $children; crashReporters = $reporters
    settingsUnexpectedDiff = $settingsDiff; baselineRestored = $baselineRestored
    playerProfileUnchanged = ($playerDiff.Count -eq 0); playerProfileDiff = $playerDiff
    steamFolderClean = -not ((Test-Path (Join-Path $steamGame 'version.dll')) -or (Test-Path (Join-Path $steamGame 'anvil')))
    gamesRunningAfter = @(Get-RunningLabGame -ExePath $exe | ForEach-Object { $_.Id })
}
$result | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir 'result.json') -Encoding UTF8
Write-Output ("{0}: ready={1} ms probe={2} closed={3} settings diff={4}/{8} baseline restored={5} player profile unchanged={6} running after={7}" -f
    $RunName, $ready.hostMs, $probeExit, $closeOutcome, $settingsDiff.Count, $baselineRestored, ($playerDiff.Count -eq 0), $result.gamesRunningAfter.Count, $pdxDiff.Count)
