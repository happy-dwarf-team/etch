[CmdletBinding()]
param(
    # Prepare: build the capture host install in -HostDir: a junction copy of the Steam game with
    #   the pinned Anvil and Tongs releases (zips checked against the SHA256SUMS.txt next to them),
    #   Tongs set to input = true and game_calls = false, and host.json with every hash.
    # Check: the lab's preflight for one start (Process Lasso rule, both eu4.exe hashes, no game
    #   running, nothing of Anvil in the Steam folder, the junctions, the plugin hashes).
    # Start: Check, then start the copy suspended with CreateProcess, mask 1-7, with
    #   -userdir=<ProfileDir>/ and continue=<Save> when given; prints the verified session record.
    # Stop: close only the process of -Record after its PID, image path and creation time are
    #   verified again, and the games it restarted itself; prints what happened.
    # Cursor: where the real mouse cursor is, in screen pixels (read only). The game scrolls the
    #   map towards a cursor outside its window, so captures from a save need it inside.
    [Parameter(Mandatory)][ValidateSet('Prepare', 'Check', 'Start', 'Stop', 'Cursor')][string]$Action,
    [Parameter(Mandatory)][string]$Lab,
    [Parameter(Mandatory)][string]$HostDir,
    [string]$AnvilZip,
    [string]$TongsZip,
    [string]$ProfileDir,
    [ValidatePattern('^[A-Za-z0-9_.-]+\.eu4$')][string]$Save,
    [string]$Record
)
# The capture driver of happy-dwarf-team/etch#42. Every game run follows the EU4 engine lab's
# procedure (its AGENTS.md): hashes and the Process Lasso rule checked before the start, the copy
# started suspended with an explicit mask, closed only after its identity is verified again. The
# original eu4.exe, the player's profile, saves and mods are only read; nothing is installed into
# the Steam folder; Windows display settings are never touched. Output: one JSON object.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Action -eq 'Cursor') {
    Add-Type -AssemblyName System.Windows.Forms
    $p = [System.Windows.Forms.Cursor]::Position
    [ordered]@{ ok = $true; x = $p.X; y = $p.Y } | ConvertTo-Json -Compress
    return
}
Import-Module (Join-Path $Lab 'scripts\lib\LabProcess.psm1') -Force
$steamGame = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
$copy = Join-Path $HostDir 'game'
$exe = Join-Path $copy 'eu4.exe'
$hostFile = Join-Path $HostDir 'host.json'
function Sha([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
function Slash([string]$Path) { ($Path -replace '\\', '/').TrimEnd('/') + '/' }
function Out-Json($Value) { $Value | ConvertTo-Json -Depth 8 -Compress }

function Assert-Archive([string]$Zip) {
    $sums = Join-Path (Split-Path -Parent $Zip) 'SHA256SUMS.txt'
    if (-not (Test-Path -LiteralPath $sums)) { throw "No SHA256SUMS.txt next to $Zip" }
    $name = Split-Path -Leaf $Zip
    $line = @(Get-Content -LiteralPath $sums | Where-Object { $_ -match "^([0-9A-Fa-f]{64})\s+\*?$([regex]::Escape($name))$" })
    if ($line.Count -ne 1) { throw "SHA256SUMS.txt has no line for $name" }
    $expected = ($line[0] -split '\s+')[0].ToUpperInvariant()
    $actual = Sha $Zip
    if ($actual -ne $expected) { throw "$name has hash $actual, SHA256SUMS.txt says $expected" }
    return $actual
}

function Get-HostHashes {
    [ordered]@{
        copyExe    = Sha $exe
        versionDll = Sha (Join-Path $copy 'version.dll')
        anvilToml  = Sha (Join-Path $copy 'anvil\anvil.toml')
        tongsSettings = Sha (Join-Path $copy 'anvil\data\tongs\settings.toml')
        plugins    = @(Get-ChildItem (Join-Path $copy 'anvil\plugins') -Recurse -File |
                Where-Object { $_.Extension -in '.dll', '.toml' } | Sort-Object FullName | ForEach-Object {
                    [ordered]@{ path = $_.FullName.Substring($copy.Length + 1); sha256 = Sha $_.FullName } })
    }
}

function Assert-Host {
    if (-not (Test-Path -LiteralPath $hostFile)) { throw "$hostFile is missing; run -Action Prepare first" }
    $expected = Get-Content -LiteralPath $hostFile -Raw | ConvertFrom-Json
    foreach ($n in 'version.dll', 'anvil') {
        if (Test-Path (Join-Path $steamGame $n)) { throw "$n is in the Steam game folder; not starting" }
    }
    Assert-LabPreflight | Out-Null
    Assert-LabPreflight -ExePath $exe -ExpectedHash $expected.hashes.copyExe | Out-Null
    foreach ($j in Get-ChildItem -LiteralPath $copy -Directory | Where-Object Name -ne 'anvil') {
        if (-not ($j.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Not a junction: $($j.FullName)" }
    }
    $now = Get-HostHashes
    if ((Out-Json $now) -ne (Out-Json $expected.hashes)) { throw "The host install differs from $hostFile" }
    Assert-NoGameRunning -ExePath $exe | Out-Null
    return $expected
}

switch ($Action) {
    'Prepare' {
        if (-not $AnvilZip -or -not $TongsZip) { throw '-AnvilZip and -TongsZip are required for Prepare' }
        if (Test-Path -LiteralPath $HostDir) { throw "$HostDir exists; remove it first to prepare again" }
        $anvilSha = Assert-Archive $AnvilZip
        $tongsSha = Assert-Archive $TongsZip
        Assert-LabPreflight | Out-Null
        New-Item -ItemType Directory $copy, (Join-Path $HostDir 'profiles') | Out-Null
        foreach ($d in Get-ChildItem -LiteralPath $steamGame -Directory) {
            New-Item -ItemType Junction -Path (Join-Path $copy $d.Name) -Target $d.FullName | Out-Null
        }
        foreach ($f in Get-ChildItem -LiteralPath $steamGame -File) {
            if ($f.Name -like 'launcher-installer*' -or $f.Name -eq 'userdir.txt') { continue }
            Copy-Item -LiteralPath $f.FullName (Join-Path $copy $f.Name)
        }
        Expand-Archive -LiteralPath $AnvilZip -DestinationPath $copy
        Expand-Archive -LiteralPath $TongsZip -DestinationPath (Join-Path $copy 'anvil\plugins')
        # anvil-overlay draws notifications over the game, which would end up in the screenshots.
        $anvilToml = Join-Path $copy 'anvil\anvil.toml'
        $toml = [IO.File]::ReadAllText($anvilToml)
        if ($toml -notmatch '(?m)^disabled_plugins = \[\]') { throw "$anvilToml has no empty disabled_plugins" }
        [IO.File]::WriteAllText($anvilToml, ($toml -replace '(?m)^disabled_plugins = \[\]', 'disabled_plugins = ["anvil-overlay"]'))
        $data = Join-Path $copy 'anvil\data\tongs'
        New-Item -ItemType Directory $data -Force | Out-Null
        Set-Content (Join-Path $data 'settings.toml') @('enabled = true', 'input = true', 'game_calls = false') -Encoding ascii
        $hostInfo = [ordered]@{
            created = (Get-Date).ToUniversalTime().ToString('o')
            archives = [ordered]@{ anvil = [ordered]@{ file = (Split-Path -Leaf $AnvilZip); sha256 = $anvilSha }
                tongs = [ordered]@{ file = (Split-Path -Leaf $TongsZip); sha256 = $tongsSha } }
            hashes = Get-HostHashes
        }
        $hostInfo | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $hostFile -Encoding utf8NoBOM
        Out-Json ([ordered]@{ ok = $true; host = $HostDir; copyExe = $hostInfo.hashes.copyExe })
    }
    'Check' {
        Assert-Host | Out-Null
        Out-Json ([ordered]@{ ok = $true; exe = $exe; copyExe = (Sha $exe); originalExe = (Sha (Join-Path $steamGame 'eu4.exe')) })
    }
    'Start' {
        if (-not $ProfileDir) { throw '-ProfileDir is required for Start' }
        Assert-Host | Out-Null
        # -userdir= takes the rest of the command line as its path, so it comes last.
        $arguments = @()
        if ($Save) {
            if (-not (Test-Path -LiteralPath (Join-Path $ProfileDir "save games\$Save"))) { throw "The profile has no save $Save" }
            $arguments += "continue=$Save"
        }
        $arguments += "-userdir=$(Slash ([IO.Path]::GetFullPath($ProfileDir)))"
        $game = Start-LabGame -ExePath $exe -WorkingDirectory $copy -ArgumentList $arguments -AffinityMask 0xFE
        try {
            $out = ConvertTo-VerifiedSessionRecord $game
            # A FILETIME has more digits than a JSON reader's double keeps exactly: pass it as text.
            $out['creationFileTimeUtc'] = [string]$game.CreationFileTimeUtc
            $out['creationUnixMs'] = [DateTimeOffset]::new($game.CreationUtc).ToUnixTimeMilliseconds()
            $out['affinityMask'] = ('0x{0:X}' -f $game.AffinityMask)
            $out['arguments'] = $arguments
            Out-Json $out
        }
        finally { Close-VerifiedSession $game }
    }
    'Stop' {
        if (-not $Record) { throw '-Record is required for Stop' }
        $saved = Get-Content -LiteralPath $Record -Raw | ConvertFrom-Json
        $outcome = $null; $children = @(); $reporters = @(); $openError = $null
        # Anvil's crash reports of this start (a crash before readiness also puts Anvil into safe mode).
        $since = [DateTime]::FromFileTimeUtc([int64]$saved.creationFileTimeUtc)
        $crashDir = Join-Path $copy 'anvil\crashes'
        $anvilCrashes = @(if (Test-Path -LiteralPath $crashDir) {
                Get-ChildItem -LiteralPath $crashDir -Filter *.txt | Where-Object { $_.LastWriteTimeUtc -ge $since } | ForEach-Object Name })
        $game = $null
        try { $game = Open-VerifiedSession -Record $saved }
        catch { $openError = $_.Exception.Message }
        if ($game) {
            try {
                $outcome = Stop-VerifiedSession $game
                $children = @(Stop-RestartedGame -Session $game -ExePath $saved.imagePath)
                $reporters = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($game.Pid) AND Name = 'CrashReporter.exe'" |
                        ForEach-Object { [int]$_.ProcessId })
            }
            finally { Close-VerifiedSession $game }
        }
        Out-Json ([ordered]@{
                ok = ($null -ne $game -and $outcome -in 'terminated', 'already-exited') -or ($null -eq $game -and @(Get-RunningLabGame -ExePath $saved.imagePath | Where-Object Id -eq ([int]$saved.pid)).Count -eq 0)
                outcome = $outcome; openError = $openError; restartedChildren = $children; crashReporters = $reporters
                anvilCrashes = $anvilCrashes
                gamesRunningAfter = @(Get-RunningLabGame -ExePath $saved.imagePath | ForEach-Object { $_.Id })
            })
    }
}
