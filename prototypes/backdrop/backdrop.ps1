param([Parameter(Mandatory)][string]$Overlay)
# PROTOTYPE for happy-dwarf-team/etch#22, throwaway, never merged.
# Writes the backdrop candidates into Etch's overlay mod: solid black and white 32x32 textures, a
# 256x32 alpha ramp (known alpha per column, for checking the alpha recovery), their sprites in
# interface/etch_backdrop.gfx, and three forms of a full-screen backdrop window per colour in
# interface/etch_backdrop.gui:
#   etch_backdrop_btn_<c>    a "Background" button with a cornered tile, as frontend.gui does
#   etch_backdrop_icon_<c>   a "Background" icon with the cornered tile
#   etch_backdrop_scaled_<c> an icon with a plain sprite scaled up (32 px x 120 = 3840 px)
$ErrorActionPreference = 'Stop'
$gfxDir = Join-Path $Overlay 'gfx\interface'
New-Item -ItemType Directory -Force $gfxDir, (Join-Path $Overlay 'interface') | Out-Null

# 32-bit uncompressed TGA, top-left origin, BGRA.
function Write-Tga([string]$Path, [int]$W, [int]$H, [scriptblock]$Pixel) {
    $bytes = [byte[]]::new(18 + $W * $H * 4)
    $bytes[2] = 2
    $bytes[12] = $W -band 0xFF; $bytes[13] = $W -shr 8
    $bytes[14] = $H -band 0xFF; $bytes[15] = $H -shr 8
    $bytes[16] = 32; $bytes[17] = 0x28
    $i = 18
    for ($y = 0; $y -lt $H; $y++) {
        for ($x = 0; $x -lt $W; $x++) {
            $b, $g, $r, $a = & $Pixel $x $y
            $bytes[$i] = $b; $bytes[$i + 1] = $g; $bytes[$i + 2] = $r; $bytes[$i + 3] = $a; $i += 4
        }
    }
    [IO.File]::WriteAllBytes($Path, $bytes)
}
Write-Tga (Join-Path $gfxDir 'etch_backdrop_black.tga') 32 32 { 0, 0, 0, 255 }
Write-Tga (Join-Path $gfxDir 'etch_backdrop_white.tga') 32 32 { 255, 255, 255, 255 }
# Ramp: colour (R 200, G 120, B 40), alpha = column (0..255).
Write-Tga (Join-Path $gfxDir 'etch_ramp.tga') 256 32 { param($x, $y) 40, 120, 200, $x }

$gfx = @('spriteTypes = {')
foreach ($c in 'black', 'white') {
    $gfx += "`tcorneredTileSpriteType = {", "`t`tname = `"GFX_etch_backdrop_tile_$c`"",
        "`t`ttexturefile = `"gfx/interface/etch_backdrop_$c.tga`"", "`t`tborderSize = { x = 0 y = 0 }", "`t}"
    $gfx += "`tspriteType = {", "`t`tname = `"GFX_etch_backdrop_$c`"", "`t`ttexturefile = `"gfx/interface/etch_backdrop_$c.tga`"", "`t}"
}
$gfx += "`tspriteType = {", "`t`tname = `"GFX_etch_ramp`"", "`t`ttexturefile = `"gfx/interface/etch_ramp.tga`"", "`t}", '}'
Set-Content (Join-Path $Overlay 'interface\etch_backdrop.gfx') $gfx -Encoding ascii

$gui = @('guiTypes = {')
foreach ($c in 'black', 'white') {
    $head = { param($n) "`twindowType = {", "`t`tname = `"$n`"", "`t`tposition = { x = 0 y = 0 }", "`t`tsize = { x = 3440 y = 1440 }",
        "`t`tmoveable = 0", "`t`tfullscreen = yes" }
    $gui += & $head "etch_backdrop_btn_$c"
    $gui += "`t`tguiButtonType = {", "`t`t`tname = `"Background`"", "`t`t`tquadTextureSprite = `"GFX_etch_backdrop_tile_$c`"", "`t`t}", "`t}"
    $gui += & $head "etch_backdrop_icon_$c"
    $gui += "`t`ticonType = {", "`t`t`tname = `"Background`"", "`t`t`tspriteType = `"GFX_etch_backdrop_tile_$c`"", "`t`t}", "`t}"
    $gui += & $head "etch_backdrop_scaled_$c"
    $gui += "`t`ticonType = {", "`t`t`tname = `"etch_backdrop_fill`"", "`t`t`tspriteType = `"GFX_etch_backdrop_$c`"",
        "`t`t`tposition = { x = 0 y = 0 }", "`t`t`tscale = 120", "`t`t}", "`t}"
}
$gui += '}'
Set-Content (Join-Path $Overlay 'interface\etch_backdrop.gui') $gui -Encoding ascii
"backdrop assets written to $Overlay"
