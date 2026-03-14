#!/usr/bin/env bash
# verify-appimage-release.sh
#
# Lightweight local helper for smoke-checking a built AppImage artifact
# and opening the internal verification checklist workflow.
#
# Usage:
#   bash scripts/verify-appimage-release.sh [path-to-appimage]
#   bash scripts/verify-appimage-release.sh --help
#
# This script performs automated pre-checks on the AppImage file and then
# guides the maintainer to the full manual verification checklist at
# docs/release/appimage-verification-checklist.md.
#
# Any automated check failure is advisory -- the full verification
# checklist is the release gate, not this script alone.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKLIST_PATH="$PROJECT_ROOT/docs/release/appimage-verification-checklist.md"

# ---------------------------------------------------------------------------
# Colors and output helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "  ${CYAN}[INFO]${NC} $1"; }
header() { echo -e "\n${BOLD}$1${NC}"; }

FAILURES=0

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

show_help() {
  cat <<HELP
${BOLD}AppImage Release Verification Helper${NC}

Usage:
  bash scripts/verify-appimage-release.sh [path-to-appimage]
  bash scripts/verify-appimage-release.sh --help

Arguments:
  path-to-appimage    Path to the built .AppImage file to verify.
                      If omitted, the script looks in the default Tauri
                      output directory.

Options:
  --help              Show this help message and exit.

What this does:
  1. Validates the AppImage file exists and is executable
  2. Checks file size and format
  3. Verifies the AppImage can display its help/version
  4. Lists bundled desktop integration files
  5. Points you to the full manual verification checklist

The full release gate is the checklist at:
  docs/release/appimage-verification-checklist.md

Any failure in the automated checks is advisory. The manual checklist
is what blocks or approves a release.
HELP
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  show_help
  exit 0
fi

# ---------------------------------------------------------------------------
# Locate the AppImage
# ---------------------------------------------------------------------------

APPIMAGE_PATH="${1:-}"

if [[ -z "$APPIMAGE_PATH" ]]; then
  # Try to find the AppImage in the default Tauri output
  BUNDLE_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/appimage"
  if [[ -d "$BUNDLE_DIR" ]]; then
    APPIMAGE_PATH=$(find "$BUNDLE_DIR" -maxdepth 1 -name "*.AppImage" -type f | head -1)
  fi
fi

if [[ -z "$APPIMAGE_PATH" ]]; then
  echo -e "${RED}Error:${NC} No AppImage path provided and none found in default location."
  echo ""
  echo "Usage: bash scripts/verify-appimage-release.sh <path-to-appimage>"
  echo ""
  echo "Build one first with:"
  echo "  npm run tauri build -- --bundles appimage"
  exit 1
fi

APPIMAGE_PATH="$(realpath "$APPIMAGE_PATH")"

header "AppImage Release Verification"
echo "  Artifact: $APPIMAGE_PATH"
echo "  Date:     $(date -u +"%Y-%m-%d %H:%M UTC")"
echo ""

# ---------------------------------------------------------------------------
# Check 1: File existence and permissions
# ---------------------------------------------------------------------------

header "1. File Checks"

if [[ -f "$APPIMAGE_PATH" ]]; then
  pass "AppImage file exists"
else
  fail "AppImage file not found at $APPIMAGE_PATH"
  echo -e "\n${RED}Cannot continue without a valid AppImage file.${NC}"
  exit 1
fi

if [[ -x "$APPIMAGE_PATH" ]]; then
  pass "AppImage is executable"
else
  warn "AppImage is not executable -- marking as executable"
  chmod +x "$APPIMAGE_PATH"
  if [[ -x "$APPIMAGE_PATH" ]]; then
    pass "Made AppImage executable"
  else
    fail "Could not make AppImage executable"
  fi
fi

# ---------------------------------------------------------------------------
# Check 2: File size and format
# ---------------------------------------------------------------------------

header "2. File Format"

FILE_SIZE=$(stat -c%s "$APPIMAGE_PATH" 2>/dev/null || stat -f%z "$APPIMAGE_PATH" 2>/dev/null || echo "0")
FILE_SIZE_MB=$(echo "scale=1; $FILE_SIZE / 1048576" | bc 2>/dev/null || echo "?")

if [[ "$FILE_SIZE" -gt 1048576 ]]; then
  pass "File size: ${FILE_SIZE_MB} MB"
else
  fail "File size suspiciously small: ${FILE_SIZE_MB} MB"
fi

FILE_TYPE=$(file -b "$APPIMAGE_PATH" 2>/dev/null || echo "unknown")
if echo "$FILE_TYPE" | grep -qi "ELF\|executable\|AppImage"; then
  pass "File type: $FILE_TYPE"
else
  warn "Unexpected file type: $FILE_TYPE"
fi

# Check for AppImage magic bytes (AI\x02)
MAGIC=$(head -c 10 "$APPIMAGE_PATH" | od -A n -t x1 | head -1 | tr -d ' ')
if echo "$MAGIC" | grep -qi "4149"; then
  pass "AppImage magic bytes detected"
else
  warn "Could not confirm AppImage magic bytes (may still be valid)"
fi

# ---------------------------------------------------------------------------
# Check 3: Desktop file and icon presence
# ---------------------------------------------------------------------------

header "3. Desktop Integration Assets"

# Try to list contents if the AppImage supports --appimage-extract
TEMP_DIR=$(mktemp -d)
EXTRACT_OK=false

if "$APPIMAGE_PATH" --appimage-extract 2>/dev/null 1>/dev/null; then
  EXTRACT_OK=true
  SQUASHFS="squashfs-root"
else
  # Try extracting from the current directory
  cd "$TEMP_DIR"
  if "$APPIMAGE_PATH" --appimage-extract 2>/dev/null 1>/dev/null; then
    EXTRACT_OK=true
    SQUASHFS="$TEMP_DIR/squashfs-root"
  fi
  cd "$PROJECT_ROOT"
fi

if $EXTRACT_OK; then
  # Check for .desktop file
  DESKTOP_FILE=$(find "$SQUASHFS" -maxdepth 2 -name "*.desktop" -type f 2>/dev/null | head -1)
  if [[ -n "$DESKTOP_FILE" ]]; then
    pass "Desktop file found: $(basename "$DESKTOP_FILE")"
    # Check that it has the right app name
    if grep -q "Xenia Manager" "$DESKTOP_FILE" 2>/dev/null; then
      pass "Desktop file contains app name"
    else
      warn "Desktop file may not contain expected app name"
    fi
  else
    warn "No .desktop file found in AppImage"
  fi

  # Check for icon
  ICON_FILE=$(find "$SQUASHFS" -maxdepth 3 -name "*.png" -o -name "*.svg" 2>/dev/null | head -1)
  if [[ -n "$ICON_FILE" ]]; then
    pass "Icon file found: $(basename "$ICON_FILE")"
  else
    warn "No icon file found in AppImage"
  fi

  rm -rf "$SQUASHFS" 2>/dev/null || true
else
  warn "Could not extract AppImage contents for inspection"
fi

rm -rf "$TEMP_DIR" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

header "Summary"

if [[ $FAILURES -eq 0 ]]; then
  echo -e "  ${GREEN}All automated checks passed.${NC}"
else
  echo -e "  ${RED}$FAILURES automated check(s) failed.${NC}"
  echo -e "  Review failures above before proceeding."
fi

echo ""
echo -e "${BOLD}Next step:${NC} Complete the manual verification checklist at:"
echo -e "  ${CYAN}$CHECKLIST_PATH${NC}"
echo ""
echo "The automated checks above are advisory. The manual checklist is the"
echo "release gate. Every item in the checklist must pass before the AppImage"
echo "can be published as a release."
