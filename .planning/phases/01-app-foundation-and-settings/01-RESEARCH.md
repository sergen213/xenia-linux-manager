# Phase 1 Research: App Foundation and Settings

**Researched:** 2026-03-12
**Phase:** 1 - App Foundation and Settings
**Requirements:** XEN-01, APP-01

## Question

What does Phase 1 need so later Xenia install, library, patch, profile, and save workflows can be planned on a stable Linux-native foundation?

## Recommended Technical Direction

### Desktop stack

- Use **Tauri 2 + React + TypeScript + Vite** for the Linux-native desktop shell.
- Keep long-running and filesystem-sensitive work in the **Rust sidecar/backend commands**, not in the React renderer.
- Use a feature-oriented frontend layout from the start:
  - `app-shell`
  - `dashboard`
  - `settings`
  - `tasks`

### Persistence model

- Store user settings in an app-owned config document under the manager's app data directory.
- Treat the three core paths as first-class settings:
  - Xenia install root
  - Manager app data root
  - Library metadata root
- Resolve defaults on first launch and allow the user to confirm or replace them before the main shell unlocks.
- Validate candidate paths before persisting them:
  - path exists or can be created
  - path is writable
  - path is not obviously conflicting with another reserved app location

### Task and progress architecture

- Represent long-running work as persisted jobs with:
  - stable job id
  - job type
  - current status
  - percent/progress step
  - append-only log entries
  - timestamps
  - interruption state
- Use Tauri events or an equivalent backend-to-frontend progress stream so the UI stays responsive while Rust performs blocking work.
- Persist task snapshots so restart can restore history and mark in-flight jobs as interrupted.

## Planning Implications

### Plan split

The roadmap's three plans should remain distinct:

1. **Workspace and shell**
   - Create the Tauri/React workspace
   - Establish left-sidebar shell, dashboard landing, status surface, and section contracts
2. **Settings and path model**
   - Create the first-run gating flow
   - Resolve/validate/persist path settings
   - Support later editing with impact confirmation
3. **Job/progress infrastructure**
   - Create backend job execution contracts and persisted task history
   - Stream progress/logs to the renderer
   - Restore interrupted task state on restart

### Dependency shape

- Plan `01-01` should run first because it defines the application structure the later plans plug into.
- Plan `01-02` should run before `01-03` because task history persistence and interrupted-job recovery need the app data path model.
- Phase 1 can therefore execute as a clean sequence:
  - Wave 1: `01-01`
  - Wave 2: `01-02`
  - Wave 3: `01-03`

## User Decision Constraints To Preserve

- First launch is a gated welcome/setup flow until paths are confirmed.
- The post-setup app must already look like a full manager:
  - left sidebar
  - future sections visible from day one
  - dashboard/home as the main destination
  - compact shell status plus a dedicated Tasks section
- If a chosen path is invalid or unwritable, the app should warn and recover to defaults rather than leaving broken state.
- Completed and failed jobs must remain visible as persistent task cards, not transient toasts.

## Risks And Mitigations

### Risk: Renderer ends up owning long-running work

- Mitigation: define backend command + event contracts in Phase 1 and keep the renderer focused on state display and intent dispatch.

### Risk: Path choices become hard to migrate later

- Mitigation: centralize path resolution and validation behind a settings service instead of scattering path logic through UI components.

### Risk: Early UI becomes throwaway scaffolding

- Mitigation: build the real shell/navigation structure now, with empty states for future sections instead of temporary setup-only screens.

### Risk: Restart behavior is underspecified

- Mitigation: task persistence must explicitly record whether a job completed cleanly, failed, or was interrupted by app shutdown.

## Verification Guidance

- Prefer fast automated checks per plan:
  - `npm run lint`
  - `npm run test -- --run`
  - `npm run build`
  - focused Rust tests for settings and job modules
- Avoid relying on manual verification for core path validation and job-state behavior. Those should be covered with automated tests in the phase plans.

## Outcome For Planning

Phase 1 should leave the project with a real desktop shell, durable storage settings, and a job/progress system that later feature phases can consume without re-architecting the app.
