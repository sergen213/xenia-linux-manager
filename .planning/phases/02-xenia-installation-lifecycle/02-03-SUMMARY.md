---
phase: 02-xenia-installation-lifecycle
plan: 03
subsystem: ui
tags: [react, typescript, tauri-invoke, context-reducer, lifecycle, install-ui, recovery]

# Dependency graph
requires:
  - phase: 02-xenia-installation-lifecycle
    plan: 01
    provides: Release metadata fetch, download pipeline, archive extraction, staging validation
  - phase: 02-xenia-installation-lifecycle
    plan: 02
    provides: Persisted install manifest, lifecycle state model, update detection, rollback-safe promotion
provides:
  - Renderer Xenia lifecycle client with Tauri invoke bridge for all backend commands
  - Adaptive state model deriving Install|Update|Retry primary action from backend state
  - Dashboard lifecycle card with version info, update detection, and confirmation dialog
  - Failure recovery panel with technical details, cleanup, and removal actions
  - Tasks page integration separating Xenia lifecycle jobs from generic background tasks
affects: [03-library-source-management-and-scanning, 04-library-review-and-launch-core]

# Tech tracking
tech-stack:
  added: []
  patterns: [context+reducer for xenia lifecycle state, adaptive primary action derivation, overlay dialog with confirm/progress/success/error phases]

key-files:
  created:
    - src/features/xenia/model/xeniaTypes.ts
    - src/features/xenia/api/xeniaClient.ts
    - src/features/xenia/state/xeniaStore.ts
    - src/features/xenia/state/XeniaProvider.tsx
    - src/features/xenia/components/XeniaLifecycleCard.tsx
    - src/features/xenia/components/XeniaLifecycleDialog.tsx
    - src/features/xenia/components/XeniaRecoveryActions.tsx
  modified:
    - src/features/dashboard/DashboardHome.tsx
    - src/features/tasks/TasksPage.tsx
    - src/App.tsx

key-decisions:
  - "Context+reducer pattern for Xenia state consistent with settings and tasks stores"
  - "Adaptive primary action derived from lifecycle status + update availability"
  - "Dialog phases (confirm/progress/success/error) avoid silent operations"
  - "Recovery panel shows both friendly summary and expandable technical details"
  - "TasksPage separates Xenia lifecycle jobs from generic tasks for clearer recovery flow"

patterns-established:
  - "XeniaProvider loads install state on mount and auto-checks for updates when installed"
  - "Dialog overlay pattern with phase state machine for multi-step user flows"
  - "Recovery actions panel conditionally rendered based on failure state presence"

requirements-completed: [XEN-02, XEN-03, XEN-04]

# Metrics
duration: 23min
completed: 2026-03-13
---

# Phase 2 Plan 3: Install/Update UI, Progress Reporting, and Recovery Handling Summary

**Dashboard lifecycle card with adaptive Install|Update|Retry action, confirmation dialog with next-step guidance, and failure recovery panel surfacing logs, cleanup, and removal**

## Performance

- **Duration:** 23 min
- **Started:** 2026-03-13T16:26:00Z
- **Completed:** 2026-03-13T16:49:47Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Dashboard Xenia card replaced placeholder with real lifecycle state, version, release date, and adaptive primary action
- Confirmation dialog prevents silent operations and shows release info, file size, and previous failure context
- Success phase provides next-step checklist (library setup, settings review, logs)
- Recovery panel surfaces failure summary, expandable technical details, and manual cleanup/remove actions
- TasksPage separates Xenia lifecycle jobs into their own section with retry-safe handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Renderer lifecycle client, adaptive state model, and provider** - `8a58479` (feat)
2. **Task 2: Dashboard lifecycle card, confirmation dialog, and next-step flows** - `fedbd9f` (feat)
3. **Task 3: Failure recovery panel, retry-safe lifecycle handling, and Tasks integration** - `e6ba555` (feat)

## Files Created/Modified
- `src/features/xenia/model/xeniaTypes.ts` - TypeScript types mirroring Rust install-state and release models
- `src/features/xenia/api/xeniaClient.ts` - Tauri invoke bridge for all lifecycle commands
- `src/features/xenia/state/xeniaStore.ts` - Context + reducer store with adaptive primary action selectors
- `src/features/xenia/state/XeniaProvider.tsx` - Provider loading install state and auto-checking for updates
- `src/features/xenia/components/XeniaLifecycleCard.tsx` - Dashboard card with version, status, and primary action
- `src/features/xenia/components/XeniaLifecycleDialog.tsx` - Confirm/progress/success/error dialog flow
- `src/features/xenia/components/XeniaRecoveryActions.tsx` - Failure recovery with cleanup and removal
- `src/features/dashboard/DashboardHome.tsx` - Replaced placeholder Xenia card with lifecycle card
- `src/features/tasks/TasksPage.tsx` - Xenia lifecycle job separation and retry-safe handling
- `src/App.tsx` - Added XeniaProvider to component tree

## Decisions Made
- Used context+reducer pattern for Xenia state, consistent with settings and tasks stores
- Adaptive primary action is derived from lifecycle status + update availability, not stored
- Dialog uses phase state machine (confirm -> progress -> success/error) to prevent silent operations
- Recovery panel shows both user-friendly summary and expandable technical details
- TasksPage separates Xenia lifecycle jobs from generic background tasks for clearer recovery flow

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete install/update UI connects all backend lifecycle commands to user-facing controls
- Recovery panel provides full failure visibility without leaving the emulator in invalid state
- Phase 2 is now complete -- ready for Phase 3 (Library Source Management and Scanning)
- The XeniaProvider pattern established here can be extended for future lifecycle features

---
*Phase: 02-xenia-installation-lifecycle*
*Completed: 2026-03-13*

## Self-Check: PASSED
