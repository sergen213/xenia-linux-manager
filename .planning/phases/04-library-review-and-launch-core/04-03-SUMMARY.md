---
phase: 04-library-review-and-launch-core
plan: 03
subsystem: frontend-backend
tags: [rust, tauri, react, launch, preflight, xenia]

# Dependency graph
requires:
  - phase: 04-library-review-and-launch-core
    plan: 01
    provides: Resolved browse/detail/review contracts
  - phase: 04-library-review-and-launch-core
    plan: 02
    provides: Persisted identity overlay and correction workflows
provides:
  - Backend launch preflight classification using installed Xenia state
  - Warning-confirmation flow for suspicious but launchable titles
  - Immediate running-session and last-played updates after launch start
affects: [05-patch-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [backend launch preflight, warning-gated launch, session-state persistence]

key-files:
  created:
    - src-tauri/src/library/launch.rs
    - src/features/library/components/LaunchPreflightPanel.tsx
    - src/features/library/components/LaunchWarningDialog.tsx
  modified:
    - src-tauri/src/commands/library.rs
    - src-tauri/src/library/identity.rs
    - src-tauri/src/library/review.rs
    - src/features/library/api/libraryClient.ts
    - src/features/library/model/libraryTypes.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/components/GameDetailsPanel.tsx
    - src/features/library/LibraryPage.tsx
    - src/features/dashboard/DashboardHome.tsx

key-decisions:
  - "Launch preflight is fully backend-owned and checks installed Xenia state, executable-path validity, unresolved review work, and unsupported source certainty before launch is allowed"
  - "Suspicious-but-launchable titles stay blocked behind explicit confirmation rather than silently launching"
  - "Launch start writes running-session and last-played metadata into the same identity overlay used by the library browse model"

requirements-completed: [LAUN-01, LAUN-03, LIB-05]

# Metrics
duration: ~21min
completed: 2026-03-13
---

# Phase 4 Plan 3: Launch Preflight and Xenia Process Spawning

**Curated titles now expose backend-owned readiness checks, warning-confirmed launch actions, and immediate session tracking when Xenia starts**

## Accomplishments

- Added launch preflight classification that blocks missing Xenia installs, missing game paths, unresolved review work, and unsupported low-confidence source shapes
- Added detail-view launch readiness messaging and explicit warning confirmation for suspicious but technically launchable entries
- Wired library launch requests through a typed backend command that spawns the installed Xenia executable with the selected game path
- Persisted `last_played_at` and running-session metadata immediately after launch start so browse surfaces can reflect recent activity

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml library::launch::tests::preflight_blocks_missing_game_path -- --exact`
- `npm run test -- --run src/features/library/__tests__/libraryStore.test.ts src/features/dashboard/__tests__/DashboardHome.test.tsx src/app/router.test.tsx`
- `npm run build`

## Notes

- I did not create per-task commits for this plan because the repository already contained unrelated uncommitted changes in the same worktree.
