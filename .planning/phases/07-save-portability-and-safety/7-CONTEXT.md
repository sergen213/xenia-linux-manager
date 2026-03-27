# Phase 7: Save Portability and Safety - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add per-game save import and export workflows using portable archives, with overwrite protection for existing local data. This phase covers safe local backup and migration flows only. Cloud save sync and broader cross-machine sync features remain out of scope.

</domain>

<decisions>
## Implementation Decisions

### Archive shape
- Export uses a normal `.zip` archive that users can inspect directly.
- Export includes save data plus related game details needed for portability, including settings and patches.
- Users can choose which save slots or save folders to include, rather than only exporting everything together.
- Archive filenames should be human-readable.

### Import conflict handling
- When imported content would overwrite existing local data, show a side-by-side summary before applying changes.
- Conflict actions should include `Replace all`, `Keep both if possible`, and `Cancel`.
- The app should automatically create a backup of the current local state before import.
- Settings and patches should follow the same conflict handling model as save data.

### Save operation flow
- Import and export actions should be available both from each game's detail page and from a dedicated saves area.
- Export should support a quick common-case action and an advanced path for selecting specific save slots or files.
- Import should support both entry paths: select a target game first, or start from a zip and detect the game from embedded metadata.
- The UX should use guided flows rather than minimal one-step actions.

### Recovery and messaging
- After a successful export, the app should show where the zip was saved, what it contains, and provide an immediate option to reveal or open the folder.
- If import partially succeeds, show a detailed per-item result rather than only a summary.
- Overwrite and destructive warnings should use a cautious, technical tone.
- If backup creation fails before import, the app should explain the failure and let the user explicitly continue at their own risk or stop.

### Claude's Discretion
- Exact metadata schema inside exported archives.
- Exact naming pattern for human-readable archive filenames.
- Exact layout and wording of comparison views, guided steps, and result screens.
- Exact thresholds or heuristics for when `Keep both if possible` can safely rename or preserve conflicting content.

</decisions>

<specifics>
## Specific Ideas

- Export packages should preserve enough context to carry a game's save state together with its settings and patches.
- Import should be able to identify the target game from archive metadata when the user starts from a zip file.
- The workflow should feel trustworthy for real migration and backup use, not like a casual file action.

</specifics>

<deferred>
## Deferred Ideas

- Cloud save sync remains out of scope for this phase and belongs to a later sync-focused phase.

</deferred>

---

*Phase: 07-save-portability-and-safety*
*Context gathered: 2026-03-13*
