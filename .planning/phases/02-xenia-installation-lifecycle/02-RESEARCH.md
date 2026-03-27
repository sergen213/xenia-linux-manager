# Phase 2 Research: Xenia Installation Lifecycle

**Researched:** 2026-03-13
**Phase:** 2 - Xenia Installation Lifecycle
**Requirements:** XEN-02, XEN-03, XEN-04

## Question

What does Phase 2 need so the app can install, update, and recover the Linux Xenia Canary build without corrupting the active emulator state?

## Recommended Technical Direction

### Release discovery and metadata

- Treat release discovery as a backend concern in Rust, not a renderer fetch.
- Discover Linux builds from the `xenia-canary/xenia-canary-releases` release feed rather than hardcoding a wiki URL.
- Select the Linux asset from release metadata and persist a normalized manifest containing:
  - release id / tag
  - published date
  - asset name
  - download URL used for the current install
  - install directory / executable path
- Do not rely on the legacy wiki download link as the source of truth. During research on 2026-03-13, the official quickstart page pointed to a Linux archive URL that now returned `404`, which makes metadata-driven asset selection the safer contract.

### Download and extraction pipeline

- Run the install/update flow through the existing job subsystem so progress, logs, and retry state are shared with the Tasks page and dashboard surfaces from Phase 1.
- Download into an app-managed staging area under the configured app data path, not directly into the active Xenia install directory.
- Extract into a temporary release-specific directory first, then validate the extracted layout before any promotion step.
- Keep release-specific work directories separate:
  - `downloads/` for archive payloads
  - `staging/` for extracted candidate builds
  - `installs/` for promoted builds

### Retry-safe promotion model

- Use a manifest plus promotion workflow instead of mutating the active install in place.
- Preserve the current working build until the candidate build has:
  - fully downloaded
  - fully extracted
  - passed layout validation
  - been moved into its final promoted directory
- Maintain explicit install state such as:
  - `not_installed`
  - `installing`
  - `installed`
  - `update_available`
  - `updating`
  - `failed_install`
  - `failed_update`
- Failed update attempts must leave the previously installed build active.
- Retry should resume from the last failed lifecycle mode:
  - failed first install retries install
  - failed update retries update

### Installed version and update checks

- Persist a local install record that the UI can load at startup without rescanning the filesystem heuristically every time.
- The install record should expose:
  - installed version/tag
  - release date
  - active executable path
  - last successful install time
  - last failed operation summary, if any
- Update checks should compare the installed release tag/id against the latest Linux-compatible release metadata.
- Automatic update checks can run on app launch, but the app should only prompt for confirmation when a newer release is available.

## Planning Implications

### Plan split

The roadmap's three plans should stay distinct:

1. **Release metadata, download, extraction**
   - create the release client
   - create archive download + extraction + validation pipeline
   - expose install job entrypoints
2. **Installed-build state and promotion**
   - persist install manifest/state
   - compare installed vs latest release
   - implement promotion, rollback-safe update handling, and retry context
3. **UI, progress, and recovery**
   - adaptive dashboard install card
   - install/update confirmation flow
   - progress, failure, and next-step surfaces

### Dependency shape

- Plan `02-01` should run first because it defines the release artifact contract and background install primitives.
- Plan `02-02` should depend on `02-01` because installed-version tracking and safe update promotion need the release metadata and extraction pipeline.
- Plan `02-03` should depend on both `02-01` and `02-02` so the UI reflects the real backend lifecycle states rather than inventing temporary renderer-only state.

That yields a clean execution order:
- Wave 1: `02-01`
- Wave 2: `02-02`
- Wave 3: `02-03`

## User Decision Constraints To Preserve

- The main page is the primary install control surface.
- The primary lifecycle action is one adaptive button that changes between `Install`, `Update`, and `Retry`.
- Users must be shown what will be installed before the job starts, even though Linux currently only targets Canary.
- The app must expose full install details by default:
  - installed status
  - exact version/build
  - release date
- Update checks happen automatically on launch and manually through a dedicated `Check for updates` action.
- Failed installs must show both a friendly summary and technical details.
- Manual recovery actions must include:
  - view logs
  - clean failed install state
  - remove current install
- Users must be able to navigate elsewhere while the install/update job continues.
- Successful completion should steer the user toward the next workflow instead of ending on a dead-end success message.

## Risks And Mitigations

### Risk: The installer hardcodes a stale release URL

- Mitigation: plan around release API metadata plus Linux asset selection, not a single stored URL.

### Risk: Update flow corrupts the only working install

- Mitigation: stage and validate candidate builds before promotion; never overwrite the active install in place.

### Risk: Retry behavior becomes ambiguous

- Mitigation: persist the last operation type, failed step, and candidate release info so `Retry` maps back to the correct lifecycle.

### Risk: Renderer invents lifecycle state that diverges from the backend

- Mitigation: treat install state as backend-owned data exposed through typed commands, with the UI rendering that contract rather than rebuilding it.

## Verification Guidance

- Prefer focused automated checks per plan:
  - `cargo test --manifest-path src-tauri/Cargo.toml xenia`
  - `cargo test --manifest-path src-tauri/Cargo.toml install`
  - `npm run test -- --run src/features/dashboard src/features/tasks`
  - `npm run build`
- Add Rust tests for:
  - Linux release selection
  - extracted-layout validation
  - promotion / rollback-safe update behavior
  - persisted install-state parsing
- Add renderer tests for:
  - adaptive action label selection
  - update-available prompt behavior
  - failed-install recovery actions

## Outcome For Planning

Phase 2 should leave the project with a real Xenia lifecycle contract: discover the latest Linux Canary build, install it through a background job, retain a trustworthy installed-version record, detect updates, and recover safely from interrupted or failed work without breaking the active emulator state.
