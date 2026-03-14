# AppImage Release Verification Checklist

**Purpose:** This checklist is the release gate for every packaged AppImage build.
Every item must pass before the build can be published. A failure in any category
blocks release until the issue is resolved.

**How to use:** Run `scripts/verify-appimage-release.sh` to perform automated
smoke checks, then work through each manual verification step below. Record
pass/fail status and notes for each item.

---

## Pre-verification Setup

- [ ] Built a fresh AppImage with `npm run tauri build -- --bundles appimage`
- [ ] Noted the AppImage path (typically `src-tauri/target/release/bundle/appimage/`)
- [ ] Made the AppImage executable: `chmod +x <path>.AppImage`
- [ ] Ran the automated smoke helper: `bash scripts/verify-appimage-release.sh <path>.AppImage`

---

## 1. First Launch and Desktop Integration

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 1.1 | AppImage launches without errors on a clean system | [ ] | |
| 1.2 | App window appears with correct title ("Xenia Manager for Linux") | [ ] | |
| 1.3 | First-run setup flow displays and accepts path configuration | [ ] | |
| 1.4 | Desktop integration prompt appears (menu entry, icons) | [ ] | |
| 1.5 | After accepting desktop integration, app appears in system menu | [ ] | |
| 1.6 | After declining desktop integration, app still functions normally | [ ] | |
| 1.7 | App can be relaunched from desktop entry after integration | [ ] | |

---

## 2. Release Metadata and Build Identity

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 2.1 | StatusBar shows build kind as "AppImage" with success indicator | [ ] | |
| 2.2 | StatusBar shows version number | [ ] | |
| 2.3 | Settings > Release Information shows "Xenia Manager for Linux" | [ ] | |
| 2.4 | Settings > Release Information shows correct version | [ ] | |
| 2.5 | Settings > Release Information shows correct architecture | [ ] | |
| 2.6 | Settings > Release Information shows build kind as "Linux AppImage" | [ ] | |
| 2.7 | "View release notes" link works and points to correct URL | [ ] | |
| 2.8 | Updater status section shows correct prerequisite states | [ ] | |
| 2.9 | Desktop Integration section is visible in packaged mode | [ ] | |

---

## 3. Packaged Environment Warnings

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 3.1 | Settings > Packaged Environment section is visible | [ ] | |
| 3.2 | Environment diagnostics load without errors | [ ] | |
| 3.3 | Warning items show plain-language summaries | [ ] | |
| 3.4 | "Show technical details" toggle reveals detailed diagnostic text | [ ] | |
| 3.5 | "Hide technical details" toggle collapses diagnostic text | [ ] | |
| 3.6 | Warnings do not hard-block app usage | [ ] | |

---

## 4. Xenia Install and Update

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 4.1 | Install dialog shows release version, date, and size | [ ] | |
| 4.2 | Install confirmation is explicit (user must click Install) | [ ] | |
| 4.3 | Install runs in background and shows progress in Tasks page | [ ] | |
| 4.4 | After install, Xenia status shows as installed with version | [ ] | |
| 4.5 | Update dialog shows new version and release notes link | [ ] | |
| 4.6 | Update confirmation text explains what will be replaced | [ ] | |
| 4.7 | Update process does not lose user data (library, saves, profiles) | [ ] | |
| 4.8 | Failed install/update shows error with recovery options | [ ] | |
| 4.9 | Retry operation works after a previous failure | [ ] | |

---

## 5. Library Scan

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 5.1 | Can add a game source directory | [ ] | |
| 5.2 | Scan discovers games in the source directory | [ ] | |
| 5.3 | Scan results appear in the library grid | [ ] | |
| 5.4 | Duplicate detection identifies matching titles | [ ] | |
| 5.5 | Review inbox shows items that need attention | [ ] | |
| 5.6 | Multiple sources can be added and scanned | [ ] | |
| 5.7 | Scan can be cancelled without crashing | [ ] | |

---

## 6. Game Launch

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 6.1 | Launch preflight checks pass for a valid game | [ ] | |
| 6.2 | Launch preflight blocks when Xenia is not installed | [ ] | |
| 6.3 | Xenia process starts and game window appears | [ ] | |
| 6.4 | App remains responsive while Xenia is running | [ ] | |
| 6.5 | Launch warnings display for unsupported conditions | [ ] | |

---

## 7. Patch and Profile Behavior

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 7.1 | Can import a patch file for a game | [ ] | |
| 7.2 | Patch enable/disable toggles work | [ ] | |
| 7.3 | Active patch selection persists across app restarts | [ ] | |
| 7.4 | Can create a game profile | [ ] | |
| 7.5 | Profile settings are applied during launch | [ ] | |
| 7.6 | Can switch between profiles for the same game | [ ] | |
| 7.7 | Profile editor shows both standard and raw config views | [ ] | |

---

## 8. Save Workflows

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 8.1 | Save export creates a valid archive | [ ] | |
| 8.2 | Save import restores save data from archive | [ ] | |
| 8.3 | Import conflict dialog shows correct options | [ ] | |
| 8.4 | Backup is created before overwriting saves | [ ] | |
| 8.5 | Per-item import results display correctly | [ ] | |

---

## 9. General Stability

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 9.1 | Navigate through all four main sections without crashes | [ ] | |
| 9.2 | App handles missing/corrupted config files gracefully | [ ] | |
| 9.3 | Window resize and layout remain functional | [ ] | |
| 9.4 | App closes cleanly without orphan processes | [ ] | |
| 9.5 | Console/stdout does not show unexpected errors during normal use | [ ] | |

---

## Verification Sign-off

**Tester:** ___________________
**Date:** ___________________
**AppImage version:** ___________________
**System:** ___________________
**Result:** [ ] PASS - Release approved / [ ] FAIL - Release blocked

**Blocking issues found:**

(List any items that failed and must be fixed before release)

---

*This checklist is maintained alongside the codebase. Update it when new
release-critical workflows are added.*
