[CmdletBinding()]
param(
    [string]$Lab = 'C:\Users\styda\repositories\eu4-engine-lab',
    # Detached worktree of Tongs 0.12.0+API 2 (ba1cc96) with tongs-main-menu.patch applied.
    [string]$TongsSource = 'C:\Users\styda\repositories\eu4-engine-lab\work\etch21-tongs-src'
)
# PROTOTYPE for happy-dwarf-team/etch#21, throwaway. Builds into <lab>/work/etch21-build:
#   anvil/    Anvil (the lab's checkout, v1.2.0): version.dll and plugin/anvil-game
#   bellows/  Bellows (the lab's checkout) against that Anvil
#   tongs/    Tongs with tongs-main-menu.patch (console calls in the main menu)
#   capture/  etch-capture (this folder)
$ErrorActionPreference = 'Stop'
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$out = Join-Path $Lab 'work\etch21-build'
$anvil = Join-Path $Lab 'anvil'
$builds = @(
    @{ name = 'anvil'; src = $anvil; extra = '-DANVIL_BUILD_TESTS=OFF -DANVIL_BUILD_BENCH=OFF' },
    @{ name = 'bellows'; src = (Join-Path $Lab 'bellows'); extra = "-DBUILD_TESTING=OFF -DFETCHCONTENT_SOURCE_DIR_ANVIL=$anvil" },
    @{ name = 'tongs'; src = $TongsSource; extra = "-DBUILD_TESTING=OFF -DFETCHCONTENT_SOURCE_DIR_ANVIL=$anvil" },
    @{ name = 'capture'; src = (Join-Path $PSScriptRoot 'etch-capture'); extra = "-DFETCHCONTENT_SOURCE_DIR_ANVIL_SDK=$anvil" }
)
foreach ($b in $builds) {
    $dir = Join-Path $out $b.name
    $cmd = "`"$vcvars`" >nul && cmake -S `"$($b.src)`" -B `"$dir`" -G Ninja -DCMAKE_BUILD_TYPE=Release $($b.extra) && cmake --build `"$dir`""
    Write-Output "== $($b.name)"
    cmd /c $cmd
    if ($LASTEXITCODE -ne 0) { throw "$($b.name) failed" }
}
Get-ChildItem $out -Recurse -Filter plugin.toml | Where-Object { $_.FullName -match '\\plugin\\[^\\]+\\plugin.toml$' } | ForEach-Object { $_.DirectoryName }
