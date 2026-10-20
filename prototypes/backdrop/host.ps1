[CmdletBinding()]
param(
    # Prepare: build the game host install under <lab>/work/etch21-host (junction copy with Anvil,
    #   anvil-game, Bellows, patched Tongs and etch-capture; private profile; overlay mod).
    # Run: one verified game session from the copy, until <runDir>/stop.txt, the game's exit or
    #   -MaxMinutes; records readiness, closes only the verified process, compares the player's
    #   profile before and after. Run it in the background and drive the game with probe.mjs.
    [Parameter(Mandatory)][ValidateSet('Prepare', 'Run')][string]$Action,
    [ValidatePattern('^[a-z0-9-]+$')][string]$RunName,
    # file: userdir.txt in the copy names the private profile; arg: -userdir=<profile> on the
    # command line with an empty userdir.txt.
    [ValidateSet('file', 'arg')][string]$UserDir = 'file',
    # Leave Bellows out of the copy for this run (start-up time without it).
    [switch]$NoBellows,
    [string]$Lab = 'C:\Users\styda\repositories\eu4-engine-lab',
    [ValidateRange(5, 60)][int]$MaxMinutes = 30
)
# PROTOTYPE for happy-dwarf-team/etch#22, throwaway, never merged. A copy of etch#21's host.ps1
# (branch prototype/private-host) that reuses its game host install; the only change is that Run
# writes the backdrop assets (backdrop.ps1) into the overlay mod before the game starts, because
# .gfx files and textures load only at startup. Follows the lab's AGENTS.md:
# Process Lasso baseline and EXE hashes checked before the start, the game started suspended with
# CreateProcess and the 1-7 mask, closed only after PID, image path and creation time are verified
# again. The original eu4.exe, the player's profile, saves and mods are only read; nothing is
# installed into the Steam folder.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $Lab 'scripts\lib\LabProcess.psm1') -Force
$knownSha = '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A'
$steamGame = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
$playerProfile = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Paradox Interactive\Europa Universalis IV'
$root = Join-Path $Lab 'work\etch21-host'
$copy = Join-Path $root 'game'
$profileDir = Join-Path $root 'profile'
$overlay = Join-Path $root 'overlay'
$exe = Join-Path $copy 'eu4.exe'
$build = Join-Path $Lab 'work\etch21-build'
$baseline = Join-Path $Lab 'work\startup-config-baseline'
# The playset under test: Proper 2K UI Enhanced from the Workshop folder (absolute path).
$playset = @(@{ file = 'p2ke.mod'; name = 'Proper 2K UI Enhanced'; path = 'C:/Program Files (x86)/Steam/steamapps/workshop/content/236850/3290499798' })
function Slash([string]$p) { ($p -replace '\\', '/').TrimEnd('/') + '/' }

