---
phase: 05-patch-management
plan: 02
subsystem: frontend-backend
tags: [react, tauri, patches, detail-workflow, ui]

# Dependency graph
requires:
  - phase: 05-patch-management
    plan: 01
    provides: Patch inventory, import/fetch commands, and per-entry persistence contracts
provides:
  - Detail-scoped patch management UI behind an explicit manage affordance
  - Active patch chooser flow after import or fetch and manual switching support
  - Flat checklist editor with inline warning-only messaging and local import drag-drop support
affects: [06-profiles-and-community-settings]

# Tech tracking
tech-stack:
  added: []
  patterns: [detail-scoped tool surface, reducer-driven patch workflow, prompt-after-import selection]

key-files:
  created:
    - src/features/library/components/ManagePatchesPanel.tsx
    - src/features/library/components/ActivePatchChooserDialog.tsx
    - src/features/library/components/PatchEntryChecklist.tsx
    - src/features/library/components/PatchImportDropzone.tsx
    - src/features/library/__tests__/ManagePatchesPanel.test.tsx
  modified:
    - src/features/library/components/GameDetailsPanel.tsx
    - src/features/library/LibraryPage.tsx
    - src/features/library/LibraryPage.css
    - src/features/library/state/libraryStore.ts
    - src/features/library/__tests__/libraryStore.test.ts

key-decisions:
  - "Patch controls stay hidden behind a `Manage patches` affordance inside the game details workflow"
  - "Successful imports and remote fetches immediately route into active patch selection instead of leaving multiple installed files ambiguous"
  - "Patch entry conflicts and compatibility gaps are surfaced as inline warnings only and do not block editing"

requirements-completed: [PATC-01, PATC-02, PATC-03]

# Metrics
duration: ~35min
completed: 2026-03-13
---

# Phase 5 Plan 2: Patch Editor UI and Detail Workflow Integration

**The game detail view now contains an on-demand patch manager with import, community fetch, active-file choice, and entry-level toggles**

## Accomplishments

- Added a `Manage patches` section to game details instead of introducing a detached patch screen
- Built local import drag-drop plus manual picker UI, community fetch actions, and an active patch chooser that allows intentional unpatched state
- Added a flat checklist editor for patch entries with persisted toggle state and inline warnings
- Added frontend tests covering reducer patch state and the main patch manager surface

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml patches::editor`
- `npm run test -- --run src/features/library/__tests__/libraryStore.test.ts src/features/library/__tests__/ManagePatchesPanel.test.tsx`
- `npm run build`

## Notes

- The unsupported remote state uses the exact `No community patch available` message from phase context.
- I did not create per-task commits for this plan because the worktree already contained unrelated uncommitted changes.
