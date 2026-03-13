---
phase: 02-xenia-installation-lifecycle
plan: 01
subsystem: backend
tags: [rust, reqwest, tokio, github-api, archive, tar, xenia, install]

# Dependency graph
requires:
  - phase: 01-app-foundation-and-settings
    provides: Job subsystem (JobRegistry, events, store), settings paths, Tauri command pattern
provides:
  - GitHub releases client with Linux asset selection
  - Managed archive download pipeline with progress callbacks
  - Archive extraction and layout validation for Xenia builds
  - Tauri install command surface (fetch_latest_release, check_for_update, start_install)
  - InstallStep enum for structured progress range tracking
affects: [02-02-installed-state-and-promotion, 02-03-install-ui-and-recovery]

# Tech tracking
tech-stack:
  added: [reqwest 0.12, tokio (process/macros/rt features), futures-util 0.3]
  patterns: [Arc<JobRegistry> as managed Tauri state, async background spawn for long-running jobs, metadata-driven release discovery]

key-files:
  created:
    - src-tauri/src/xenia/mod.rs
    - src-tauri/src/xenia/releases.rs
    - src-tauri/src/xenia/download.rs
    - src-tauri/src/xenia/archive.rs
    - src-tauri/src/xenia/install.rs
    - src-tauri/src/commands/xenia.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/commands/mod.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "Metadata-driven release discovery via GitHub API instead of hardcoded wiki URL (stale URL returned 404 during research)"
  - "System tar/unzip for extraction instead of Rust crate to avoid adding large native dependencies"
  - "Arc<JobRegistry> as Tauri managed state for thread-safe sharing across async background tasks"
  - "Three-step pipeline (download 0-70%, extract 71-90%, validate 91-100%) for granular progress reporting"

patterns-established:
  - "xenia module pattern: domain submodules (releases, download, archive, install) under src-tauri/src/xenia/"
  - "Background job spawn: register in JobRegistry, emit created event, spawn async pipeline, emit progress/log/completion"
  - "Layout validation: search top-level and one subdirectory for xenia_canary executable, auto-set permissions"

requirements-completed: [XEN-02]

# Metrics
duration: 9min
completed: 2026-03-13
---

# Phase 2 Plan 1: Release Metadata, Download, and Extraction Summary

**GitHub releases client with Linux asset selection, managed archive download with streaming progress, and layout-validated extraction pipeline wired through the job subsystem**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-13T01:17:11Z
- **Completed:** 2026-03-13T01:26:30Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Linux Xenia release discovery is metadata-driven from the GitHub releases API, avoiding stale hardcoded URLs
- Archive download pipeline streams into app-managed staging with real-time progress callbacks
- Extracted layout validation searches for xenia_canary executable and auto-sets permissions
- Install jobs emit step-by-step progress and log events through the existing job subsystem

## Task Commits

Each task was committed atomically:

1. **Task 1: Release client and Linux asset selection** - `ef55592` (feat)
2. **Task 2: Managed archive download and layout validation** - `d554369` (feat)
3. **Task 3: Install jobs through task/progress infrastructure** - `08f0045` (feat)

## Files Created/Modified
- `src-tauri/src/xenia/mod.rs` - Xenia lifecycle module root
- `src-tauri/src/xenia/releases.rs` - GitHub release metadata fetch and Linux asset selection
- `src-tauri/src/xenia/download.rs` - Managed archive download pipeline with progress reporting
- `src-tauri/src/xenia/archive.rs` - Archive extraction (tar.gz, tar.xz, zip) and layout validation
- `src-tauri/src/xenia/install.rs` - InstallStep enum and install pipeline integration tests
- `src-tauri/src/commands/xenia.rs` - Tauri commands: fetch_latest_release, check_for_update, start_install
- `src-tauri/Cargo.toml` - Added reqwest, tokio features, futures-util
- `src-tauri/src/commands/mod.rs` - Registered xenia command module
- `src-tauri/src/lib.rs` - Added xenia module, Arc<JobRegistry> managed state, registered commands

## Decisions Made
- Used GitHub releases API (`/repos/xenia-canary/xenia-canary-releases/releases`) instead of hardcoded wiki URL since the wiki link returned 404 during research
- Used system `tar` and `unzip` commands for extraction rather than adding Rust archive crates, keeping binary size down
- Wrapped `JobRegistry` in `Arc` for Tauri managed state so the background spawn can share it safely
- Split progress into three weighted steps (download 70%, extract 20%, validate 10%) for granular UI feedback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tokio process/macros/rt features**
- **Found during:** Task 2 (archive extraction)
- **Issue:** `tokio::process::Command` and `#[tokio::test]` required features not yet enabled
- **Fix:** Added `process`, `macros`, `rt` to tokio feature flags in Cargo.toml
- **Files modified:** src-tauri/Cargo.toml
- **Verification:** All archive tests compile and pass
- **Committed in:** d554369 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for async extraction tests. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Release metadata, download, and extraction pipeline complete for Plan 02-02 to build version tracking and promotion on top
- JobRegistry now managed as Tauri state, ready for Plan 02-02 to reuse for update jobs
- Command surface generic enough for update attempts (label and category parameterized)

---
*Phase: 02-xenia-installation-lifecycle*
*Completed: 2026-03-13*

## Self-Check: PASSED
