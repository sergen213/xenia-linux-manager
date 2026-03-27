# Phase 5 Research: Patch Management

**Researched:** 2026-03-13
**Phase:** 5 - Patch Management
**Requirements:** PATC-01, PATC-02, PATC-03

## Question

What does Phase 5 need so detected titles can manage Canary-compatible patch files safely, fetch supported community patches automatically, and persist per-entry toggle decisions without painting the later launch/profile phases into a corner?

## Recommended Technical Direction

### Treat patch files as managed library assets, not loose files in the Xenia install

- Patch state should live under the existing `library_metadata_path`, not inside the active Xenia install tree.
- Use a backend-owned patch inventory per canonical game id, for example:
  - `library_metadata_path/patches/{game_id}/manifest.json`
  - `library_metadata_path/patches/{game_id}/sources/*.patch.toml`
  - `library_metadata_path/patches/{game_id}/entry-overrides.json`
- This keeps patch decisions stable across Xenia reinstalls and update promotions from Phase 2.
- The Phase 2 install manifest already treats the emulator directory as replaceable. Patch management should not assume files inside `install_dir` survive update workflows.

### Separate source files from user toggle state

- The imported or fetched `.patch.toml` file should be treated as source material.
- Persist enabled or disabled decisions separately for each installed patch file rather than mutating the original file in place.
- This matches the context requirement that toggle state is stored per patch file and lets the app:
  - preserve user-imported files verbatim
  - compare fetched remote updates against the last fetched version
  - re-render editor state even if source files are refreshed
- Backend read models should expose a normalized patch entry list with:
  - patch file id
  - provenance (`local_import`, `remote_fetch`, future-compatible `bundled`)
  - last updated timestamp
  - active/non-active status
  - entry-level enabled state
  - warnings such as likely conflict or incomplete metadata

### Use source adapters, but only ship the sources Phase 5 actually promises

- The requirement wording mentions bundled or local patch files, but the locked phase context narrows Phase 5 to:
  - local `.patch.toml` import
  - remote community patch fetch from the Xenia Canary patch repository
- The clean reconciliation is to implement a source-adapter seam now, with concrete adapters for:
  - local file import
  - remote community repository fetch
- A `bundled` provenance type can exist in the model for forward compatibility, but the phase should not invent a real bundled catalog that the context explicitly excluded.

### Match remote fetches by title identity, not by UI title text

- Remote lookup should key off canonical game identity from the Phase 4 library layer, not free-form display names.
- The Xenia Canary patch repository organizes game patches as title-id keyed `.patch.toml` files, which means Phase 5 depends on the library domain exposing a stable title identifier for detected titles.
- Remote fetch results should be normalized into the same stored-patch model as local imports so the rest of the app does not care where a patch file came from.
- If a fetched remote patch already exists locally for the same remote source and a newer version is available, the backend should require explicit confirmation before replacing the stored remote file in place.

### Make active patch selection explicit and persistent

- The context is clear that a game may have multiple installed patch files and the user must choose the active one.
- Persist active selection separately from patch file contents so:
  - imported and fetched files can coexist
  - the user can switch between alternatives without re-importing
  - later launch integration can resolve one active patch file deterministically
- The backend should also support the valid empty state:
  - multiple patch files exist
  - none is active
  - game launches unpatched until one is chosen

### Keep the patch editor inside the library detail workflow from Phase 4

- Patch management belongs in the detail-first library experience, not as a separate top-level route.
- The context explicitly says patch controls remain behind a `Manage patches` affordance until the editor is opened.
- The renderer should follow the existing provider + reducer pattern already used by settings and tasks, and extend the library feature rather than adding a disconnected patch feature tree.
- Good UI boundaries for this phase are:
  - a collapsed patch summary on the game detail screen
  - an active patch chooser
  - a patch entry checklist editor
  - import / fetch actions scoped to the selected game

### Conflict and compatibility handling should warn, not block

- Patch entries should render as a flat checklist.
- Conflict detection can stay heuristic in Phase 5. It only needs to surface likely overlap or incompatible-looking entries as inline warnings.
- Invalid or unreadable local files are different: those must be rejected completely on import.
- Incomplete or suspicious entries inside an otherwise readable patch file should remain editable with warnings attached to the affected entries or file.

