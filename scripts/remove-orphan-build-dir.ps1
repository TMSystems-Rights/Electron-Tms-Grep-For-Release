# release-v122 等の孤立ビルドフォルダを削除する。
# Cursor が app.asar を掴んでいる間は削除できないため、Cursor 完全終了後に実行する。
param(
	[string]$TargetDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'release-v122'),
	[string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'

function Resolve-TargetPath {
	param(
		[string]$PathValue,
		[string]$Root
	)

	if ([System.IO.Path]::IsPathRooted($PathValue)) {
		return [System.IO.Path]::GetFullPath($PathValue)
	}

	return [System.IO.Path]::GetFullPath((Join-Path $Root $PathValue))
}

$projectRootFull = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
$targetFull      = Resolve-TargetPath -PathValue $TargetDir -Root $projectRootFull
$relativeTarget  = [System.IO.Path]::GetRelativePath($projectRootFull, $targetFull)
$targetLeaf      = Split-Path -Leaf $targetFull

if ($relativeTarget.StartsWith('..') -or [System.IO.Path]::IsPathRooted($relativeTarget)) {
	Write-Error "安全のため、プロジェクト外のフォルダは削除しません: $targetFull"
	exit 1
}

if ($targetLeaf -notlike 'release-*') {
	Write-Error "安全のため、release-* 形式ではないフォルダは削除しません: $targetFull"
	exit 1
}

if (-not (Test-Path -LiteralPath $targetFull)) {
	Write-Host "対象フォルダは存在しません: $targetFull"
	exit 0
}

$cursorProcesses = Get-Process -Name 'Cursor' -ErrorAction SilentlyContinue
if ($cursorProcesses) {
	Write-Host 'Cursor が起動中のため削除できません。' -ForegroundColor Yellow
	Write-Host ''
	Write-Host '手順:'
	Write-Host '  1. Cursor のウィンドウをすべて閉じる（Reload Window では不可）'
	Write-Host '  2. タスクマネージャーで Cursor.exe が残っていないことを確認'
	Write-Host '  3. Windows Terminal 等、Cursor 外の PowerShell から本スクリプトを再実行'
	Write-Host ''
	Write-Host "実行中 Cursor PID: $($cursorProcesses.Id -join ', ')"
	exit 1
}

Remove-Item -LiteralPath $targetFull -Recurse -Force
Write-Host "削除しました: $targetFull"
