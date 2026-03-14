---
phase: 07-save-portability-and-safety
plan: 02
subsystem: saves
tags: [ui, save-management, import-wizard, export-dialog, conflict-preview, backup-warning, results]

requires:
  - phase: 07-save-portability-and-safety
    plan: 01
    provides: Backend save commands, save types, library store save state fields
provides:
  - Dedicated Saves route with archive-first guided import wizard
  - Game-detail save quick actions for per-title export and import navigation
  - Side-by-side conflict preview with approved policies (Replace all, Keep both, Cancel)
  - Backup failure dialog with explicit risk acknowledgment
  - Per-item result surfaces with artifact locations and recovery messaging
affects: []

tech-stack:
  added: []
  patterns: [wizard-step-state, dispatch-driven-workflow, result-surface-per-item]

key-files:
  created:
    - src/features/saves/SavesPage.tsx
    - src/features/saves/SavesPage.css
    - src/features/saves/components/SaveImportWizard.tsx
    - src/features/saves/components/SaveConflictPreview.tsx
    - src/features/saves/components/SaveResultsPanel.tsx
    - src/features/saves/components/SaveExportDialog.tsx
    - src/features/saves/components/BackupFailureDialog.tsx
    - src/features/library/components/SaveQuickActions.tsx
  modified:
    - src/app/router.tsx
    - src/features/library/model/saveTypes.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/components/GameDetailsPanel.tsx
    - src/features/library/LibraryPage.tsx

key-decisions:
  - "Import wizard uses dispatch-driven step state (ImportWizardStep) shared through library store so both dedicated saves route and game-detail entry points drive the same flow"
  - "Conflict preview only offers the three approved policies: Replace all, Keep both if possible, Cancel -- no freeform user input"
  - "Backup failure requires explicit risk acknowledgment before proceeding without safety copy"
  - "Save state clears on game selection change to prevent stale results from leaking between titles"

patterns-established:
  - "Wizard-step state machine: steps advance through dispatch actions, enabling any entry point to resume or restart the flow"
  - "Result surfaces show per-item outcomes with artifact paths, not collapsed summaries"

requirements-completed: [SAVE-01, SAVE-02, SAVE-03]

duration: 13min
completed: 2026-03-14
---

# Plan 07-02: Save Management UI, Overwrite Warnings, and Recovery Messaging Summary

**Dedicated saves page, game-detail quick actions, guided import wizard with conflict preview and backup-failure dialog, and per-item result surfaces with artifact locations and recovery messaging**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-14
- **Completed:** 2026-03-14
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Added /saves route with dedicated SavesPage for archive-first import workflows and backup listing
- Extended library store with wizard-step state, export selection, backup failure tracking, and quick-action toggle
- Built SaveImportWizard with step indicator, inspect/target/conflict/backup/apply/result flow
- Created SaveConflictPreview with side-by-side item display, action badges, and cautious overwrite warnings
- Built SaveExportDialog with per-item selection, size preview, and blocker display
- Added BackupFailureDialog for explicit risk acknowledgment when pre-import backup fails
- Created SaveResultsPanel with per-item outcomes, artifact paths, backup references, and partial-success messaging
- Wired SaveQuickActions into GameDetailsPanel for fast per-game export and import navigation

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared save state and route structure** - `0f64eac` (feat)
2. **Task 2: Build guided export/import interfaces with conflict and backup handling** - `d1e23e3` (feat)
3. **Task 3: Add export/import result surfaces with per-item reporting** - `9752a45` (feat)

## Files Created/Modified
- `src/features/saves/SavesPage.tsx` - Dedicated saves management surface with wizard, results, and backup list
- `src/features/saves/SavesPage.css` - Complete styling for wizard, conflict, results, export, and backup UI
- `src/features/saves/components/SaveImportWizard.tsx` - Guided import flow with step-driven state machine (223 lines)
- `src/features/saves/components/SaveConflictPreview.tsx` - Side-by-side conflict summary with policy enforcement (179 lines)
- `src/features/saves/components/SaveResultsPanel.tsx` - Per-item result display with artifact locations (148 lines)
- `src/features/saves/components/SaveExportDialog.tsx` - Item-level export selection with blocker display
- `src/features/saves/components/BackupFailureDialog.tsx` - Backup failure risk acknowledgment dialog
- `src/features/library/components/SaveQuickActions.tsx` - Quick export/import entry points in game detail
- `src/features/library/components/GameDetailsPanel.tsx` - Added Saves section with quick actions wiring
- `src/features/library/LibraryPage.tsx` - Added export preflight, export, and navigate-to-saves callbacks
- `src/features/library/model/saveTypes.ts` - Added ImportWizardStep type
- `src/features/library/state/libraryStore.ts` - Extended with wizard state, selection, backup, and quick-action fields
- `src/app/router.tsx` - Registered /saves route with SavesPage

## Decisions Made
- Import wizard uses dispatch-driven step state shared through library store
- Conflict preview enforces only the three approved policies (Replace all, Keep both, Cancel)
- Backup failure requires explicit risk acknowledgment before proceeding
- Save state clears on game selection change to prevent stale results

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
- TypeScript build caught unused `gameTitle` destructured variable in SaveQuickActions -- fixed inline (Rule 1 auto-fix)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Save management UI is complete with all required surfaces
- Phase 07 is fully implemented (backend + frontend save portability and safety)
