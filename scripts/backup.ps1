# Echora 2.0 - One-click backup script
# Usage: .\scripts\backup.ps1
# Archives source code and docs into backup/<timestamp>/

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backupRoot = Join-Path $root "backup"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destDir = Join-Path $backupRoot $timestamp

$excludes = @(
    "node_modules",
    "out",
    "dist",
    "release",
    ".vite",
    "backup",
    ".git"
)

$items = Get-ChildItem -Path $root -Force | Where-Object {
    $excludes -notcontains $_.Name
}

New-Item -ItemType Directory -Path $destDir -Force | Out-Null

foreach ($item in $items) {
    $target = Join-Path $destDir $item.Name
    if ($item.PSIsContainer) {
        robocopy $item.FullName $target /E /XD $excludes /NFL /NDL /NJH /NJS /NC /NS /NP
    } else {
        Copy-Item -Path $item.FullName -Destination $target -Force
    }
}

$count = (Get-ChildItem -Path $destDir -Recurse -File | Measure-Object).Count
Write-Host "Backup done: $destDir" -ForegroundColor Green
Write-Host "Files: $count" -ForegroundColor Cyan
