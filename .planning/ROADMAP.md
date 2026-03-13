# Roadmap: Xenia Manager for Linux

## Overview

This roadmap moves from a stable Linux-native foundation to the full day-to-day management flow: install Xenia reliably, discover and launch local games, apply patches and profiles safely, manage saves, and then harden packaging for release. The ordering is driven by artifact reliability and game identity accuracy so later phases do not build on brittle assumptions.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: App Foundation and Settings** - Create the desktop shell, persistent settings, and responsive task infrastructure. (completed 2026-03-13)
- [x] **Phase 2: Xenia Installation Lifecycle** - Deliver reliable Xenia download, extraction, update, and retry flows. (completed 2026-03-13)
- [ ] **Phase 3: Library Source Management and Scanning** - Let users register folders and discover `.xex` and ISO-backed games.
- [ ] **Phase 4: Library Review and Launch Core** - Turn detected titles into a browsable library with safe launch preflights.
- [ ] **Phase 5: Patch Management** - Add local and remote Canary patch workflows with per-patch toggles.
- [ ] **Phase 6: Profiles and Community Settings** - Deliver effective per-game config profiles and community-optimized settings.
- [ ] **Phase 7: Save Portability and Safety** - Add import/export workflows with overwrite protection.
- [ ] **Phase 8: Packaging and Release Hardening** - Ship the manager as an AppImage and validate release readiness.

## Phase Details

### Phase 1: App Foundation and Settings
**Goal**: Create the Linux desktop shell, persisted settings, and long-running task infrastructure that all later workflows depend on.
**Depends on**: Nothing (first phase)
**Requirements**: XEN-01, APP-01
**Success Criteria** (what must be TRUE):
  1. User can launch the app and choose where Xenia, app data, and library metadata are stored.
  2. Long-running tasks can report progress to the UI without freezing the app.
  3. The app persists settings and restores them on restart.
**Plans**: 3 plans

Plans:
- [x] 01-01: Create Tauri/React workspace and Linux desktop shell
- [ ] 01-02: Implement settings persistence and filesystem path model
- [ ] 01-03: Add backend job/progress infrastructure and baseline logging

### Phase 2: Xenia Installation Lifecycle
**Goal**: Deliver a reliable one-click Xenia install/update flow using the Linux Canary release artifact.
**Depends on**: Phase 1
**Requirements**: XEN-02, XEN-03, XEN-04
**Success Criteria** (what must be TRUE):
  1. User can download and extract the Linux Xenia Canary build from the app.
  2. User can see the installed Xenia version and update it when a newer build is available.
  3. Interrupted or failed installs can be retried without leaving invalid emulator state behind.
**Plans**: 3 plans

Plans:
- [x] 02-01: Build release metadata fetch, download, and archive extraction pipeline
- [ ] 02-02: Implement installed-build tracking, update checks, and retry-safe promotion
- [ ] 02-03: Add install/update UI, progress reporting, and recovery handling

### Phase 3: Library Source Management and Scanning
**Goal**: Let users register game folders and populate the local library from `.xex` and ISO-backed content.
**Depends on**: Phase 2
**Requirements**: LIB-01, LIB-02, LIB-03
**Success Criteria** (what must be TRUE):
  1. User can add one or more game root folders for management.
  2. The app recursively discovers `.xex` titles in configured folders.
  3. The app detects supported ISO-based game candidates during scans.
**Plans**: 2 plans

Plans:
- [ ] 03-01: Implement folder source management and scan job orchestration
- [ ] 03-02: Build `.xex` and ISO candidate discovery with persisted scan results

### Phase 4: Library Review and Launch Core
**Goal**: Turn scan output into a usable library with manual correction and safe game launching.
**Depends on**: Phase 3
**Requirements**: LIB-04, LIB-05, LAUN-01, LAUN-03
**Success Criteria** (what must be TRUE):
  1. User can browse a detected library and open per-game detail views.
  2. User can manually add or correct a game when automatic detection is wrong or incomplete.
  3. User can launch a title through the installed Linux Xenia build.
  4. User sees actionable preflight errors when launch prerequisites are invalid.
**Plans**: 3 plans

Plans:
- [ ] 04-01: Build library UI, game detail views, and search/browse interactions
- [ ] 04-02: Implement manual add/correction and identity resolution persistence
- [ ] 04-03: Add launch preflight validation and Xenia process spawning

### Phase 5: Patch Management
**Goal**: Add patch installation and per-patch enablement workflows for Canary-compatible titles.
**Depends on**: Phase 4
**Requirements**: PATC-01, PATC-02, PATC-03
**Success Criteria** (what must be TRUE):
  1. User can install bundled or local patch files for a game.
  2. User can fetch and install supported remote Canary patch files for a detected title.
  3. User can enable or disable individual patches before launch.
**Plans**: 2 plans

Plans:
- [ ] 05-01: Implement patch source adapters and local patch storage model
- [ ] 05-02: Build patch editor UI with per-entry enable/disable persistence

### Phase 6: Profiles and Community Settings
**Goal**: Deliver effective per-game configuration profiles, including community-optimized settings and local overrides.
**Depends on**: Phase 5
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, LAUN-02
**Success Criteria** (what must be TRUE):
  1. User can apply a local per-game profile and see the resulting effective settings.
  2. User can fetch and apply a community-optimized settings profile for a supported title.
  3. User can edit effective settings before launch.
  4. Local overrides win over bundled or remote defaults during launch.
  5. Launch uses the selected patch and effective profile together.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Implement profile storage, merge rules, and effective-settings computation
- [ ] 06-02: Add community optimized settings ingestion with provenance tracking
- [ ] 06-03: Build profile editor UI and wire launch-time config application

### Phase 7: Save Portability and Safety
**Goal**: Add save import/export workflows that are safe enough for real migration and backup use.
**Depends on**: Phase 6
**Requirements**: SAVE-01, SAVE-02, SAVE-03
**Success Criteria** (what must be TRUE):
  1. User can export a game’s save data to a portable archive.
  2. User can import a portable save archive for a game.
  3. The app warns before save operations overwrite existing data.
**Plans**: 2 plans

Plans:
- [ ] 07-01: Implement save path resolution and archive import/export backend flows
- [ ] 07-02: Add save management UI, overwrite warnings, and recovery messaging

### Phase 8: Packaging and Release Hardening
**Goal**: Package the manager for Linux distribution and verify release-readiness for v1.
**Depends on**: Phase 7
**Requirements**: APP-02
**Success Criteria** (what must be TRUE):
  1. User can run the released manager as an AppImage on supported Linux desktops.
  2. The packaged app includes the required runtime permissions, assets, and desktop integration metadata.
  3. Release verification covers install, scan, launch, patch/profile, and save workflows in packaged form.
**Plans**: 2 plans

Plans:
- [ ] 08-01: Create AppImage packaging, metadata, and release automation
- [ ] 08-02: Run packaged-app verification and release hardening pass

## Progress

**Execution Order:**
Phases execute in numeric order: 2 → 2.1 → 2.2 → 3 → 3.1 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. App Foundation and Settings | 3/3 | Complete   | 2026-03-13 |
| 2. Xenia Installation Lifecycle | 3/3 | Complete   | 2026-03-13 |
| 3. Library Source Management and Scanning | 0/2 | Not started | - |
| 4. Library Review and Launch Core | 0/3 | Not started | - |
| 5. Patch Management | 0/2 | Not started | - |
| 6. Profiles and Community Settings | 0/3 | Not started | - |
| 7. Save Portability and Safety | 0/2 | Not started | - |
| 8. Packaging and Release Hardening | 0/2 | Not started | - |