if ($Action -eq 'Prepare') {
    if (Test-Path $root) { throw "$root exists; remove it first to prepare again" }
    New-Item -ItemType Directory $copy, $profileDir, (Join-Path $profileDir 'mod'), (Join-Path $overlay 'interface') | Out-Null
    # Junction copy: every folder is a junction to the Steam folder, every top-level file a copy.
    foreach ($d in Get-ChildItem -LiteralPath $steamGame -Directory) {
        New-Item -ItemType Junction -Path (Join-Path $copy $d.Name) -Target $d.FullName | Out-Null
    }
    foreach ($f in Get-ChildItem -LiteralPath $steamGame -File) {
        if ($f.Name -like 'launcher-installer*' -or $f.Name -eq 'userdir.txt') { continue }
        Copy-Item -LiteralPath $f.FullName (Join-Path $copy $f.Name)
    }
    Set-Content (Join-Path $copy 'userdir.txt') '' -NoNewline -Encoding ascii
    # Anvil and the plugins, only in the copy.
    Copy-Item (Join-Path $build 'anvil\version.dll') (Join-Path $copy 'version.dll')
    $plugins = Join-Path $copy 'anvil\plugins'
    New-Item -ItemType Directory $plugins | Out-Null
    foreach ($p in 'anvil\plugin\anvil-game', 'bellows\plugin\bellows', 'tongs\plugin\tongs', 'capture\plugin\etch-capture-proto') {
        Copy-Item (Join-Path $build $p) $plugins -Recurse
    }
    New-Item -ItemType Directory (Join-Path $copy 'anvil\data\tongs') | Out-Null
    Set-Content (Join-Path $copy 'anvil\data\tongs\settings.toml') @('enabled = true', 'input = false', 'game_calls = true') -Encoding ascii
    # Private profile: the lab's baseline settings.txt, descriptors with absolute paths, all DLC on.
    Copy-Item (Join-Path $baseline 'settings.txt') (Join-Path $profileDir 'settings.txt')
    $enabled = @()
    foreach ($m in $playset) {
        Set-Content (Join-Path $profileDir "mod\$($m.file)") @("name=`"$($m.name)`"", "path=`"$($m.path)`"", 'supported_version="v1.37.*.*"') -Encoding ascii
        $enabled += "mod/$($m.file)"
    }
    # The overlay mod: written by Etch, loaded last; empty interface/ at start.
    $descriptor = @('name="Etch overlay (prototype)"', 'supported_version="v1.37.*.*"', 'tags={', '	"Utilities"', '}')
    Set-Content (Join-Path $overlay 'descriptor.mod') $descriptor -Encoding ascii
    Set-Content (Join-Path $profileDir 'mod\etch-overlay.mod') ($descriptor + "path=`"$($overlay -replace '\\', '/')`"") -Encoding ascii
    $enabled += 'mod/etch-overlay.mod'
    Set-Content (Join-Path $profileDir 'dlc_load.json') ([ordered]@{ enabled_mods = $enabled; disabled_dlcs = @() } | ConvertTo-Json -Compress) -Encoding utf8NoBOM -NoNewline
    Get-ChildItem $plugins -Directory | ForEach-Object { "plugin $($_.Name)" }
    "copy $copy; profile $profileDir; overlay $overlay"
    return
}

# ---- Run --------------------------------------------------------------------------------------
if (-not $RunName) { throw '-RunName is required for Run' }
$runDir = Join-Path $Lab "work\$RunName"
if (Test-Path $runDir) { throw "Run exists: $runDir" }
foreach ($n in 'version.dll', 'anvil') { if (Test-Path (Join-Path $steamGame $n)) { throw "$n is in the Steam game folder; not starting" } }
Assert-LabPreflight | Out-Null                                   # Lasso rule + original EXE hash
Assert-LabPreflight -ExePath $exe -ExpectedHash $knownSha | Out-Null  # the copy's EXE
Assert-NoGameRunning -ExePath $exe | Out-Null
foreach ($j in Get-ChildItem $copy -Directory | Where-Object Name -ne 'anvil') {
    if (-not ($j.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Not a junction: $($j.FullName)" }
}
New-Item -ItemType Directory $runDir | Out-Null

# Bellows in or out for this run.
$bellowsIn = Join-Path $copy 'anvil\plugins\bellows'
$bellowsOut = Join-Path $root 'bellows-off'
if ($NoBellows -and (Test-Path $bellowsIn)) { Move-Item $bellowsIn $bellowsOut }
if (-not $NoBellows -and (Test-Path $bellowsOut)) { Move-Item $bellowsOut $bellowsIn }

# The overlay mod starts empty every run: preview copies are written while the game runs.
Get-ChildItem (Join-Path $overlay 'interface') -File | Remove-Item
# etch#22: the backdrop windows, their sprites and textures, present from the start.
& (Join-Path $PSScriptRoot 'backdrop.ps1') -Overlay $overlay

# userdir mode.
$gameArgs = @()
if ($UserDir -eq 'file') { Set-Content (Join-Path $copy 'userdir.txt') (Slash $profileDir) -NoNewline -Encoding ascii }
else { Set-Content (Join-Path $copy 'userdir.txt') '' -NoNewline -Encoding ascii; $gameArgs = @("-userdir=$(Slash $profileDir)") }

# What the run must not change: the player's profile files (hash), saves and mod descriptors.
function Snapshot([string]$Dir) {
    $rows = [ordered]@{}
    foreach ($f in Get-ChildItem -LiteralPath $Dir -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\(shadercache|cache|gfx|pops_filestorage)\\' }) {
        $rows[$f.FullName.Substring($Dir.Length + 1)] = '{0}|{1}' -f $f.Length, $f.LastWriteTimeUtc.Ticks
    }
    return $rows
}
$playerBefore = Snapshot $playerProfile
$hashes = [ordered]@{
    originalExe = (Get-FileHash -LiteralPath (Join-Path $steamGame 'eu4.exe')).Hash; copyExe = (Get-FileHash $exe).Hash
    versionDll = (Get-FileHash (Join-Path $copy 'version.dll')).Hash
    plugins = @(Get-ChildItem (Join-Path $copy 'anvil\plugins') -Recurse -Filter *.dll | ForEach-Object { [ordered]@{ path = $_.FullName.Substring($copy.Length + 1); sha256 = (Get-FileHash $_.FullName).Hash } })
}
$privateBefore = Snapshot $profileDir
Copy-Item (Join-Path $profileDir 'settings.txt') (Join-Path $runDir 'private-settings-before.txt')

# The pipe client used for readiness; one connection per poll.
function Ping-EtchPipe {
    $client = [IO.Pipes.NamedPipeClientStream]::new('.', 'etch-proto', [IO.Pipes.PipeDirection]::InOut)
    try {
        $client.Connect(200)
        $w = [IO.StreamWriter]::new($client); $w.AutoFlush = $true; $r = [IO.StreamReader]::new($client)
        $w.WriteLine('ping'); return ($r.ReadLine() | ConvertFrom-Json)
    } catch { return $null } finally { $client.Dispose() }
}

$started = Get-Date
$game = Start-LabGame -ExePath $exe -WorkingDirectory $copy -ArgumentList $gameArgs -AffinityMask 0xFE
ConvertTo-VerifiedSessionRecord $game | ConvertTo-Json | Set-Content (Join-Path $runDir 'verified-session.json') -Encoding UTF8
Write-Output ("{0}: game PID {1} from {2}, userdir={3}, bellows={4}; stop with work/{0}/stop.txt" -f $RunName, $game.Pid, $exe, $UserDir, (-not $NoBellows))
$stopFile = Join-Path $runDir 'stop.txt'
$firstPipe = $null; $ready = $null; $closeOutcome = $null; $children = @(); $reporters = @()
try {
    while ((Test-VerifiedSessionAlive $game) -and -not (Test-Path $stopFile) -and ((Get-Date) - $started).TotalMinutes -lt $MaxMinutes) {
        if (-not $ready) {
            $p = Ping-EtchPipe
            if ($p) {
                $hostMs = [math]::Round(((Get-Date).ToUniversalTime() - $game.CreationUtc).TotalMilliseconds)
                if (-not $firstPipe) { $firstPipe = [ordered]@{ hostMs = $hostMs; ping = $p } }
                if ($p.ready) { $ready = [ordered]@{ hostMs = $hostMs; ping = $p }; $ready | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $runDir 'ready.json') -Encoding UTF8 }
            }
            Start-Sleep -Milliseconds 250
        } else { Start-Sleep -Seconds 1 }
    }
}
finally {
    $exitedByItself = -not (Test-VerifiedSessionAlive $game)
    # The game's CrashReporter.exe, if any: a child of the verified game, closed only after its
    # own identity check.
    foreach ($c in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($game.Pid) AND Name = 'CrashReporter.exe'")) {
        $entry = [ordered]@{ pid = [int]$c.ProcessId; path = $c.ExecutablePath; outcome = $null }
        try {
            # Exact creation time from the process itself (CIM rounds it).
            $h = [LabProcessNative]::OpenProcess([uint32]0x1000, $false, [int]$c.ProcessId)
            if ($h -eq [IntPtr]::Zero) { throw 'cannot open' }
            $ct = [int64]0; $et = [int64]0; $kt = [int64]0; $ut = [int64]0
            [LabProcessNative]::GetProcessTimes($h, [ref]$ct, [ref]$et, [ref]$kt, [ref]$ut) | Out-Null
            [LabProcessNative]::CloseHandle($h) | Out-Null
            if (-not $c.ExecutablePath.StartsWith($copy, [StringComparison]::OrdinalIgnoreCase) -and
                -not $c.ExecutablePath.StartsWith($steamGame, [StringComparison]::OrdinalIgnoreCase)) { throw "unexpected path $($c.ExecutablePath)" }
            $record = [pscustomobject]@{ pid = [int]$c.ProcessId; imagePath = $c.ExecutablePath; creationFileTimeUtc = $ct }
            $s = Open-VerifiedSession -Record $record
            $entry.outcome = Stop-VerifiedSession $s
            Close-VerifiedSession $s
        } catch { $entry.outcome = "not closed: $($_.Exception.Message)" }
        $reporters += $entry
    }
    if (Test-VerifiedSessionAlive $game) { $closeOutcome = Stop-VerifiedSession $game }
    $children = @(Stop-RestartedGame -Session $game -ExePath $exe)
    Close-VerifiedSession $game
}
$playerAfter = Snapshot $playerProfile
$playerDiff = @(Compare-Object @($playerBefore.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) @($playerAfter.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" })
$privateAfter = Snapshot $profileDir
$privateDiff = @(Compare-Object @($privateBefore.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) @($privateAfter.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" })
Copy-Item (Join-Path $profileDir 'settings.txt') (Join-Path $runDir 'private-settings-after.txt')
foreach ($n in 'system.log', 'setup.log', 'error.log', 'game.log') {
    $f = Join-Path $profileDir "logs\$n"
    if (Test-Path $f) { Copy-Item $f $runDir }
}
foreach ($n in 'anvil.log') { if (Test-Path (Join-Path $copy "anvil\$n")) { Copy-Item (Join-Path $copy "anvil\$n") $runDir } }
$result = [ordered]@{
    runName = $RunName; userDir = $UserDir; bellows = -not $NoBellows; arguments = $gameArgs; hashes = $hashes
    pid = $game.Pid; createdUtc = $game.CreationUtc.ToString('o'); exitedByItself = $exitedByItself; closeOutcome = $closeOutcome
    restartedChildren = $children; crashReporters = $reporters; firstPipe = $firstPipe; ready = $ready
    playerProfileUnchanged = ($playerDiff.Count -eq 0); playerProfileDiff = $playerDiff; privateProfileDiff = $privateDiff
    steamFolderClean = -not ((Test-Path (Join-Path $steamGame 'version.dll')) -or (Test-Path (Join-Path $steamGame 'anvil')))
    gamesRunningAfter = @(Get-RunningLabGame -ExePath $exe | ForEach-Object { $_.Id })
}
$result | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir 'result.json') -Encoding UTF8
Write-Output ("{0}: closed={1} exitedByItself={2} ready={3} ms, player profile unchanged={4}, private profile changes={5}" -f
    $RunName, $closeOutcome, $exitedByItself, $ready.hostMs, ($playerDiff.Count -eq 0), $privateDiff.Count)
