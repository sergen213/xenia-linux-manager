---
phase: 03-library-source-management-and-scanning
plan: 03
subsystem: backend
tags: [rust, tauri, library, scans, queueing, coordinator, regression]

# Dependency graph
requires:
  - phase: 03-library-source-management-and-scanning
    plan: 01
    provides: Scan coordinator, queue/cancel orchestration, job registry integration
  - phase: 03-library-source-management-and-scanning
    plan: 02
    provides: Discovery engine, catalog persistence, real scan runtime
provides:
  - Guaranteed coordinator handoff after every runtime scan exit path
  - Regression coverage for queued follow-up promotion and cancelled-state cleanup
  - Updated scan coordinator documentation that reflects the real discovery pipeline
affects: [04-library-review-and-launch-core]

# Tech tracking
tech-stack:
  added: []
  patterns: [runtime-context separation, async cleanup handoff, queue-promotion regression tests]

key-files:
  created: []
  modified:
    - src-tauri/src/library/scan_jobs.rs

key-decisions:
  - "Queued requests now hold only scan identity data; runtime context is cached separately on the coordinator"
  - "The async runtime releases the coordinator slot after `run_scan_job` returns rather than relying on terminal branches to remember cleanup"
  - "Queue regression coverage stays unit-level to avoid desktop event-loop dependencies in Rust tests"

patterns-established:
  - "Terminal scan cleanup: spawn wrapper calls `finish_scan_runtime_slot` exactly once after `run_scan_job` exits"
  - "Queue promotion: `finish_scan` removes active/cancelled state before activating the next queued request"

requirements-completed: [LIB-01, LIB-02, LIB-03]

# Metrics
duration: ~11min
completed: 2026-03-13
---

# Phase 3 Plan 3: Scan Queue Completion Handoff

**Queued scans now advance automatically after the active scan exits, with regression coverage around queue promotion and cancelled-state cleanup**

## Performance

- **Duration:** ~11 min
- **Completed:** 2026-03-13
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Split queued scan identity from runtime context so queued requests can be promoted without carrying stale app/runtime state in the queue itself
- Wrapped async scan execution with guaranteed coordinator cleanup, ensuring `finish_scan` runs after success, missing-source failure, cancellation, or catalog-persistence failure paths
- Replaced stale placeholder comments with documentation that matches the live discovery and catalog pipeline
- Added regression tests proving `finish_scan` promotes the next queued request and clears cancelled state before the next scan starts

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml library::scan_jobs`
- `cargo test --manifest-path src-tauri/Cargo.toml library::discovery`
- `cargo test --manifest-path src-tauri/Cargo.toml library::catalog`

## Task Commits

1. **Plan implementation and regression coverage** - `236096a` (`fix`)

## Files Modified

- `src-tauri/src/library/scan_jobs.rs` - runtime cleanup handoff, runtime-context separation, updated comments, and queue regression tests

## Decisions Made

- Queue progression is enforced at the async spawn boundary, not scattered across terminal branches inside `run_scan_job`
- Regression coverage targets coordinator state transitions directly, which avoids brittle GUI runtime requirements while still locking the queue contract down

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworked regression tests away from Wry event-loop construction**
- **Found during:** Task 2 verification
- **Issue:** A first-pass end-to-end queue test required constructing a Wry event loop on a non-main test thread, which panicked under Linux CI semantics
- **Fix:** Kept the runtime cleanup implementation intact and moved regression assertions to coordinator state-transition tests that directly validate queue promotion and cancelled-state cleanup
- **Files modified:** `src-tauri/src/library/scan_jobs.rs`
- **Verification:** `cargo test --manifest-path src-tauri/Cargo.toml library::scan_jobs`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No product-scope change; only the regression-testing seam changed.

## Issues Encountered

- The crate still emits unrelated pre-existing Rust warnings in other modules during test runs. They do not block the scan coordinator fix.

## User Setup Required

None.

## Next Phase Readiness

- Phase 3 is complete; phase 4 can build library review, correction, and launch flows on top of stable scan queue behavior and persisted discovery results.
