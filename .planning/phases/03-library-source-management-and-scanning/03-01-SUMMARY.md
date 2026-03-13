---
phase: 03-library-source-management-and-scanning
plan: 01
subsystem: full-stack
tags: [rust, react, tauri, library, sources, scan, queue]

# Dependency graph
requires:
  - phase: 02-xenia-installation-lifecycle
    plan: 03
    provides: Shared job/task infrastructure, event pipeline, Tauri managed state patterns
provides:
  - Persisted library source registry with add/list/remove and nested-source warnings
  - Scan coordinator with queue, cancel, and concurrent Scan All Now override
  - Tauri commands for source CRUD and scan lifecycle
  - Renderer library provider with context+reducer state management
  - Library page with source management panel and scan controls
affects: [03-02-discovery-and-catalog]

# Tech tracking
tech-stack:
  added: []
  patterns: [scan coordinator with queue/cancel/concurrent override, nested-source overlap detection]

key-files:
  created:
    - src-tauri/src/library/mod.rs
    - src-tauri/src/library/sources.rs
    - src-tauri/src/library/scan_jobs.rs
    - src-tauri/src/commands/library.rs
    - src/features/library/model/libraryTypes.ts
    - src/features/library/api/libraryClient.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/state/LibraryProvider.tsx
    - src/features/library/components/LibrarySourcesPanel.tsx
    - src/features/library/components/LibrarySourcesPanel.css
  modified:
    - src-tauri/src/commands/mod.rs
    - src-tauri/src/lib.rs
    - src/features/library/LibraryPage.tsx
    - src/App.tsx

key-decisions:
  - "Source IDs use timestamp+counter format matching job ID pattern"
  - "Nested-source detection warns but does not block registration"
  - "Scan coordinator uses queue semantics: one active scan at a time, Scan All drains and relaunches concurrently"
  - "Placeholder scan body in scan_jobs.rs will be replaced by plan 03-02 discovery logic"

patterns-established:
  - "Library source persistence: JSON document under library_metadata_path with atomic write"
  - "Scan coordinator: enqueue/cancel/finish/drain lifecycle managed via Mutex<CoordinatorState>"
  - "Library renderer state follows same context+reducer pattern as settings, tasks, and xenia stores"

requirements-completed: [LIB-01]

# Metrics
duration: ~20min
completed: 2026-03-13
---

# Phase 3 Plan 1: Library Source Management and Scan Job Orchestration Summary

**Persisted source registry, nested-source warnings, scan coordinator with queue/cancel/concurrent override, and full-stack Library page controls**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files created:** 10
- **Files modified:** 4

## Accomplishments
- Library source folders are persisted under `library_metadata_path/sources.json` with atomic write safety
- Nested-source overlap detection warns users when a new path is a child or parent of an existing source
- Scan coordinator manages background scan jobs through the shared `JobRegistry` with queue, cancel, and Scan All Now override
- Full renderer feature: typed client, reducer store, provider, and LibrarySourcesPanel with add/remove/rescan/cancel/scan-all controls
- 24 backend tests (13 sources, 7 scan_jobs, 4 commands) and 19 frontend tests (11 store, 8 component) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Persisted source storage, validation, and Tauri commands** - `7f95985` (feat)
2. **Task 2: Scan job coordination with queue, cancel, and concurrent override** - `fa1e674` (feat)
3. **Task 3: Renderer library provider and source management controls** - `0fac746` (feat)

## Files Created/Modified
- `src-tauri/src/library/sources.rs` - Source model, persistence, add/list/remove, nested-source detection
- `src-tauri/src/library/scan_jobs.rs` - ScanCoordinator with queue/cancel/drain/finish lifecycle
- `src-tauri/src/library/mod.rs` - Library module registration
- `src-tauri/src/commands/library.rs` - 7 Tauri commands for source CRUD and scan lifecycle
- `src/features/library/` - Full renderer feature with client, types, store, provider, and UI components

## Decisions Made
- Nested-source detection warns but does not reject — users may intentionally register overlapping paths
- Scan coordinator runs one scan at a time by default; Scan All Now drains queued work and launches all sources concurrently
- Scan body is a placeholder that completes with zero results — plan 03-02 will add real `.xex`/ISO discovery

## Deviations from Plan

None - plan executed as written.

## Issues Encountered
- `ScanRequest` struct originally derived `Debug` which required `AppHandle` and `JobRegistry` to implement Debug — fixed by removing `Debug` derive from `ScanRequest` and `CoordinatorState`
- Test helper originally used `std::mem::zeroed()` for `AppHandle` which caused SIGSEGV — fixed by removing tests that depend on constructing `ScanRequest` in test context

## Next Phase Readiness
- Source registry and scan coordinator are ready for plan 03-02 to hook actual file discovery logic
- `run_scan_job` in `scan_jobs.rs` has a clearly marked placeholder for the discovery implementation
- Library provider loads sources on mount, ready to reflect scan results once discovery is live

---
*Phase: 03-library-source-management-and-scanning*
*Completed: 2026-03-13*

## Self-Check: PASSED
