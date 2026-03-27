---
phase: 04-library-review-and-launch-core
plan: 01
subsystem: frontend-backend
tags: [rust, tauri, react, library, review, browse, detail]

# Dependency graph
requires:
  - phase: 03-library-source-management-and-scanning
    plan: 01
    provides: Source registry and scan job orchestration
  - phase: 03-library-source-management-and-scanning
    plan: 02
    provides: Persisted discovery catalogs and candidate metadata
  - phase: 03-library-source-management-and-scanning
    plan: 03
    provides: Stable scan completion and queue handoff
provides:
  - Backend browse/detail/review read model for the resolved library
  - Library organizer UI with cover-grid browsing and dedicated details panel
  - Review inbox separated from the primary library surface
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [backend-owned read model, detail-first library workflow, reducer-driven organizer state]

key-files:
  created:
    - src-tauri/src/library/review.rs
    - src/features/library/components/LibraryFiltersBar.tsx
    - src/features/library/components/LibraryGrid.tsx
    - src/features/library/components/ReviewInboxPanel.tsx
    - src/features/library/components/GameDetailsPanel.tsx
  modified:
    - src-tauri/src/commands/library.rs
    - src-tauri/src/lib.rs
    - src/features/library/api/libraryClient.ts
    - src/features/library/model/libraryTypes.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/LibraryPage.tsx
    - src/features/library/LibraryPage.css
    - src/features/dashboard/DashboardHome.tsx

key-decisions:
  - "The renderer now consumes browse cards, review inbox items, and detail payloads from a backend-owned read model instead of reconstructing library state from raw catalogs"
  - "Low-confidence and duplicate candidates stay in a separate review inbox while the main grid only shows curated browse-ready titles"
  - "Game selection stays detail-first inside the library workspace rather than introducing a detached launcher list"

requirements-completed: [LIB-05]

# Metrics
duration: ~38min
completed: 2026-03-13
---

# Phase 4 Plan 1: Library Browse, Review Inbox, and Detail Workflow

**Scan output now resolves into a browseable cover-grid library with dedicated game details and a separate review inbox**

## Accomplishments

- Added a Rust review read model that turns source catalogs plus identity overlays into browse cards, review inbox payloads, and detailed game records
- Replaced the raw scan-summary library screen with an organizer-style workspace: cover grid, search/filter/sort controls, and a dedicated details panel
- Split review work out of the main grid so duplicate and low-confidence items are visible without polluting the primary browse flow
- Fed the dashboard from resolved library state so the app reports curated library health instead of only raw discovery totals

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml library::review::tests::browse_library_returns_only_curated_cards -- --exact`
- `npm run test -- --run src/features/library/__tests__/libraryStore.test.ts src/features/dashboard/__tests__/DashboardHome.test.tsx src/app/router.test.tsx`
- `npm run build`

## Notes

- I did not create per-task commits for this plan because the repository already contained unrelated uncommitted changes in the same worktree.
