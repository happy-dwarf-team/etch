# A stand-in for the EU4 engine lab's scripts/lib/LabProcess.psm1, for game-lock.test.ts: the lock
# in work/game.lock next to it, as the lab keeps it, and no game. Every call appends its name, the
# caller's EU4LAB_GAME_LOCK_TOKEN and its arguments to work/calls.jsonl.
$ErrorActionPreference = 'Stop'
$script:Work = Join-Path $PSScriptRoot '..\..\work'
$script:LockFile = Join-Path $script:Work 'game.lock'

function Write-Call([string]$Name, $Arguments = @{}) {
    $line = [ordered]@{ call = $Name; token = $env:EU4LAB_GAME_LOCK_TOKEN; args = $Arguments } | ConvertTo-Json -Compress
    Add-Content -LiteralPath (Join-Path $script:Work 'calls.jsonl') $line -Encoding utf8NoBOM
}

function Get-LabGameLock {
    if (-not (Test-Path -LiteralPath $script:LockFile)) { return $null }
    $lock = Get-Content -LiteralPath $script:LockFile -Raw | ConvertFrom-Json
    # ConvertFrom-Json has already read the ISO text as a DateTime.
    $expires = ([DateTime]$lock.expiresUtc).ToUniversalTime()
    [pscustomobject]@{ Owner = $lock.owner; Token = $lock.token; Stale = [DateTime]::UtcNow -gt $expires; ExpiresUtc = $expires }
}

function Assert-OurLock {
    $held = Get-LabGameLock
    if ($held -and -not $held.Stale -and $held.Token -cne $env:EU4LAB_GAME_LOCK_TOKEN) {
        throw "The lab game lock is held by '$($held.Owner)'; wait for it or ask the user. No process was started."
    }
}

function Enter-LabGameLock([string]$Owner, [int]$Minutes, [int]$HolderPid) {
    Write-Call 'Enter-LabGameLock' @{ owner = $Owner; minutes = $Minutes; holderPid = $HolderPid }
    $held = Get-LabGameLock
    if ($held -and -not $held.Stale) { throw "The lab game lock is held by '$($held.Owner)'; wait for it or ask the user. No process was started." }
    $record = [ordered]@{ owner = $Owner; token = [guid]::NewGuid().ToString('N')
        expiresUtc = [DateTime]::UtcNow.AddMinutes($Minutes).ToString('o') }
    $record | ConvertTo-Json -Compress | Set-Content -LiteralPath $script:LockFile -Encoding utf8NoBOM
    Get-LabGameLock
}

function Exit-LabGameLock([string]$Token) {
    Write-Call 'Exit-LabGameLock' @{ token = $Token }
    $held = Get-LabGameLock
    if (-not $held -or $held.Token -cne $Token) { return $false }
    Remove-Item -LiteralPath $script:LockFile
    $true
}

function Assert-LabPreflight { Write-Call 'Assert-LabPreflight' }

function Assert-NoGameRunning([string]$ExePath) {
    Write-Call 'Assert-NoGameRunning'
    Assert-OurLock
}

function Start-LabGame([string]$ExePath, [string]$WorkingDirectory, [string[]]$ArgumentList, [uint64]$AffinityMask) {
    Write-Call 'Start-LabGame'
    Assert-OurLock
    [pscustomobject]@{ Pid = 999999; ImagePath = $ExePath; CreationFileTimeUtc = [int64]134370303694736579
        CreationUtc = [DateTime]::FromFileTimeUtc(134370303694736579); AffinityMask = $AffinityMask }
}

function ConvertTo-VerifiedSessionRecord($Session) { [ordered]@{ pid = $Session.Pid; imagePath = $Session.ImagePath } }
function Close-VerifiedSession($Session) { }

function Open-VerifiedSession($Record) {
    Write-Call 'Open-VerifiedSession'
    [pscustomobject]@{ Pid = [int]$Record.pid }
}

function Stop-VerifiedSession($Session) { 'terminated' }
function Stop-RestartedGame($Session, [string]$ExePath) { @() }
function Get-RunningLabGame([string]$ExePath) { @() }

Export-ModuleMember -Function *-Lab*, Get-RunningLabGame, ConvertTo-VerifiedSessionRecord, Close-VerifiedSession, Open-VerifiedSession, Stop-VerifiedSession, Stop-RestartedGame, Assert-NoGameRunning
