# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Linux desktop users can get Xenia running and manage their Xbox 360 game library with minimal setup friction from a single native app.
**Current focus:** Phase 7 - Save Portability and Safety

## Current Position

Phase: 7 of 8 (Save Portability and Safety)
Plan: 2 of 2 complete in current phase
Status: In Progress
Last activity: 2026-03-14 — Completed save management UI with overwrite warnings and recovery messaging

Progress: [################] 90%

## Performance Metrics

**Velocity:**
- Total plans completed: 19
- Average duration: 13min
- Total execution time: 4.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3 | 63min | 21min |
| 2 | 3 | 37min | 12min |
| 3 | 3 | 31min | 10min |
| 4 | 3 | 85min | 28min |
| 5 | 2 | 90min | 45min |
| 6 | 3 | 31min | 10min |
| 7 | 2 | 28min | 14min |

**Recent Trend:**
- Last 5 plans: 35min, 7min, 9min, 15min, 13min
- Trend: Variable complexity, consistently shipping

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization: AppImage-first distribution for Linux desktop usage
- Initialization: Bundled plus remote sources for patches and optimized profiles
- Initialization: Recursive scan plus manual correction workflow for game discovery
- 01-01: Separated vite/vitest configs to avoid vite 8 / vitest 3 type conflicts
- 01-01: Feature-oriented src layout with route registry pattern for extensible navigation
- 01-01: Route registry (AppRoute[]) decouples sidebar from section implementation
- 01-02: Context + reducer pattern for settings state rather than third-party state library
- 01-02: Path validation creates directories and writes probe files to verify writability
- 01-02: First-run gate in App.tsx separates setup from main shell at component level
- 01-02: useRouteRestore hook fires save on every route change for restart restore
- 01-03: Context+reducer pattern for tasks state consistent with settings store
- 01-03: TasksProvider loads history on mount and subscribes to real-time events
- 01-03: Interrupted job recovery is generic for later install/scan plans to hook handlers
- 02-01: Metadata-driven release discovery via GitHub API instead of hardcoded wiki URL
- 02-01: System tar/unzip for extraction instead of Rust crate dependencies
- 02-01: Arc<JobRegistry> as Tauri managed state for thread-safe background job sharing
- 02-01: Three-step install pipeline (download 70%, extract 20%, validate 10%) for granular progress
- 02-02: Atomic JSON persistence with write-to-temp-then-rename for install state
- 02-02: Backup directory for rollback-safe promotion before placing new build
- 02-02: Unified install/update pipeline with is_update flag for failure categorization
- 02-02: Progress rebalanced to 5 steps (download 60%, extract 20%, validate 5%, promote 10%, state 5%)
- 02-03: Context+reducer pattern for Xenia state consistent with settings and tasks stores
- 02-03: Adaptive primary action derived from lifecycle status + update availability
- 02-03: Dialog phases (confirm/progress/success/error) prevent silent operations
- 02-03: Recovery panel shows friendly summary + expandable technical details
- 02-03: TasksPage separates Xenia lifecycle jobs from generic tasks for clearer recovery
- 03-03: Scan coordinator retains runtime context separately from queued request data so terminal cleanup can advance the next queued scan
- 03-03: Async scan runtime always calls `finish_scan` after `run_scan_job` exits, preserving queue progression across success, failure, and cancellation
- 04-01: Library browse, review inbox, and detail payloads are backend-owned read models derived from scan catalogs plus identity overlays
- 04-02: Manual titles, corrections, duplicate review outcomes, and launch-session metadata persist in `library-identity.json` instead of mutating raw scan catalogs
- 04-03: Launch preflight is backend-owned and blocks missing Xenia state, missing files, unresolved review work, and unsupported low-confidence source shapes
- 05-01: Patch files, manifests, and per-entry overrides persist under `library_metadata_path/patches/{game_id}` instead of inside the Xenia install directory
- 05-01: Imported and community-fetched patch files stay immutable while enable or disable state persists separately per patch file
- 05-02: Patch controls stay detail-scoped behind a `Manage patches` affordance and prompt for active-file selection immediately after import or fetch
- 06-01: Profiles stored under library_metadata_path/profiles/{game_id} with sparse-override documents and backend-computed effective config
- 06-01: Null values in profile overrides are filtered on save to restore default inheritance instead of persisting empty values
- 06-01: First profile created for a game is auto-selected as the active profile
- 06-02: Recommendation source trait with null default ensures no placeholder UI when no source exists
- 06-02: Recommended profiles normalize into the same local profile system with provenance tracking
- 06-03: Launch materialization produces a deterministic snapshot combining active profile effective config and active patch state
- 06-03: Standard and raw editors share one underlying sparse draft object to avoid diverging sources of truth
- 06-03: Unsaved-change dialog intercepts game selection and editor close when draft is dirty
- 07-01: Save path resolution uses library identity game_id and title_id to build canonical roots
- 07-01: Archive format is standard zip with manifest.json for portability and inspectability
- 07-02: Import wizard uses dispatch-driven step state shared through library store for both dedicated and detail entry points
- 07-02: Conflict preview enforces only three approved policies (Replace all, Keep both, Cancel)

### Pending Todos

None yet.

### Blockers/Concerns

- Packaged AppImage update/release flow must be verified before promising in-app manager updates later.
- Launch currently uses local process spawning against the installed Xenia executable path; packaged validation should confirm this behaves correctly under the final AppImage environment.

## Session Continuity

Last session: 2026-03-14
Stopped at: Completed 07-02-PLAN.md (save management UI, overwrite warnings, recovery messaging)
Resume file: None
