---
phase: 03-library-source-management-and-scanning
plan: 02
subsystem: full-stack
tags: [rust, react, tauri, library, discovery, catalog, xex, iso, scan]

# Dependency graph
requires:
  - phase: 03-library-source-management-and-scanning
    plan: 01
    provides: Source registry, scan coordinator, library provider, and scan job placeholder
provides:
  - Recursive .xex and heuristic ISO candidate discovery engine
  - Persisted scan-results catalog with partial-success and cancellation-safe persistence
  - Frontend scan summary and discovery results surfaces with filtering
  - Dashboard library counts from persisted catalog data
affects: [04-library-review-and-launch-core]

# Tech tracking
tech-stack:
  added: []
  patterns: [recursive directory walker with cancellation callback, catalog-per-source JSON persistence, confidence-annotated candidate model]

key-files:
  created:
    - src-tauri/src/library/discovery.rs
    - src-tauri/src/library/catalog.rs
    - src/features/library/components/ScanResultsSummary.tsx
    - src/features/library/components/ScanResultsSummary.css
    - src/features/library/components/DiscoveryResultsTable.tsx
    - src/features/library/components/DiscoveryResultsTable.css
  modified:
    - src-tauri/src/library/mod.rs
    - src-tauri/src/library/scan_jobs.rs
    - src-tauri/src/commands/library.rs
    - src-tauri/src/lib.rs
    - src/features/library/model/libraryTypes.ts
    - src/features/library/api/libraryClient.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/state/LibraryProvider.tsx
    - src/features/library/LibraryPage.tsx
    - src/features/library/LibraryPage.css
    - src/features/dashboard/DashboardHome.tsx
    - src/features/dashboard/DashboardHome.css

key-decisions:
  - "Confidence model: high for .xex (deterministic), medium for .god/.xiso (Xbox-specific), low for generic .iso (heuristic)"
  - "ISO size heuristic: 100MB-8GB range flags plausible Xbox 360 content; outside range gets warning status"
  - "Label derivation: parent folder for default.xex files, file stem for named xex and all ISO candidates"
  - "Catalog status derivation: completed/partial-success/partial-cancelled/cancelled/failed from error+cancel state"
  - "Cross-source duplicate detection: collect existing paths from all other source catalogs before scanning"

patterns-established:
  - "Discovery engine: recursive walker with cancel_check callback for cooperative cancellation"
  - "Catalog persistence: per-source JSON document under library_metadata_path with atomic write"
  - "Candidate annotation: never silently drop entries; mark duplicates, warnings, skipped with reason"

requirements-completed: [LIB-02, LIB-03]

# Metrics
duration: ~45min
completed: 2026-03-13
---

# Phase 3 Plan 2: Discovery Engine, Scan Catalog, and Library UI Summary

**Recursive .xex/ISO discovery with confidence annotations, persisted scan catalog with partial-success preservation, and filterable candidate results table in Library page**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-13T21:36:06Z
- **Completed:** 2026-03-13T22:21:00Z
- **Tasks:** 3
- **Files created:** 6
- **Files modified:** 12

## Accomplishments
- Recursive directory walker discovers .xex files deterministically and .iso/.god/.xiso files heuristically with high/medium/low confidence
- Candidates annotated with status (found/duplicate/warning/skipped) and warning messages instead of being silently dropped
- Scan results persisted per-source in catalog JSON with status derivation: completed, partial-success, partial-cancelled, cancelled, failed
- run_scan_job now executes real discovery with cross-source duplicate detection and cooperative cancellation
- ScanResultsSummary shows aggregate stats with partial-outcome notices for cancelled/errored scans
- DiscoveryResultsTable renders filterable candidate list with kind badges, confidence levels, and warning annotations
- Dashboard Library card shows live game counts and last scan status from catalog data
- 26 backend tests (14 discovery + 12 catalog) and 38 frontend tests (12 store + 8 panel + 5 summary + 7 table + 6 dashboard)

## Task Commits

Each task was committed atomically:

1. **Task 1: Recursive .xex discovery and heuristic ISO candidate detection** - `2300cee` (feat)
2. **Task 2: Persisted scan catalog and discovery-hooked scan pipeline** - `3ed65ca` (feat)
3. **Task 3: Scan summaries, discovery results table, and library counts in dashboard** - `18e4ee3` (feat)

## Files Created/Modified
- `src-tauri/src/library/discovery.rs` - Recursive walker, candidate evaluation, confidence/status annotation
- `src-tauri/src/library/catalog.rs` - Per-source catalog persistence, status derivation, path collection
- `src-tauri/src/library/scan_jobs.rs` - Discovery engine integration with cancellation and catalog persistence
- `src-tauri/src/commands/library.rs` - get_source_catalog and get_all_catalogs Tauri commands
- `src/features/library/components/ScanResultsSummary.tsx` - Aggregate scan outcome stats with partial notices
- `src/features/library/components/DiscoveryResultsTable.tsx` - Filterable candidate list with badges and warnings
- `src/features/library/model/libraryTypes.ts` - DiscoveredCandidate, CatalogScanSummary, SourceCatalog types
- `src/features/library/state/libraryStore.ts` - catalogs state, CATALOGS_LOADED action
- `src/features/dashboard/DashboardHome.tsx` - Library counts and last scan status from catalog data

## Decisions Made
- Confidence model uses three levels: high for deterministic .xex matches, medium for Xbox-specific .god/.xiso formats, low for generic .iso
- ISO size heuristic: 100MB-8GB flags plausible Xbox 360 content; outside this range produces warning status
- Label derivation prefers parent folder name for default.xex files (since most Xbox 360 games use that filename)
- Cross-source duplicate detection collects all known paths from other sources before scanning to avoid cross-source duplicates
- Catalog status derives from combination of error count, cancellation flag, and found count for nuanced outcome reporting

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing unused import/variable TS errors**
- **Found during:** Task 3 (npm run build)
- **Issue:** cancelScan import and appDataPath variable unused in LibrarySourcesPanel.tsx; xeniaState unused in TasksPage.tsx -- all pre-existing from plan 03-01 and 02-03
- **Fix:** Removed unused import/variable, prefixed xeniaState with underscore
- **Files modified:** src/features/library/components/LibrarySourcesPanel.tsx, src/features/tasks/TasksPage.tsx
- **Verification:** npm run build passes cleanly
- **Committed in:** 18e4ee3 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing TS strictness issue, no scope creep.

## Issues Encountered
None beyond the pre-existing TS warnings.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discovery engine and catalog are ready for phase 04 to build review and launch flows on top of persisted candidates
- Candidate metadata (kind, confidence, status, warning) provides the foundation for review decisions
- Dashboard library card is live and will update as scans produce results
- Scan coordinator finish_scan still needs to be called from the scan job to advance the queue -- this will need attention if queue semantics are tested end-to-end

---
*Phase: 03-library-source-management-and-scanning*
*Completed: 2026-03-13*
