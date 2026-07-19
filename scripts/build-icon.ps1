# build/icon.png から透過対応のマルチサイズ build/icon.ico を生成する
param(
	[string]$PngPath = (Join-Path $PSScriptRoot '..\build\icon.png'),
	[string]$IcoPath = (Join-Path $PSScriptRoot '..\build\icon.ico')
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$resolvedPng = (Resolve-Path -LiteralPath $PngPath).Path
$resolvedIco = [System.IO.Path]::GetFullPath($IcoPath)
$sizes       = @(16, 24, 32, 48, 64, 128, 256)

function Add-SmallIconBadge {
	param(
		[System.Drawing.Graphics]$Graphics,
		[int]$Size
	)

	$badgeSize = [single]($Size * 0.82)
	$badgeX = [single](($Size - $badgeSize) / 2)
	$badgeY = [single](($Size - $badgeSize) / 2)
	$badgeRect = New-Object System.Drawing.RectangleF -ArgumentList $badgeX, $badgeY, $badgeSize, $badgeSize
	$shadowRect = New-Object System.Drawing.RectangleF -ArgumentList $badgeX, ([single]($badgeY + ($Size * 0.05))), $badgeSize, $badgeSize
	$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(115, 0, 0, 0))
	$badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $badgeRect, ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), ([System.Drawing.Color]::FromArgb(255, 219, 239, 255)), ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
	$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 21, 178, 245)), ([single]([Math]::Max(1.5, $Size * 0.08)))

	try {
		$Graphics.FillEllipse($shadowBrush, $shadowRect)
		$Graphics.FillEllipse($badgeBrush, $badgeRect)
		$Graphics.DrawEllipse($borderPen, $badgeRect)

		$fontFamily = New-Object System.Drawing.FontFamily 'Segoe UI'
		$textFormat = New-Object System.Drawing.StringFormat
		$textFormat.Alignment = [System.Drawing.StringAlignment]::Center
		$textFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

		$textRect = New-Object System.Drawing.RectangleF -ArgumentList ([single]0), ([single]($Size * -0.03)), ([single]$Size), ([single]($Size * 1.03))
		$textPath = New-Object System.Drawing.Drawing2D.GraphicsPath
		$textPath.AddString('G', $fontFamily, [int][System.Drawing.FontStyle]::Bold, ([single]($Size * 0.72)), $textRect, $textFormat)
		$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 5, 16, 31))

		try {
			$Graphics.FillPath($textBrush, $textPath)
		} finally {
			$textBrush.Dispose()
			$textPath.Dispose()
			$textFormat.Dispose()
			$fontFamily.Dispose()
		}
	} finally {
		$borderPen.Dispose()
		$badgeBrush.Dispose()
		$shadowBrush.Dispose()
	}
}

function New-IconDibBytes {
	param(
		[System.Drawing.Image]$Source,
		[int]$Size
	)

	$side = [Math]::Min($Source.Width, $Source.Height)
	$cropX = [int](($Source.Width - $side) / 2)
	$cropY = [int](($Source.Height - $side) / 2)
	$srcRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side
	$dstRect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
	$bmp = New-Object System.Drawing.Bitmap -ArgumentList $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$ms = New-Object System.IO.MemoryStream
	$writer = New-Object System.IO.BinaryWriter $ms

	try {
		$g.Clear([System.Drawing.Color]::Transparent)
		$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
		$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
		$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
		$g.DrawImage($Source, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

		if ($Size -le 48) {
			Add-SmallIconBadge -Graphics $g -Size $Size
		}

		$maskStride = [int]([Math]::Ceiling($Size / 32.0) * 4)

		$writer.Write([UInt32]40)
		$writer.Write([Int32]$Size)
		$writer.Write([Int32]($Size * 2))
		$writer.Write([UInt16]1)
		$writer.Write([UInt16]32)
		$writer.Write([UInt32]0)
		$writer.Write([UInt32]($Size * $Size * 4))
		$writer.Write([Int32]0)
		$writer.Write([Int32]0)
		$writer.Write([UInt32]0)
		$writer.Write([UInt32]0)

		for ($y = $Size - 1; $y -ge 0; $y--) {
			for ($x = 0; $x -lt $Size; $x++) {
				$pixel = $bmp.GetPixel($x, $y)
				$writer.Write([byte]$pixel.B)
				$writer.Write([byte]$pixel.G)
				$writer.Write([byte]$pixel.R)
				$writer.Write([byte]$pixel.A)
			}
		}

		for ($y = $Size - 1; $y -ge 0; $y--) {
			$row = New-Object byte[] $maskStride
			for ($x = 0; $x -lt $Size; $x++) {
				if ($bmp.GetPixel($x, $y).A -lt 128) {
					$byteIndex = [int][Math]::Floor($x / 8)
					$row[$byteIndex] = $row[$byteIndex] -bor (0x80 -shr ($x % 8))
				}
			}
			$writer.Write($row)
		}

		$writer.Flush()
		return , $ms.ToArray()
	} finally {
		$writer.Dispose()
		$ms.Dispose()
		$g.Dispose()
		$bmp.Dispose()
	}
}

$src = [System.Drawing.Image]::FromFile($resolvedPng)
$images = @()

try {
	foreach ($size in $sizes) {
		$images += [pscustomobject]@{
			Size = $size
			Bytes = [byte[]](New-IconDibBytes -Source $src -Size $size)
		}
	}
} finally {
	$src.Dispose()
}

$stream = [System.IO.File]::Open($resolvedIco, [System.IO.FileMode]::Create)
$writer = New-Object System.IO.BinaryWriter $stream

try {
	$writer.Write([UInt16]0)
	$writer.Write([UInt16]1)
	$writer.Write([UInt16]$images.Count)

	$offset = 6 + (16 * $images.Count)
	foreach ($image in $images) {
		$sizeByte = if ($image.Size -eq 256) { 0 } else { $image.Size }
		$writer.Write([byte]$sizeByte)
		$writer.Write([byte]$sizeByte)
		$writer.Write([byte]0)
		$writer.Write([byte]0)
		$writer.Write([UInt16]1)
		$writer.Write([UInt16]32)
		$writer.Write([UInt32]$image.Bytes.Length)
		$writer.Write([UInt32]$offset)
		$offset += $image.Bytes.Length
	}

	foreach ($image in $images) {
		$writer.Write($image.Bytes)
	}
} finally {
	$writer.Dispose()
	$stream.Dispose()
}

Write-Host "Created $resolvedIco"
