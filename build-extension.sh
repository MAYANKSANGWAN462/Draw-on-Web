#!/usr/bin/env bash
# build-extension.sh — package the Chrome Web Store ZIP (macOS / Linux / Git Bash)
# Produces draw-on-web-v<version>.zip containing ONLY manifest.json + src/.
# docs/ (the website), .git, .claude, and markdown/zip files are excluded
# because only manifest.json and src are added to the archive.

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f manifest.json ]; then
  echo "Error: manifest.json not found. Run this from the extension root." >&2
  exit 1
fi

# Extract "version": "x.y.z" from manifest.json without needing jq.
version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | head -1 | sed -E 's/.*"([0-9][^"]*)".*/\1/')
if [ -z "$version" ]; then
  echo "Error: could not read version from manifest.json." >&2
  exit 1
fi

zip_name="draw-on-web-v${version}.zip"
rm -f "$zip_name"

# -r recurse src/, -X strip extra file attributes. Only manifest.json + src.
zip -r -X "$zip_name" manifest.json src >/dev/null

echo ""
echo "Built $zip_name ($(du -h "$zip_name" | cut -f1))"
echo "Contents: manifest.json + src/ only (docs/ excluded)."
