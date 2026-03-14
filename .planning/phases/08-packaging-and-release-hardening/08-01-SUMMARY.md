---
phase: 08-packaging-and-release-hardening
plan: 01
subsystem: infra
tags: [appimage, tauri, updater, release, linux, ci]

requires:
  - phase: 07-save-portability-and-safety
    provides: Complete feature set ready for packaging verification

provides:
  - Linux AppImage bundle configuration with deliberate release metadata
  - Backend release metadata commands for version, build kind, and updater readiness
  - Frontend release types and invoke client for renderer consumption
  - Updater manifest generation script for signed release artifacts
  - GitHub Actions release workflow for AppImage build and publish

affects: [08-packaging-and-release-hardening]

tech-stack:
  added: [tauri-plugin-updater, tauri-plugin-process, "@tauri-apps/plugin-updater", "@tauri-apps/plugin-process"]
  patterns: [compile-time environment detection for build kind, updater readiness gating, release metadata as backend-owned contract]

key-files:
  created:
    - src-tauri/src/release/mod.rs
    - src-tauri/src/commands/release.rs
    - src/features/settings/model/releaseTypes.ts
    - src/features/settings/api/releaseClient.ts
    - scripts/generate-updater-manifest.mjs
    - .github/workflows/release-appimage.yml
  modified:
    - src-tauri/tauri.conf.json
    - src-tauri/Cargo.toml
    - src-tauri/capabilities/default.json
    - src-tauri/src/lib.rs
    - src-tauri/src/commands/mod.rs
    - src/features/settings/state/settingsStore.ts
    - package.json

key-decisions:
  - "AppImage as sole v1 Linux release target instead of generic 'all' bundle targets"
  - "Updater gated on three prerequisites: packaged build, signing key, and configured endpoints"
  - "APPIMAGE env var detection for runtime build kind classification"
  - "Release metadata as backend-owned contract rather than frontend environment probing"

patterns-established:
  - "Release metadata module: single backend source of truth for version, build kind, updater readiness, and environment diagnostics"
  - "Updater readiness gating: three-prerequisite check before offering update UI"
  - "Environment diagnostics: non-blocking severity-classified findings for packaged runtime"

requirements-completed: [APP-02]

duration: 10min
completed: 2026-03-14
---

# Phase 8 Plan 1: AppImage Packaging and Release Automation Summary

**Linux AppImage bundle hardening with updater plugin registration, backend release metadata commands, manifest generation script, and GitHub Actions release workflow**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-14T20:37:27Z
- **Completed:** 2026-03-14T20:47:27Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Hardened Tauri config for Linux AppImage-first release with product naming, category, descriptions, and updater artifact generation
- Created backend release module with build kind detection, updater readiness gating, and environment diagnostics through typed Tauri commands
- Built repeatable release automation with manifest generation script and GitHub Actions workflow for AppImage build, sign, and publish

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden Tauri AppImage bundle configuration** - `8741d7d` (feat)
2. **Task 2: Add backend release metadata and updater capability commands** - `5fc2284` (feat)
3. **Task 3: Build repeatable AppImage release assembly and manifest generation** - `2e82e0d` (feat)

## Files Created/Modified
- `src-tauri/tauri.conf.json` - Linux AppImage bundle config with updater artifacts and product metadata
- `src-tauri/Cargo.toml` - Added tauri-plugin-updater and tauri-plugin-process dependencies
- `src-tauri/capabilities/default.json` - Added updater and process restart permissions
- `src-tauri/src/lib.rs` - Registered release module, updater and process plugins, release commands
- `src-tauri/src/release/mod.rs` - Build kind detection, updater readiness, release metadata, environment diagnostics with 12 tests
- `src-tauri/src/commands/release.rs` - Typed Tauri commands for release metadata, updater state, diagnostics
- `src/features/settings/model/releaseTypes.ts` - Frontend types mirroring Rust release contract
- `src/features/settings/api/releaseClient.ts` - Tauri invoke bridge for release commands
- `src/features/settings/state/settingsStore.ts` - Added releaseMetadata slot to settings state
- `scripts/generate-updater-manifest.mjs` - Updater manifest generation with artifact discovery, dry-run, and CLI options
- `.github/workflows/release-appimage.yml` - CI workflow for AppImage build, test, sign, manifest, and GitHub release
- `package.json` - Added plugin dependencies and release:manifest script

## Decisions Made
- Set AppImage as sole v1 bundle target (not "all") to make Linux release deliberate
- Updater availability gated on three prerequisites: packaged AppImage, non-empty signing key, configured endpoints
- Used APPIMAGE environment variable for runtime build kind detection (standard AppImage runtime behavior)
- Release metadata owned by backend module so renderer never probes environment directly
- Updater public key left empty in config (to be generated by maintainer before first signed release)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing std::fs import in saves/import.rs tests**
- **Found during:** Task 2 (compiling release tests required full crate compilation)
- **Issue:** Pre-existing test module in saves/import.rs referenced `fs` without importing `std::fs`
- **Fix:** Added `use std::fs;` to the test module
- **Files modified:** src-tauri/src/saves/import.rs
- **Verification:** cargo test release passes (20 tests)
- **Committed in:** 5fc2284 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test fixtures missing releaseMetadata field**
- **Found during:** Task 2 (frontend build after adding new state field)
- **Issue:** Three test files created SettingsState objects without the new releaseMetadata field
- **Fix:** Added `releaseMetadata: null` to test fixtures in SettingsPage, FirstRunSetup, and LibrarySourcesPanel tests
- **Files modified:** src/features/settings/__tests__/SettingsPage.test.tsx, src/features/settings/__tests__/FirstRunSetup.test.tsx, src/features/library/__tests__/LibrarySourcesPanel.test.tsx
- **Verification:** npm run build passes
- **Committed in:** 5fc2284 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for compilation and type safety. No scope creep.

## Issues Encountered
- npm plugin-process package version 2.5.0 does not exist (latest is 2.3.1) - corrected version range and install succeeded
- Rust 2024 edition marks std::env::set_var/remove_var as unsafe - rewrote tests to avoid env mutation, using environment defaults instead

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AppImage bundle configuration and release contract ready for Plan 08-02 packaged verification pass
- Updater signing keys need to be generated before first published release
- All major features from Phases 1-7 are ready for packaged-form verification

---
## Self-Check: PASSED

All 6 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 08-packaging-and-release-hardening*
*Completed: 2026-03-14*
