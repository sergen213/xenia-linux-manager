---
phase: 02-xenia-installation-lifecycle
plan: 02
subsystem: backend
tags: [rust, serde, tokio, xenia, lifecycle, install-state, promotion, rollback]

# Dependency graph
requires:
  - phase: 02-xenia-installation-lifecycle
    plan: 01
    provides: Release metadata fetch, download pipeline, archive extraction, staging layout validation
provides:
  - Persisted install manifest with version, release date, and executable path
  - Lifecycle state model with failure context and retry mode
  - Rollback-safe promotion from staging to active install directory
  - Update detection comparing installed tag against latest release
  - Tauri commands for status, update checks, retry, cleanup, and removal
affects: [02-03-install-ui-and-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic JSON persistence with temp-file rename, backup/rollback promotion, unified lifecycle pipeline for install and update]

key-files:
  created:
    - src-tauri/src/xenia/install_state.rs
    - src-tauri/src/xenia/lifecycle.rs
  modified:
    - src-tauri/src/xenia/mod.rs
    - src-tauri/src/commands/xenia.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "Atomic JSON persistence with write-to-temp-then-rename for install state"
  - "Backup directory for rollback-safe promotion: previous build moved to xenia-backup before new build placed"
  - "Unified pipeline for install and update with is_update flag controlling failure categorization"
  - "Progress rebalanced to 5 steps (download 60%, extract 20%, validate 5%, promote 10%, record 5%) for promotion inclusion"

patterns-established:
  - "Install state persistence: load_state/save_state with graceful defaults on missing or corrupt files"
  - "State transition functions: record_success, record_install_failure, record_update_failure, clear_failure, record_removal"
  - "Lifecycle pipeline pattern: download -> extract -> validate -> promote -> persist, with step-level failure recording"

requirements-completed: [XEN-03, XEN-04]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 2 Plan 2: Installed State, Update Detection, and Rollback-Safe Promotion Summary

**Persisted install manifest with lifecycle state tracking, update detection from release metadata comparison, and backup/rollback-safe promotion with retry context for failed operations**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T01:29:37Z
- **Completed:** 2026-03-13T01:35:03Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Install manifest persists version, release date, executable path, and install timestamp across app restarts
- Lifecycle state model tracks install/update failures with retry mode and failed step for accurate Retry behavior
- Staged builds are promoted with backup/rollback so failed updates never leave the user without a working install
- Backend exposes a complete lifecycle API: status, update check, install, update, retry, cleanup, and removal

## Task Commits

Each task was committed atomically:

1. **Task 1: Persist install manifests and lifecycle state** - `3a8e570` (feat)
2. **Task 2: Promotion, update comparison, and rollback-safe failure handling** - `0ce2ad2` (feat)
3. **Task 3: Lifecycle commands for status, update, retry, cleanup, and removal** - `60d5b31` (feat)

## Files Created/Modified
- `src-tauri/src/xenia/install_state.rs` - Persisted install manifest, lifecycle status, failure context, state transitions
- `src-tauri/src/xenia/lifecycle.rs` - Promotion with backup/rollback, update detection, remove/cleanup
- `src-tauri/src/xenia/mod.rs` - Registered install_state and lifecycle modules
- `src-tauri/src/commands/xenia.rs` - 7 new Tauri commands plus unified lifecycle pipeline
- `src-tauri/src/lib.rs` - Registered all new commands in invoke handler

## Decisions Made
- Used atomic write (temp file + rename) for install state persistence to prevent corruption on crash
- Promotion backs up the current install to `xenia-backup/` before moving the staged build, then cleans backup on success
- Unified the install and update pipelines into a single `run_lifecycle_pipeline` with an `is_update` flag to control failure categorization
- Rebalanced progress percentages to accommodate the promotion step (download 60%, extract 20%, validate 5%, promote 10%, state 5%)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete lifecycle API ready for Plan 02-03 to build the install/update UI
- Persisted state provides the status/version/failure data the dashboard needs on startup
- Retry context preserves install vs update mode for accurate retry behavior in the UI

---
*Phase: 02-xenia-installation-lifecycle*
*Completed: 2026-03-13*

## Self-Check: PASSED
