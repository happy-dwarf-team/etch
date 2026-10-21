param([Parameter(Mandatory)][string]$Overlay)
# PROTOTYPE for happy-dwarf-team/etch#18, throwaway. Writes the probe window into the overlay mod:
#   etch_res_window  full screen, upper-left, over an opaque black backdrop (etch#22's scaled icon)
#   band markers     per vanilla if_resolution threshold T (750, 868, 900, 1048, 1052, 1080) one
#                    32 px white icon etch_res_max_T at y 100 that moves to y 140 when
#                    max_height = T-1 applies, and one etch_res_min_T at y 200 that moves to y 240
#                    when min_height = T applies
#   static widgets   a vanilla button with text, a vanilla icon, a text box, a cornered-tile panel
#                    and an alpha ramp, all inside 1280x720 at fixed positions, for pixel
#                    comparison across resolutions
$ErrorActionPreference = 'Stop'
$gfxDir = Join-Path $Overlay 'gfx\interface'
New-Item -ItemType Directory -Force $gfxDir, (Join-Path $Overlay 'interface') | Out-Null
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
Write-Tga (Join-Path $gfxDir 'etch_res_black.tga') 32 32 { 0, 0, 0, 255 }
Write-Tga (Join-Path $gfxDir 'etch_res_white.tga') 32 32 { 255, 255, 255, 255 }
Write-Tga (Join-Path $gfxDir 'etch_res_ramp.tga') 256 32 { param($x, $y) 40, 120, 200, $x }
$gfx = @('spriteTypes = {')
foreach ($n in 'black', 'white', 'ramp') {
    $gfx += "`tspriteType = {", "`t`tname = `"GFX_etch_res_$n`"", "`t`ttexturefile = `"gfx/interface/etch_res_$n.tga`"", "`t}"
}
$gfx += '}'
Set-Content (Join-Path $Overlay 'interface\etch_res.gfx') $gfx -Encoding ascii

$g = @('guiTypes = {', "`twindowType = {", "`t`tname = `"etch_res_window`"", "`t`tposition = { x = 0 y = 0 }",
    "`t`tsize = { x = 3440 y = 1440 }", "`t`tmoveable = 0", "`t`tfullscreen = yes",
    "`t`ticonType = {", "`t`t`tname = `"etch_res_backdrop`"", "`t`t`tspriteType = `"GFX_etch_res_black`"",
    "`t`t`tposition = { x = 0 y = 0 }", "`t`t`tscale = 120", "`t`t}")
$i = 0
foreach ($t in 750, 868, 900, 1048, 1052, 1080) {
    $x = 100 + 48 * $i++
    $g += "`t`ticonType = {", "`t`t`tname = `"etch_res_max_$t`"", "`t`t`tspriteType = `"GFX_etch_res_white`"",
        "`t`t`tposition = { x = $x y = 100 }", "`t`t`tif_resolution = {", "`t`t`t`tmax_height = $($t - 1)",
        "`t`t`t`tposition = { x = $x y = 140 }", "`t`t`t}", "`t`t}"
    $g += "`t`ticonType = {", "`t`t`tname = `"etch_res_min_$t`"", "`t`t`tspriteType = `"GFX_etch_res_white`"",
        "`t`t`tposition = { x = $x y = 200 }", "`t`t`tif_resolution = {", "`t`t`t`tmin_height = $t",
        "`t`t`t`tposition = { x = $x y = 240 }", "`t`t`t}", "`t`t}"
}
$g += "`t`tguiButtonType = {", "`t`t`tname = `"etch_res_button`"", "`t`t`tposition = { x = 100 y = 320 }",
    "`t`t`tquadTextureSprite = `"GFX_frontend_panel_button_center`"", "`t`t`tbuttonText = `"FE_OPTIONS`"", "`t`t`tbuttonFont = `"vic_22`"", "`t`t}"
$g += "`t`ticonType = {", "`t`t`tname = `"etch_res_version_bg`"", "`t`t`tspriteType = `"GFX_frontend_version_bg`"",
    "`t`t`tposition = { x = 400 y = 320 }", "`t`t}"
$g += "`t`tinstantTextBoxType = {", "`t`t`tname = `"etch_res_text`"", "`t`t`tposition = { x = 100 y = 420 }", "`t`t`tfont = `"vic_18`"",
    "`t`t`ttext = `"Etch resolution probe 0123456789`"", "`t`t`tmaxWidth = 400", "`t`t`tmaxHeight = 24", "`t`t}"
$g += "`t`twindowType = {", "`t`t`tname = `"etch_res_panel`"", "`t`t`tposition = { x = 100 y = 470 }", "`t`t`tsize = { x = 320 y = 160 }",
    "`t`t`tmoveable = 0", "`t`t`ticonType = {", "`t`t`t`tname = `"Background`"", "`t`t`t`tspriteType = `"GFX_country_selection_panel_bg`"", "`t`t`t}",
    "`t`t`tinstantTextBoxType = {", "`t`t`t`tname = `"etch_res_panel_text`"", "`t`t`t`tposition = { x = 20 y = 20 }", "`t`t`t`tfont = `"vic_22`"",
    "`t`t`t`ttext = `"Panel`"", "`t`t`t`tmaxWidth = 200", "`t`t`t`tmaxHeight = 30", "`t`t`t}", "`t`t}"
$g += "`t`ticonType = {", "`t`t`tname = `"etch_res_ramp`"", "`t`t`tspriteType = `"GFX_etch_res_ramp`"", "`t`t`tposition = { x = 500 y = 470 }", "`t`t}"
$g += "`t}", '}'
Set-Content (Join-Path $Overlay 'interface\etch_res.gui') $g -Encoding ascii
"probe written to $Overlay"
