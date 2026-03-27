---
phase: 07-save-portability-and-safety
plan: 01
subsystem: saves
tags: [zip, archive, import, export, backup, conflict-resolution, tauri-commands]

requires:
  - phase: 06-profiles-and-community-settings
    provides: Profile storage, patch storage, and library identity that save resolution depends on
provides:
  - Canonical per-game save path resolution from library identity
  - Portable zip archive packaging with typed manifest and selective export
  - Staged import pipeline with conflict planning and backup-before-apply safety
  - Typed Tauri commands for export preflight, inspection, conflict confirmation, and apply
  - Frontend save types and library store wiring for later UI consumption
affects: [07-02-save-management-ui]

tech-stack:
  added: [zip (Rust crate)]
  patterns: [staged-import-pipeline, backup-before-apply, conflict-plan-generation]

key-files:
  created:
    - src-tauri/src/saves/mod.rs
    - src-tauri/src/saves/paths.rs
    - src-tauri/src/saves/archive.rs
    - src-tauri/src/saves/import.rs
    - src-tauri/src/saves/storage.rs
    - src-tauri/src/commands/saves.rs
    - src/features/library/model/saveTypes.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src/features/library/api/libraryClient.ts
    - src/features/library/state/libraryStore.ts

key-decisions:
  - "Save path resolution uses library identity game_id and title_id to build canonical save, profile, and patch roots"
  - "Archive format is a standard zip with a manifest.json at the root for human inspectability"
  - "Import is always staged to a temp directory before mutation, with conflict plans computed against live local state"
  - "Backup-before-apply creates a timestamped zip of current local state before any overwrite"

patterns-established:
  - "Staged import pipeline: extract → inspect → conflict plan → backup → apply with per-item results"
  - "Selective export: items are individually selectable by label rather than all-or-nothing"

requirements-completed: [SAVE-01, SAVE-02, SAVE-03]

duration: 15min
completed: 2026-03-14
---

# Plan 07-01: Save Path Resolution & Archive Backend Summary

**Canonical save path resolution, portable zip archive packaging, staged import pipeline with conflict planning and backup-before-apply safety, and typed Tauri commands for frontend consumption**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-14
- **Completed:** 2026-03-14
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Per-game save root resolution from library identity with support for save data, profiles, and patches
- Portable zip export with typed manifest, selective item export, and human-readable archive filenames
- Multi-step import pipeline: stage → inspect → conflict plan → backup → apply with detailed per-item results
- Seven Tauri commands covering export preflight, export execution, import inspection, conflict planning, import apply, staging cleanup, and backup listing
- Frontend save types and library store state wiring ready for UI consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Build canonical save path resolution and portable archive packaging** - `93180fe` (feat)
2. **Task 2: Implement staged import inspection, conflict planning, and backup-before-apply** - (included in Task 1 commit)
3. **Task 3: Expose typed save commands and library-state wiring** - `bb31478` (feat)

## Files Created/Modified
- `src-tauri/src/saves/paths.rs` - Canonical per-game save root resolution with export preflight
- `src-tauri/src/saves/archive.rs` - Zip archive packaging, manifest generation, and import staging extraction
- `src-tauri/src/saves/import.rs` - Staged import pipeline with conflict planning and backup-before-apply
- `src-tauri/src/saves/storage.rs` - Backup management and storage utilities
- `src-tauri/src/saves/mod.rs` - Module registration
- `src-tauri/src/commands/saves.rs` - Seven typed Tauri commands for save workflows
- `src/features/library/model/saveTypes.ts` - Full TypeScript type contracts for save domain
- `src/features/library/api/libraryClient.ts` - Save command invocations
- `src/features/library/state/libraryStore.ts` - Save workflow state fields and action cases

## Decisions Made
- Save path resolution uses library identity game_id and title_id to build canonical roots
- Archive format is standard zip with manifest.json at root for portability and inspectability
- Import always stages to temp directory before mutation with conflict plans computed against live state
- Backup-before-apply creates timestamped zip of current local state before any overwrite

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend save contracts are in place for 07-02 to build the management UI
- Library store has save state fields ready for UI binding

---
*Plan: 07-01-save-path-resolution-and-archive-backend*
*Completed: 2026-03-14*