## Planning Implications

### Plan split

The roadmap's two plans should stay distinct:

1. **Patch source adapters and local patch storage**
   - backend storage layout under `library_metadata_path`
   - local `.patch.toml` import validation
   - remote community patch lookup and update confirmation
   - persisted active-file selection and per-file entry override model
2. **Patch editor UI and per-entry enable/disable persistence**
   - detail-view `Manage patches` affordance
   - active patch chooser after import or fetch
   - flat checklist editor with warnings
   - toggle persistence and empty/unsupported-state messaging

### Dependency shape

- Plan `05-01` should run first because it defines the backend patch contract the UI depends on.
- Plan `05-02` should depend on `05-01` because the editor and chooser should talk to real persisted inventory, not temporary renderer-only models.

That yields a clean execution order:
- Wave 1: `05-01`
- Wave 2: `05-02`

## User Decision Constraints To Preserve

- Remote support in this phase is community fetch from the Xenia Canary patch repository.
- This phase does not introduce a bundled patch catalog even though the model should stay compatible with one later.
- One patch file can contain many toggleable entries.
- Imported and fetched patch files for the same game must be allowed to coexist.
- The user must choose which installed patch file is active.
- Show the last fetched or updated date and whether a patch file was imported or app-fetched.
- Patch entries render as a simple flat checklist.
- Conflicts warn but do not block.
- Toggle state persists separately for each installed patch file.
- Patch controls stay behind a `Manage patches` affordance.
- Local install supports both manual file picking and drag-and-drop import.
- Remote fetch should auto-match the supported community patch for the current game.
- Updating a previously fetched community patch requires confirmation.
- After successful import or fetch, prompt for active patch selection immediately.
- Invalid or unreadable local patch files are rejected.
- `No community patch available` is the exact unsupported remote message.
- If multiple patch files exist with no active selection, the game remains unpatched until the user chooses one.
- Incompatible or incomplete entries produce inline warnings only.

## Risks And Mitigations

### Risk: Xenia install updates wipe out patch state

- Mitigation: keep canonical patch inventory under `library_metadata_path` and treat any emulator-install copy or materialized output as derived state.

### Risk: Patch toggle persistence corrupts imported or fetched source files

- Mitigation: store source files as immutable inputs and persist entry-level enabled state in a separate override document keyed by patch file id and entry identifier.

### Risk: Remote patch lookup becomes brittle because it depends on UI-facing names

- Mitigation: fetch by canonical game identity from the library domain, preferably title-id-backed metadata, and isolate repository-specific lookup logic in a dedicated adapter.

### Risk: Users lose track of which patch file is actually in effect

- Mitigation: persist active patch file selection explicitly, show provenance and last-updated metadata in the chooser, and prompt for selection immediately after import or fetch.

### Risk: Phase 5 overreaches into full launch orchestration

- Mitigation: complete patch storage, selection, and editor workflows now, but keep final launch-time composition with profiles as a separate concern for Phase 6.

## Verification Guidance

- Prefer focused automated checks per plan:
  - `cargo test --manifest-path src-tauri/Cargo.toml patches::storage`
  - `cargo test --manifest-path src-tauri/Cargo.toml patches::sources`
  - `cargo test --manifest-path src-tauri/Cargo.toml patches::editor`
  - `npm run test -- --run src/features/library/state`
  - `npm run test -- --run src/features/library/components`
  - `npm run build`
- Add Rust tests for:
  - invalid local patch rejection
  - remote repository match resolution
  - remote update confirmation gating
  - coexistence of imported and fetched patch files
  - active patch selection persistence
  - per-file entry override persistence
- Add renderer tests for:
  - manage-patches affordance and editor open flow
  - prompt to choose active patch after import or fetch
  - flat checklist rendering
  - inline warning presentation for conflicts or incomplete entries
  - exact empty-state messaging when no community patch exists

## Outcome For Planning

Phase 5 should leave the project with a durable patch-management contract: patch files are stored and tracked independently of the emulator install, imported and fetched files can coexist with clear provenance, one active patch file can be selected per game, and users can review or toggle individual entries from the game detail workflow without blocking future launch/profile composition work.
