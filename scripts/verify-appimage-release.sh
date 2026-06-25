#!/usr/bin/env bash
# verify-appimage-release.sh — smoke-check a built AppImage has its desktop
# integration assets. Usage: bash scripts/verify-appimage-release.sh [path]
set -euo pipefail

APPIMAGE="${1:-$(find "$(dirname "${BASH_SOURCE[0]}")/../release" -maxdepth 1 -name '*.AppImage' -type f 2>/dev/null | head -1)}"
[[ -n "$APPIMAGE" && -f "$APPIMAGE" ]] || { echo "No AppImage found (build with 'npm run dist')"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod +x "$APPIMAGE"
( cd "$WORK" && "$APPIMAGE" --appimage-extract >/dev/null 2>&1 ) || { echo "FAIL: could not extract $APPIMAGE"; exit 1; }

find "$WORK/squashfs-root" -name '*.desktop' -type f | grep -q . || { echo "FAIL: no .desktop file"; exit 1; }
find "$WORK/squashfs-root" \( -name '*.png' -o -name '*.svg' \) -type f | grep -q . || { echo "FAIL: no icon"; exit 1; }
echo "OK: $(basename "$APPIMAGE") has .desktop and icon"
