param([Parameter(Mandatory)][string]$Dir)
# PROTOTYPE for etch#21: BMP captures to PNG for viewing; full frames also at half size.
Add-Type -AssemblyName System.Drawing
foreach ($f in Get-ChildItem $Dir -Filter *.bmp) {
    $png = [IO.Path]::ChangeExtension($f.FullName, '.png')
    if (Test-Path $png) { continue }
    $b = [Drawing.Bitmap]::FromFile($f.FullName)
    try {
        $b.Save($png, [Drawing.Imaging.ImageFormat]::Png)
        if ($b.Width -gt 2000) {
            $s = New-Object Drawing.Bitmap ([int]($b.Width / 2)), ([int]($b.Height / 2))
            $g = [Drawing.Graphics]::FromImage($s)
            $g.DrawImage($b, 0, 0, $s.Width, $s.Height)
            $s.Save(($png -replace '\.png$', '-half.png'), [Drawing.Imaging.ImageFormat]::Png)
            $g.Dispose(); $s.Dispose()
        }
    } finally { $b.Dispose() }
}
