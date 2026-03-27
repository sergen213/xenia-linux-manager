# Phase 2: Xenia Installation Lifecycle - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the in-app flow to download, extract, install, update, and retry the Linux Xenia Canary build. This phase covers the install/update lifecycle and recovery behavior for the emulator itself, not later library, launch, patch, or profile capabilities.

</domain>

<decisions>
## Implementation Decisions

### Install entry point and control surface
- If Xenia is not installed, the primary install action should live on the main page.
- There should also be a separate `Check for updates` button.
- The primary action should be a single adaptive button that changes between `Install`, `Update`, and `Retry` based on state.
- The flow should ask the user for confirmation/details before starting, even though the only supported Linux build right now is Canary.
- After install, the main surface should steer the user into the next setup workflow rather than emphasizing maintenance.

### Version and update presentation
- Show full install details by default: installed status, exact build/version, and release date.
- Check for updates both automatically on app launch and manually via `Check for updates`.
- If a newer build is detected, prompt the user to update rather than forcing the update.
- Update availability should not immediately force the user into an update flow without confirmation.

### Failure and retry experience
- Failure UI should show both a friendly summary and technical details, including the failed step and error text when available.
- `Retry` should preserve operation context: a failed install retries install, and a failed update retries update.
- If an update fails, the previously working installed version must remain active until the new version succeeds.
- The UI should expose manual recovery actions, including viewing logs, cleaning failed install state, and removing the current install.

### In-progress and post-install states
- Show as much progress detail as the system can provide, including granular install/update status rather than a generic spinner-only state.
- Users should be able to navigate elsewhere in the app while install/update runs in the background.
- After success, show a next-step checklist rather than a minimal confirmation-only state.
- Post-success quick actions should include going to library setup, reviewing settings, and viewing install details/logs.

### Claude's Discretion
- Exact wording and layout of prompts, progress UI, and success checklist.
- Exact placement of the `Check for updates` action outside the main page, as long as it remains available.
- The exact technical detail format for failure messages and logs.

</decisions>

<specifics>
## Specific Ideas

- The adaptive primary button should always reflect the real lifecycle state (`Install`, `Update`, `Retry`) so the user is never shown an irrelevant action.
- Linux currently has only the Canary build, but the flow should still present the user with what is about to be installed instead of silently starting.
- Successful install should transition the user toward the next meaningful product step, not leave them at a dead-end status panel.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-xenia-installation-lifecycle*
*Context gathered: 2026-03-12*
