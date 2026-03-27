# Phase 5: Patch Management - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add patch installation and per-patch enablement workflows for Canary-compatible titles. This phase covers importing local `.patch.toml` files, fetching matching community patch files from the Xenia Canary patch repository, choosing an active patch file for a game, and enabling or disabling individual entries before launch. New patch capabilities outside this boundary belong in later phases.

</domain>

<decisions>
## Implementation Decisions

### Patch source handling
- Remote support is community patch fetching from the Xenia Canary patch repository; there are no bundled patch sources in this phase.
- The UI should model one patch file per game containing many toggleable patch entries.
- If both a user-imported file and an app-fetched file exist for the same game, keep both and require the user to choose the active patch file.
- Show the last fetched/updated date and whether a patch file was user-imported or app-fetched.

### Patch list and toggle behavior
- Show patch entries as a simple flat checklist.
- If enabled entries appear to conflict, warn the user but still allow both.
- Persist enabled/disabled state separately for each installed patch file.
- Keep patch controls behind a `Manage patches` affordance until the user opens the editor.

### Install and update workflow
- Local install should support both manual file picking and drag-and-drop import.
- Remote fetch should automatically find the matching community patch file for the game.
- If a newer remote version exists for an already fetched community patch file, update in place only after user confirmation.
- After a successful import or fetch, prompt the user to choose the active patch file right away.

### Error, warning, and unsupported-state messaging
- Reject invalid or unreadable local `.patch.toml` files completely with an error.
- If no community patch exists for a game, show `No community patch available`.
- If multiple patch files exist and no active file is selected, the game should launch unpatched until the user chooses one.
- If a patch file or entry looks incompatible or incomplete, show an inline warning only.

### Claude's Discretion
- Exact layout, spacing, and visual styling of the patch editor and chooser.
- Exact wording for non-critical success messages and inline warnings, so long as the meaning stays consistent with the decisions above.
- Heuristics for detecting likely patch conflicts or incomplete entries.

</decisions>

<specifics>
## Specific Ideas

- Align the model with how Xenia Canary patches are distributed: one `.patch.toml` file per game with multiple `[[patch]]` entries.
- Keep remote provenance lightweight: source type plus last fetched/updated information is enough.
- Prompting for the active patch file immediately after import/fetch is part of the intended flow.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-patch-management*
*Context gathered: 2026-03-13*
