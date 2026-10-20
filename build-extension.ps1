# build-extension.ps1 — package the Chrome Web Store ZIP (Windows / PowerShell)
# Produces draw-on-web-v<version>.zip containing ONLY manifest.json + src/.
# The docs/ website, .git, .claude, and all markdown/zip files are excluded by
# listing the payload explicitly.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Test-Path "manifest.json")) {
    Write-Error "manifest.json not found. Run this from the extension root."
    exit 1
}

# Read version from manifest.json
$version = (Get-Content "manifest.json" -Raw | ConvertFrom-Json).version
$zipName = "draw-on-web-v$version.zip"

if (Test-Path $zipName) {
    Remove-Item $zipName -Force
    Write-Host "Removed existing $zipName"
}

Compress-Archive -Path "manifest.json", "src" -DestinationPath $zipName -Force

$size = [math]::Round((Get-Item $zipName).Length / 1KB, 1)
Write-Host ""
Write-Host "Built $zipName ($size KB)" -ForegroundColor Green
Write-Host "Contents: manifest.json + src/ only (docs/ excluded)."
