# Phase 3 Research: Library Source Management and Scanning

**Researched:** 2026-03-13
**Phase:** 3 - Library Source Management and Scanning
**Requirements:** LIB-01, LIB-02, LIB-03

## Question

What does Phase 3 need so the app can register local game folders, scan them safely in the background, and persist `.xex` plus ISO-backed discoveries for later review and launch flows?

## Recommended Technical Direction

### Source registration should be backend-owned and persisted under library metadata

- Store configured library sources under `library_metadata_path`, not in renderer-only state.
- Persist a typed source document such as `sources.json` containing:
  - stable source id
  - absolute root path
  - display label
  - created / updated timestamps
  - last scan summary snapshot
- Detect nested sources during add/edit operations by comparing normalized absolute paths in Rust.
- Allow nested sources, but return warnings when a newly added source is already contained by an existing source or contains another registered source.
- When a source is removed, immediately delete its persisted scan results so the library never shows stale entries for a removed path.

### Reuse the Phase 1 job system for scan execution and progress

- Model scans as `scan` category jobs inside the existing `JobRegistry` and task-history pipeline.
- Do not create a second scan progress channel; emit scan progress and logs through the same Tauri events already used by install jobs.
- Introduce a backend scan coordinator that understands:
  - per-source scan requests
  - queued scans
  - cancellation
  - a special `scan all now` path that bypasses the normal queue and launches all sources concurrently
- Keep orchestration in Rust so restart recovery, cancellation semantics, and partial-success handling are consistent.

### Persist scan output separately from source configuration

- Keep source configuration and discovered entries in separate files so source edits do not require rewriting the full discovered catalog.
- Persist discovered entries in a catalog file such as `scan-results.json` keyed by source id.
- Each persisted candidate should include at least:
  - candidate id
  - source id
  - absolute file path
  - relative path under source
  - kind (`xex` or `iso_candidate`)
  - title hint / filename-derived label
  - scan status (`ready`, `duplicate`, `warning`, `skipped`)
  - confidence level
  - warning reasons
  - discovered / updated timestamps
- Persist scan summaries with counts for found, duplicates, warnings, skipped, and canceled/partial status so the UI can render useful summaries without recomputing them.

### `.xex` discovery should be deterministic; ISO detection can stay heuristic

- `.xex` discovery can be phase-3 deterministic: recurse configured folders and treat `.xex` files as title candidates.
- ISO-backed discovery can stay heuristic in phase 3, as allowed by the phase context.
- A practical v1 heuristic is:
  - find files with `.iso` extension
  - derive a display label from the filename
  - mark them as ISO candidates with explicit confidence / warning metadata
  - defer deep disc parsing and identity cleanup to Phase 4
- Keep every plausible `.xex` or ISO candidate visible, even when confidence is low.
- Treat suspicious paths or unreadable files as warnings or skipped records rather than hard failures.

### Duplicate handling should preserve evidence, not merge aggressively

- Duplicate detection should be path-based and source-aware for phase 3.
- Persist duplicate records as separate candidates with duplicate annotations rather than auto-merging them.
- A candidate can be flagged duplicate when:
  - the same canonical file path is discovered from overlapping/nested sources
  - the same relative path and filename appears across sources and basic heuristics indicate the same asset
- Final identity resolution belongs in Phase 4, so phase 3 should preserve all raw evidence needed for later review.

### Cancellation and partial success must preserve useful work

- Cancellation must stop traversal quickly but should not discard candidates already persisted during the running scan.
- Permission errors, disconnected mounts, and unreadable directories should produce partial-success scan status with warnings.
- Incremental persistence is safer than accumulating the whole scan in memory and writing once at the end.
- A good contract is:
  - overwrite a source's previous scan dataset only after the new scan has produced a stable partial or full result set
  - write progress and summary snapshots during the scan
  - mark final scan outcome as `completed`, `partial_success`, `cancelled`, or `failed`

## Planning Implications

### Plan split

The roadmap's two plans should stay distinct:

1. **Source management and scan orchestration**
   - persist source configuration
   - add/remove/list sources with nested-path warnings
   - create backend scan coordinator, queueing, cancellation, and `Scan All Now`
   - create renderer provider and source-management controls
2. **Discovery and persisted results**
   - implement recursive `.xex` detection and heuristic ISO candidate detection
   - persist per-source discovered candidates and summaries
   - expose duplicate/warning/partial-success results in the library UI

### Dependency shape

- Plan `03-01` should run first because it defines the source model, command surface, and scan job lifecycle that discovery work depends on.
- Plan `03-02` should depend on `03-01` because candidate discovery needs stable source ids, persisted source metadata, and scan orchestration hooks.

That yields a clean execution order:
- Wave 1: `03-01`
- Wave 2: `03-02`

## User Decision Constraints To Preserve

- Adding a source should trigger a scan immediately.
- Existing sources should rescan automatically on app launch and manually on user request.
- Users need per-source scanning and a `Scan All Now` action that bypasses the normal queue and runs all sources concurrently.
- Live progress should be detailed, not only a single coarse status line.
- Completed scans must expose found items, duplicates, skipped entries, warnings, and partial-success state.
- Cancellation must keep already discovered items instead of discarding the whole scan.
- Duplicate findings stay visible for later review instead of being auto-merged now.
- ISO detection may be heuristic in this phase as long as candidates and uncertainty are surfaced clearly.

## Risks And Mitigations

### Risk: Nested sources create duplicate-heavy or confusing results

- Mitigation: warn on nested registration, keep stable source ids, and mark duplicate candidates explicitly instead of silently merging them.

### Risk: Long scans lose work on cancellation or partial failure

- Mitigation: incrementally persist source-level results and final scan summaries rather than writing only once at the end.

### Risk: Queueing and `Scan All Now` semantics conflict

- Mitigation: make the coordinator own a single scheduling contract: normal requests queue, while `Scan All Now` drains queued work and launches concurrent source scans under one explicit override mode.

### Risk: ISO detection is too weak to be useful

- Mitigation: persist ISO candidates with confidence + warnings now, and defer deeper identity verification and cleanup to Phase 4 instead of pretending certainty in Phase 3.

### Risk: Renderer state diverges from backend scan truth

- Mitigation: store sources, scan status, summaries, and discovered candidates in backend-owned documents and expose them via typed commands; the React layer should render that contract instead of reconstructing it.

## Verification Guidance

- Prefer focused automated checks per plan:
  - `cargo test --manifest-path src-tauri/Cargo.toml library::sources`
  - `cargo test --manifest-path src-tauri/Cargo.toml library::scan_jobs`
  - `cargo test --manifest-path src-tauri/Cargo.toml library::discovery`
  - `cargo test --manifest-path src-tauri/Cargo.toml library::catalog`
  - `npm run test -- --run src/features/library`
  - `npm run test -- --run src/features/tasks`
  - `npm run build`
- Add Rust tests for:
  - nested-source warning detection
  - source add/remove persistence
  - scan queue vs concurrent override behavior
  - cancellation preserving partial results
  - `.xex` recursion
  - ISO candidate heuristics
  - duplicate and warning annotations
- Add renderer tests for:
  - source management actions
  - scan summary rendering
  - duplicate/warning visibility
  - interrupted/cancelled scan messaging

## Outcome For Planning

Phase 3 should leave the project with a real library-ingestion contract: users can register folders, scans run as background jobs with queueing and cancellation, `.xex` and ISO candidates are persisted under library metadata, and the UI exposes enough scan detail and uncertainty for later library review and launch phases to build on trustworthy data.
