# Requirements: Xenia Manager for Linux

**Defined:** 2026-03-12
**Core Value:** Linux desktop users can get Xenia running and manage their Xbox 360 game library with minimal setup friction from a single native app.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Xenia Lifecycle

- [x] **XEN-01**: User can choose where the manager stores Xenia, related data, and library metadata.
- [ ] **XEN-02**: User can download and extract the Linux Xenia Canary release through a guided one-click setup flow.
- [ ] **XEN-03**: User can see the installed Xenia version and update it to a newer Linux release from inside the app.
- [ ] **XEN-04**: User can retry a failed or interrupted Xenia install/update without the app being left in a broken state.

### Library

- [ ] **LIB-01**: User can add one or more game root folders for the app to manage.
- [ ] **LIB-02**: User can recursively discover `.xex`-based Xbox 360 game entries inside configured folders.
- [ ] **LIB-03**: User can detect supported ISO-based game inputs from configured folders.
- [ ] **LIB-04**: User can manually add or correct a game entry when automatic detection is ambiguous or fails.
- [ ] **LIB-05**: User can browse their detected library and open a per-game detail view.

### Launch

- [ ] **LAUN-01**: User can launch a detected game through the installed Linux Xenia build from the manager.
- [ ] **LAUN-02**: User launches a game with the selected patch and effective per-game configuration profile applied.
- [ ] **LAUN-03**: User sees actionable preflight errors when the selected game cannot launch because a required executable, path, patch, or config state is invalid.

### Patches

- [ ] **PATC-01**: User can install bundled or local Canary patch files for a game.
- [ ] **PATC-02**: User can fetch and install supported remote Canary patch files for a detected game.
- [ ] **PATC-03**: User can enable or disable individual patch entries for a game before launch.

### Profiles

- [ ] **PROF-01**: User can apply a local per-game configuration profile for a title.
- [ ] **PROF-02**: User can fetch and apply a community-optimized settings profile for a detected game.
- [ ] **PROF-03**: User can review and edit the effective per-game settings before launch.
- [ ] **PROF-04**: User’s local overrides take precedence over bundled or remote default profiles.

### Saves

- [ ] **SAVE-01**: User can export a game’s save data to a portable archive.
- [ ] **SAVE-02**: User can import a portable save archive for a game.
- [ ] **SAVE-03**: User is warned before a save import or other save-management action overwrites existing data.

### Application

- [x] **APP-01**: User can see progress for downloads, scans, and save operations without the UI freezing.
- [ ] **APP-02**: User can run the released manager as an AppImage on supported Linux desktop systems.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Metadata and Discovery

- **META-01**: User can view enriched artwork and compatibility metadata for detected games.
- **META-02**: Library folders refresh automatically in the background when files change.

### Emulator Channels

- **CHAN-01**: User can manage multiple Linux-compatible Xenia channels/build tracks beyond the default Canary flow.

### Cloud and Community

- **SYNC-01**: User can sync saves and profiles across machines through an optional cloud account.
- **SYNC-02**: User can publish or share custom profiles directly from the app.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| ROM downloading or distribution | Legal risk and explicitly excluded by project direction |
| Netplay support | No Linux netplay target path is currently available |
| Controller setup/remapping | Not core to the manager’s v1 value and default behavior is acceptable |
| Achievements support | Not part of the launch value proposition |
| Cloud save sync | Deferred until the local-first workflow is validated |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| XEN-01 | Phase 1 | Complete |
| APP-01 | Phase 1 | Complete |
| XEN-02 | Phase 2 | Pending |
| XEN-03 | Phase 2 | Pending |
| XEN-04 | Phase 2 | Pending |
| LIB-01 | Phase 3 | Pending |
| LIB-02 | Phase 3 | Pending |
| LIB-03 | Phase 3 | Pending |
| LIB-04 | Phase 4 | Pending |
| LIB-05 | Phase 4 | Pending |
| LAUN-01 | Phase 4 | Pending |
| LAUN-03 | Phase 4 | Pending |
| PATC-01 | Phase 5 | Pending |
| PATC-02 | Phase 5 | Pending |
| PATC-03 | Phase 5 | Pending |
| PROF-01 | Phase 6 | Pending |
| PROF-02 | Phase 6 | Pending |
| PROF-03 | Phase 6 | Pending |
| PROF-04 | Phase 6 | Pending |
| LAUN-02 | Phase 6 | Pending |
| SAVE-01 | Phase 7 | Pending |
| SAVE-02 | Phase 7 | Pending |
| SAVE-03 | Phase 7 | Pending |
| APP-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after initial definition*
