# Phase 7 Research: Save Portability and Safety

**Researched:** 2026-03-13
**Phase:** 7 - Save Portability and Safety
**Requirements:** SAVE-01, SAVE-02, SAVE-03

## Question

What does Phase 7 need so save export and import workflows are portable, inspectable, and cautious enough for real backup or migration use, while still fitting the current Tauri plus React architecture and the locked context decisions for conflict handling and recovery?

## Recommended Technical Direction

### Treat save operations as a backend-owned domain with explicit manifests and job support

- Save import and export should be implemented as a new backend domain under `src-tauri/src/saves`.
- The backend should remain the source of truth for:
  - save path resolution per canonical game
  - archive manifest generation and validation
  - conflict detection
  - backup creation before import
  - per-item operation results
- Long-running save jobs should reuse the existing job registry and task history model instead of inventing a one-off progress system.
- Save operation metadata should live under `library_metadata_path`, while transient staging and backup archives should live under `app_data_path`.

### Use an inspectable zip format with a first-class manifest

- The context locks export to a normal `.zip` archive that users can inspect directly.
- Each export should include:
  - `manifest.json` with game identity, export timestamp, selected content, and archive version
  - `save/` payload with selected save folders or slots
  - `settings/` payload for the effective per-game config or profile snapshot
  - `patches/` payload for active patch state or managed patch files needed for portability
- Archive filenames should be human-readable and deterministic, for example `{game-title}-{yyyy-mm-dd-hhmmss}.zip`, with backend sanitization for filesystem safety.
- Import should trust archive metadata only after validation and still cross-check the selected or detected game against the current library record.

### Resolve save locations through library identity instead of raw UI paths

- Save workflows should not rely on renderer-provided arbitrary paths.
- The backend needs a `paths.rs` or equivalent resolver that derives:
  - the canonical local save root for a game
  - the local profile/settings location to snapshot
  - the local patch state location to snapshot
- Because Phases 3 through 6 establish game identity, patches, and profiles, Phase 7 should depend on those canonical backend contracts rather than recalculate paths in the renderer.
- Missing or ambiguous local save roots must produce explicit preflight results, not partial filesystem guesses.

### Stage imports before any destructive write

- Import should follow a guarded multi-step pipeline:
  1. Read and validate the zip manifest.
  2. Extract into a staging directory under `app_data_path`.
  3. Detect the target game from manifest metadata or user selection.
  4. Compare staged content against current local save, settings, and patch state.
  5. Create a backup archive of local state before applying any overwrite-capable operation.
  6. Apply the selected conflict policy.
  7. Emit a detailed per-item result report.
- This makes conflict previews reliable and keeps backup creation separate from actual import mutation.

### Model conflict handling as an explicit plan, not a last-second prompt

- The context is clear that overwrite handling must show a side-by-side summary before changes are applied.
- The backend should compute a conflict plan with entries such as:
  - `new`
  - `replace`
  - `rename_keep_both`
  - `skip`
- Supported user actions should map to deterministic backend policies:
  - `Replace all`
  - `Keep both if possible`
  - `Cancel`
- `Keep both if possible` should be allowed only when the backend can safely rename imported folders or files without breaking the save format; unsupported cases should degrade to an explicit unresolved conflict instead of silently forcing replacement.

### Backup creation must be part of import, not an optional afterthought

- Before any import that could overwrite local data, the backend should create a timestamped backup archive of the current local state.
- Backup output should reuse the same portable zip shape or a close variant so recovery is consistent.
- If backup creation fails:
  - the import must pause before destructive work
  - the UI must explain the failure in concrete terms
  - the user may explicitly continue at their own risk or cancel
- This matches the locked requirement for cautious, technical messaging and keeps recovery credible.

### Surface both quick and guided flows in the renderer, but keep decisions backend-validated

- Export needs:
  - a quick export path from the game detail surface
  - an advanced selection path for slots or folders
- Import needs:
  - an archive-first flow that detects the game from manifest metadata
  - a game-first flow launched from a selected title
- The renderer should manage step state and summaries, but all dangerous decisions must round-trip through backend preflight data.
- Partial success is explicitly allowed by context, so the final result UI must show item-level outcomes rather than a flat success banner.

### Add a dedicated saves area without breaking the detail-first library workflow

