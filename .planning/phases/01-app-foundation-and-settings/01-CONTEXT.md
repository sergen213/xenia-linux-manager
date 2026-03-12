# Phase 1: App Foundation and Settings - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the initial Linux desktop shell, first-run setup flow, persisted storage settings, and long-running task visibility that later Xenia installation and library workflows will build on. This phase establishes the app frame and foundational behavior, not later library management capabilities themselves.

</domain>

<decisions>
## Implementation Decisions

### App shell and navigation
- The primary post-setup destination is a dashboard/home screen.
- The dashboard should center the user's library concept, even if Phase 1 only shows an empty or pre-library state.
- The app should expose future sections in the left sidebar from the start, including `Library`, `Tasks`, and `Settings`.
- The app should feel like a utility application with a left-sidebar layout.
- A clear system status area should be present in the shell from day one.

### Path setup and editing flow
- First launch should propose recommended default paths for Xenia, app data, and library metadata, with the user able to confirm or edit them.
- Path management should feel like app-managed folders rather than low-level filesystem configuration.
- Users should have an `Edit paths` option for adjusting storage locations later.
- Changing paths later should require confirmation with a summary of impact before applying the change.
- If a chosen path is invalid, unavailable, or lacks permissions, the app should fall back to defaults automatically and warn the user.

### Task visibility and progress UX
- Long-running task progress should appear both in a dedicated `Tasks` section and as a compact status surface in the main shell.
- Task progress should include step-by-step logs visible to the user.
- Completed and failed tasks should be represented with persistent status cards rather than transient notifications only.
- Users should be able to continue using the rest of the app while background tasks run.

### First-run state and restart behavior
- The very first launch should use a short welcome/setup layer before the main shell.
- The app should keep users in a gated onboarding flow until the core paths are confirmed.
- On restart, the app should restore settings, the last-open section, sidebar state, and task history.
- Task history should include a `Clear` option.
- If the app closes during a task, the next launch should show that the task was interrupted and ask whether the user wants to run it again.

### Claude's Discretion
- Exact dashboard composition and card layout details.
- The precise visual treatment of empty states and setup prompts.
- The specific wording and presentation of path warnings and task interruption prompts.
- The exact formatting of task logs and status cards.

</decisions>

<specifics>
## Specific Ideas

- The dashboard should reflect the eventual library-centric product model from the first phase, even before game discovery is implemented.
- Future sections should already exist in navigation so the app feels like a complete manager rather than a temporary setup wizard.
- Background work should feel transparent and inspectable, not hidden behind generic spinners.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-app-foundation-and-settings*
*Context gathered: 2026-03-12*
