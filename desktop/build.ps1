# Builds dist\LudusMagnus.exe: one file with the game and the WebView2 glue inside it.
# Needs nothing installed beyond Windows itself (uses the C# compiler that ships with .NET Framework).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File desktop\build.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desk = $PSScriptRoot
$dist = Join-Path $root 'dist'
$csc  = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "C# compiler not found at $csc" }
New-Item -ItemType Directory -Force $dist | Out-Null

# ---- icon: a 16x16 pixel helmet, written as a multi-size .ico ----
$ico = Join-Path $desk 'icon.ico'
if (-not (Test-Path $ico)) {
    Add-Type -AssemblyName System.Drawing
    $art = @(
        '................',
        '......rrrr......',
        '.....rrrrrr.....',
        '.....rrrrrr.....',
        '....gggggggg....',
        '...ghhhhhhhhg...',
        '...gggggggggg...',
        '...gggggggggg...',
        '...gkkkggkkkg...',
        '...gkkkggkkkg...',
        '...ggggkggggg...',
        '...ggggkggggg...',
        '...ggg.kk.ggg...',
        '....gg....gg....',
        '....gg....gg....',
        '................')
    $pal = @{ '.' = @(0x26,0x1c,0x18); 'r' = @(0xc2,0x3b,0x2e); 'g' = @(0xd9,0xa4,0x41); 'h' = @(0xf5,0xd0,0x78); 'k' = @(0x17,0x11,0x0f) }
    $sizes = 16, 32, 48, 256
    $images = @()
    foreach ($s in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap $s, $s
        for ($y = 0; $y -lt $s; $y++) { for ($x = 0; $x -lt $s; $x++) {
            $c = $pal[[string]$art[[int][math]::Floor($y * 16 / $s)][[int][math]::Floor($x * 16 / $s)]]
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c[0], $c[1], $c[2]))
        } }
        $ms = New-Object System.IO.MemoryStream
        if ($s -eq 256) { $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png) }
        else {
            # classic icon image: BITMAPINFOHEADER, 32-bit pixels bottom-up, then an empty 1-bit mask
            $w = New-Object System.IO.BinaryWriter $ms
            $w.Write([int]40); $w.Write([int]$s); $w.Write([int]($s * 2)); $w.Write([int16]1); $w.Write([int16]32)
            $w.Write([int]0); $w.Write([int]0); $w.Write([int]0); $w.Write([int]0); $w.Write([int]0); $w.Write([int]0)
            for ($y = $s - 1; $y -ge 0; $y--) { for ($x = 0; $x -lt $s; $x++) {
                $p = $bmp.GetPixel($x, $y); $w.Write([byte]$p.B); $w.Write([byte]$p.G); $w.Write([byte]$p.R); $w.Write([byte]255)
            } }
            $maskRow = [int]([math]::Ceiling($s / 32.0) * 4)
            $w.Write((New-Object byte[] ($maskRow * $s)))
            $w.Flush()
        }
        $images += , $ms.ToArray()
        $bmp.Dispose()
    }
    $out = New-Object System.IO.MemoryStream
    $w = New-Object System.IO.BinaryWriter $out
    $w.Write([int16]0); $w.Write([int16]1); $w.Write([int16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dim = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
        $w.Write([int16]1); $w.Write([int16]32); $w.Write([int]$images[$i].Length); $w.Write([int]$offset)
        $offset += $images[$i].Length
    }
    foreach ($img in $images) { $w.Write($img) }
    $w.Flush()
    [System.IO.File]::WriteAllBytes($ico, $out.ToArray())
}

# ---- gather what goes inside the exe ----
$lib = Join-Path $desk 'lib'
$res = @(
    "/resource:`"$lib\Microsoft.Web.WebView2.Core.dll`",lib.Microsoft.Web.WebView2.Core.dll",
    "/resource:`"$lib\Microsoft.Web.WebView2.WinForms.dll`",lib.Microsoft.Web.WebView2.WinForms.dll",
    "/resource:`"$lib\WebView2Loader.dll`",bin/WebView2Loader.dll",
    "/resource:`"$root\index.html`",app/index.html"
)
foreach ($dir in 'css', 'js') {
    Get-ChildItem (Join-Path $root $dir) -File | ForEach-Object { $res += "/resource:`"$($_.FullName)`",app/$dir/$($_.Name)" }
}

$exe = Join-Path $dist 'LudusMagnus.exe'
$cscArgs = @(
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+',
    "/out:`"$exe`"", "/win32icon:`"$ico`"", "/win32manifest:`"$desk\app.manifest`"",
    "/reference:`"$lib\Microsoft.Web.WebView2.Core.dll`"", "/reference:`"$lib\Microsoft.Web.WebView2.WinForms.dll`"",
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll'
) + $res + "`"$desk\Program.cs`""

& $csc $cscArgs
if ($LASTEXITCODE -ne 0) { throw "Compile failed" }
$size = [math]::Round((Get-Item $exe).Length / 1MB, 2)
"Built $exe ($size MB)"