- The context requires save actions both from a game's detail page and from a dedicated saves area.
- The clean fit for the existing route registry is a new `Saves` route plus detail-page entry points that deep-link or open the relevant save flow for the selected game.
- This keeps quick common-case actions close to the game while still supporting archive-first recovery or migration workflows in a dedicated surface.

## Planning Implications

### Plan split

The roadmap's two plans should stay distinct:

1. **Save path resolution and archive import/export backend flows**
   - canonical save/settings/patch path resolution
   - export manifest and zip generation
   - import staging, validation, conflict planning, and backup creation
   - typed save commands and library-state wiring for backend contracts
2. **Save management UI, overwrite warnings, and recovery messaging**
   - dedicated saves page and game-detail entry points
   - guided import and export flows
   - side-by-side conflict summary and overwrite warnings
   - backup-failure and partial-success messaging with reveal-folder actions

### Dependency shape

- Plan `07-01` should run first because it defines the portable archive contract, conflict model, and backup guarantees the UI needs to explain.
- Plan `07-02` should depend on `07-01` because the renderer should consume backend-generated previews and results rather than reconstruct conflict logic.

That yields a clean execution order:
- Wave 1: `07-01`
- Wave 2: `07-02`

## User Decision Constraints To Preserve

- Export uses a normal inspectable `.zip` archive.
- Export includes save data plus related settings and patches needed for portability.
- Users can choose save slots or folders instead of being forced to export everything.
- Archive filenames should be human-readable.
- Overwrite-capable imports must show a side-by-side summary before applying changes.
- Conflict actions must include `Replace all`, `Keep both if possible`, and `Cancel`.
- Import must create a backup of the current local state before applying overwrite-capable changes.
- Settings and patches follow the same conflict model as save data.
- Import and export actions must exist both in the game detail workflow and a dedicated saves area.
- Export needs both quick and advanced flows.
- Import should work both from a selected game and from an archive that identifies its target.
- Success screens should show where the export was written and provide an immediate reveal or open-folder action.
- Partial import success must surface per-item results.
- Warnings and destructive messaging should stay cautious and technical.
- Backup failure before import must allow an explicit continue-at-your-own-risk or cancel decision.

## Risks And Mitigations

### Risk: Save portability becomes tied to unstable filesystem guesses

- Mitigation: add backend-owned path resolution rooted in canonical game identity and previously established library, patch, and profile contracts.

### Risk: Zip imports overwrite local saves before the user understands the blast radius

- Mitigation: stage archive contents first, build an explicit conflict plan, and require user confirmation on a side-by-side summary before applying changes.

### Risk: Backup creation is treated as a best-effort log message instead of a real safety gate

- Mitigation: make backup creation a formal pre-apply step in the import pipeline, and halt destructive import until the user explicitly accepts risk when backup generation fails.

### Risk: The app cannot explain partial import results or recovery paths

- Mitigation: persist per-item operation results and backup metadata so the renderer can show detailed results and point directly to the backup or export archive location.

### Risk: The dedicated saves area drifts away from the game detail workflow

- Mitigation: keep one shared save domain model and one renderer store, with route-level presentation for archive-first workflows and detail-level presentation for quick per-game actions.

## Verification Guidance

- Prefer focused automated checks per plan:
  - `cargo test --manifest-path src-tauri/Cargo.toml saves::paths`
  - `cargo test --manifest-path src-tauri/Cargo.toml saves::archive`
  - `cargo test --manifest-path src-tauri/Cargo.toml saves::import`
  - `npm run test -- --run src/features/library/state src/features/library/api src/features/saves`
  - `npm run test -- --run src/features/saves/components src/features/library/components`
  - `npm run build`
- Add Rust tests for:
  - save path resolution from canonical game identity
  - archive manifest round-trips and backward-compatible validation
  - export packaging for selected slot subsets
  - conflict-plan generation for replace, keep-both, and cancel paths
  - backup-before-import behavior, including backup failure handling
  - per-item result reporting for partial success cases
- Add renderer tests for:
  - quick export versus advanced export flow switching
  - archive-first versus game-first import entry points
  - side-by-side conflict preview rendering
  - backup-failure warning and explicit risk acceptance flow
  - detailed partial-success result summaries and reveal-folder affordances

## Outcome For Planning

Phase 7 should leave the project with a trustworthy local save portability contract: per-game saves can be exported into inspectable archives, imported through a staged and previewable workflow, and protected by backup-first overwrite handling with clear result reporting. The renderer should present that power through both fast detail-page actions and a dedicated saves area without reimplementing backend safety logic.
