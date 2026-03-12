# Xenia Manager for Linux

## What This Is

Xenia Manager for Linux is a native Linux desktop application for managing the Xenia Xbox 360 emulator experience without relying on the existing Windows-only Xenia Manager. It provides Linux desktop users with an easier way to install Xenia, keep it updated, discover locally stored games, apply patches and per-game profiles, launch titles, and manage saves from one place. Distribution should be simple for end users, with AppImage as the preferred packaging target.

## Core Value

Linux desktop users can get Xenia running and manage their Xbox 360 game library with minimal setup friction from a single native app.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] One-click setup downloads and extracts the Linux Xenia build automatically.
- [ ] The app can update installed Xenia builds automatically.
- [ ] The app can scan user-selected folders for Xbox 360 games, including `.xex` and ISO-based titles.
- [ ] The app can apply Canary game patches and per-game configuration profiles before launch.
- [ ] The app supports community-optimized per-game settings profiles.
- [ ] The app can import and export game saves.
- [ ] The app remains lightweight in resource usage during normal management workflows.

### Out of Scope

- ROM downloading or distribution — explicitly excluded for legal reasons.
- Netplay support — no Linux netplay build is available to target.
- Controller setup and remapping — default Linux/controller behavior is considered sufficient for v1.
- Achievements support — not part of the core management value for v1.
- Cloud save sync — deferred to avoid expanding scope beyond local save management.

## Context

- There is an existing Windows-only reference product: Xenia Manager.
- The Linux emulator target is the Xenia Canary Linux release distributed as a tar.xz archive.
- The product goal is parity with the core manager experience on Linux, not a generic emulator frontend.
- v1 is aimed at Linux desktop users broadly, not only advanced emulator users.
- Expected user flow: install the manager, download/extract Xenia, add one or more game folders, let the app detect installed games, apply patches/profile settings, launch games, and manage saves.
- Patches and profiles in v1 should support both bundled content and online/community-sourced content.
- Game discovery should support both automatic recursive scanning and manual entry when detection misses a title.
- AppImage is the preferred distribution format to minimize setup friction.

## Constraints

- **Platform**: Native Linux desktop app — the project exists specifically because the Windows manager does not serve Linux users.
- **Distribution**: AppImage-first packaging — easier usage and distribution for Linux desktop users.
- **Emulator Dependency**: Use the Linux Xenia Canary release artifact — setup flow depends on downloading and extracting that build.
- **Legal**: No ROM downloading/distribution features — explicit boundary for compliance.
- **Feature Availability**: No netplay support — Linux target build does not provide the required capability.
- **Performance**: Low resource usage — the manager should stay lightweight outside of game execution.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build a Linux-native manager instead of a Wine workaround | The core problem is lack of a first-class Linux manager experience | — Pending |
| Target Linux desktop users generally | The app should reduce setup friction for normal Linux users, not only emulator experts | — Pending |
| Package primarily as AppImage | Simplifies installation and use across Linux distributions | — Pending |
| Support both bundled and online patch/profile sources | Users need a working baseline plus access to community-optimized settings | — Pending |
| Support recursive scanning and manual game addition | Automatic discovery improves usability, manual entry covers edge cases | — Pending |
| Exclude ROM downloads, netplay, controller setup, achievements, and cloud sync from v1 | Keeps scope aligned to legal, platform, and core-value constraints | — Pending |

---
*Last updated: 2026-03-12 after initialization*
