---
phase: 04-library-review-and-launch-core
plan: 02
subsystem: frontend-backend
tags: [rust, tauri, react, identity, manual-entry, duplicate-resolution]

# Dependency graph
requires:
  - phase: 04-library-review-and-launch-core
    plan: 01
    provides: Resolved browse/detail/review contracts and library workspace
provides:
  - Persisted identity overlay for manual entries and corrections
  - In-detail correction workflow and lightweight manual add path
  - Duplicate-resolution actions shared between queue and table review modes
affects: [04-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [identity-overlay persistence, manual-first game creation, review-outcome persistence]

key-files:
  created:
    - src-tauri/src/library/identity.rs
    - src/features/library/components/ManualGameForm.tsx
    - src/features/library/components/GameIdentityEditor.tsx
    - src/features/library/components/DuplicateResolutionTable.tsx
  modified:
    - src-tauri/src/commands/library.rs
    - src-tauri/src/library/review.rs
    - src/features/library/api/libraryClient.ts
    - src/features/library/model/libraryTypes.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/components/ReviewInboxPanel.tsx
    - src/features/library/components/GameDetailsPanel.tsx
    - src/features/library/LibraryPage.tsx

key-decisions:
  - "Manual entries, title/path corrections, and duplicate-review outcomes are stored in a dedicated identity document under library metadata"
  - "Manual correction stays inside the existing details screen rather than using a detached flow"
  - "Duplicate review actions write backend outcomes first and then refresh the resolved browse/review payloads"

requirements-completed: [LIB-04, LIB-05]

# Metrics
duration: ~26min
completed: 2026-03-13
---

# Phase 4 Plan 2: Manual Add, Corrections, and Identity Persistence

**Users can now create first-class manual titles, correct bad detection data, and persist duplicate-review outcomes without rescans overwriting those decisions**

## Accomplishments

- Added `library-identity.json` persistence for manual titles, identity overrides, duplicate-resolution outcomes, and launch session metadata
- Implemented a lightweight manual add flow that requires only title and executable path
- Embedded title/path correction and issue-note editing into the game details panel
- Added duplicate review actions that operate from the review inbox and persist backend outcomes by review key

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml library::identity::tests::create_manual_game_persists_first_class_record -- --exact`
- `npm run test -- --run src/features/library/__tests__/libraryStore.test.ts src/features/dashboard/__tests__/DashboardHome.test.tsx src/app/router.test.tsx`
- `npm run build`

## Notes

- I did not create per-task commits for this plan because the repository already contained unrelated uncommitted changes in the same worktree.
