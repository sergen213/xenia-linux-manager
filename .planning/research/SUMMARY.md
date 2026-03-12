# Project Research Summary

**Project:** Xenia Manager for Linux
**Domain:** Linux-native desktop manager for the Xenia Xbox 360 emulator
**Researched:** 2026-03-12
**Confidence:** MEDIUM

## Executive Summary

This product is a local-first Linux desktop manager for an existing emulator ecosystem, not a generic launcher and not an online service. The strongest reference signal comes from the Windows-only Xenia Manager project and the current Xenia Canary patch/settings ecosystem: users expect guided installation, library handling, patch/profile management, and save portability in one place. On Linux, the missing pieces are packaging, installation ergonomics, and Linux-safe update/recovery behavior.

The recommended implementation path is a Rust + Tauri 2 desktop app with a React frontend, SQLite for local metadata, and explicit separation between manager updates and emulator updates. That gives low runtime overhead, a supported AppImage path, and strong control over filesystem/process-heavy workflows. The main risk is not UI polish; it is reliability around installs, scans, identity matching, and remote asset trust. The roadmap should therefore establish artifact management and identity resolution before layering community features deeply into the app.

## Key Findings

### Recommended Stack

Use Rust for all local-system orchestration and Tauri 2 for the Linux desktop shell, with React 19.2 + Vite 7 for the interface and SQLite for durable local state. This combination aligns with the low-resource requirement, supports Linux bundles including AppImage, and keeps long-running operations out of the UI layer.

**Core technologies:**
- Rust: backend orchestration and file/process safety — recommended because install, extraction, scanning, and launch logic are local-system heavy
- Tauri 2.x: desktop shell and updater integration — recommended because Linux bundle support and AppImage distribution are first-class concerns
- React 19.2 + Vite 7.x: UI layer and developer ergonomics — recommended because the app needs a substantial library/settings UI
- SQLite 3.52.x: local metadata store — recommended because library/profile/save state will outgrow flat files quickly

### Expected Features

The market baseline is clear from the existing Windows manager and the Xenia patch ecosystem: guided setup, update management, library scan/add, patch handling, per-game configuration, and save portability are table stakes for this concept.

**Must have (table stakes):**
- Guided Xenia installation/update — users expect the manager to remove archive/setup friction
- Library scan plus manual add fallback — users need both convenience and edge-case recovery
- Per-game patch and config support — core reason to use a manager instead of raw emulator files
- Save import/export — essential for backup/migration trust

**Should have (competitive):**
- Community-optimized settings feed — differentiator directly tied to the “easy setup” value
- Linux-first AppImage distribution and UX — direct product advantage over the Windows-only manager
- Lightweight runtime footprint — aligns with emulator-user expectations

**Defer (v2+):**
- Cloud sync/accounts — expands scope beyond the core local workflow
- Netplay orchestration — not supported by the Linux target path
- Controller setup suite — low leverage for v1

### Architecture Approach

The app should be local-first with a thin frontend/backend IPC boundary. React owns interaction and presentation; Rust services own install/update/scan/launch/save/patch/profile logic; SQLite and the filesystem together hold durable state. Remote feeds enrich local workflows but should never become the source of truth for the user’s library.

**Major components:**
1. Install and update manager — owns Xenia artifact lifecycle and manager self-update separation
2. Library and identity subsystem — owns scan, detection, normalization, and manual correction
3. Patch/profile subsystem — owns community asset retrieval, validation, merge, and application
4. Save subsystem — owns import/export/delete and path normalization

### Critical Pitfalls

1. **Wrong game identity mapping** — avoid by separating discovery from identity resolution and supporting manual correction
2. **Brittle install/update recovery** — avoid by staging installs and validating before promotion
3. **AppImage self-update assumptions** — avoid by keeping manager update and emulator update flows separate
4. **Blocking UI during local-heavy operations** — avoid by moving long-running work into async backend jobs
5. **Unsafe remote asset trust** — avoid by validating and tracking provenance for community profiles/patches

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation and Artifact Management
**Rationale:** Everything else depends on stable settings, path layout, install/update mechanics, and responsive long-running jobs.
**Delivers:** App shell, settings persistence, Xenia install/update pipeline, manager update foundation, structured logs
**Addresses:** Install/update table stakes
**Avoids:** Brittle install recovery and AppImage updater mistakes

### Phase 2: Library Discovery and Launch Core
**Rationale:** Once Xenia can be installed reliably, the next essential workflow is finding games and launching them safely.
**Delivers:** Folder management, recursive scanning, identity resolution, manual add/correction, launch preflight
**Uses:** SQLite metadata, background task model
**Implements:** Library and identity subsystem

### Phase 3: Patch and Profile Management
**Rationale:** Patch/profile value depends on correct per-game identity and stable local file layout from earlier phases.
**Delivers:** Bundled/remote patch integration, per-game config overrides, optimized settings ingestion, provenance display
**Uses:** Remote feed adapters and validation
**Implements:** Patch/profile subsystem

### Phase 4: Save Management and Recovery UX
**Rationale:** Save portability becomes straightforward once the app owns path normalization and per-game metadata.
**Delivers:** Save import/export/delete, conflict handling, backup-friendly UX
**Uses:** Stable emulator content/save path conventions
**Implements:** Save subsystem

### Phase 5: Polish, Verification, and Packaging
**Rationale:** Packaging, edge-case verification, and quality pass should happen after core workflows exist.
**Delivers:** AppImage build pipeline, updater verification, performance passes, error-message hardening, release readiness

### Phase Ordering Rationale

- Install/update must precede launch/save work because they define the artifact layout and recovery model.
- Library identity must precede patch/profile application because remote assets depend on correct title matching.
- Save tooling comes after stable path ownership so import/export semantics do not shift mid-project.
- Packaging and release polish come last to avoid optimizing a moving target.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Linux-specific updater and packaging details for release automation
- **Phase 2:** Reliable `.xex`/ISO identity extraction strategy across different game layouts
- **Phase 3:** Community asset validation rules and precedence model between bundled, remote, and local overrides

Phases with standard patterns (skip research-phase):
- **Phase 4:** Zip-based save import/export and conflict UX are relatively standard once paths are normalized

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Tauri/AppImage/update path is well supported, but exact packaging workflow still needs implementation-time validation |
| Features | HIGH | Strongly grounded in the existing Xenia Manager and ecosystem repos |
| Architecture | MEDIUM | Clear local-first shape, but game identity extraction details need phase-level refinement |
| Pitfalls | HIGH | Risks are concrete and tied to emulator-manager behavior, not generic desktop advice |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Game identity extraction details:** confirm the best metadata strategy for `.xex` and ISO inputs during phase planning
- **Community asset schemas:** lock exact remote profile/patch ingestion rules before implementing auto-apply behavior
- **Release automation:** validate the final AppImage/update publishing path in CI before promising one-click manager updates broadly

## Sources

### Primary (HIGH confidence)
- `https://github.com/xenia-manager/xenia-manager` — feature set and reference responsibilities
- `https://github.com/xenia-canary/game-patches` — patch workflow expectations
- `https://github.com/xenia-manager/optimized-settings` — community settings corpus
- `/websites/v2_tauri_app` — Tauri Linux bundle and updater support

### Secondary (MEDIUM confidence)
- `https://docs.appimage.org/packaging-guide/from-source/native-binaries.html` — AppImage build/update metadata behavior
- `https://docs.appimage.org/packaging-guide/distribution.html` — AppImage distribution constraints
- `https://react.dev/versions` — current React docs version
- `https://vite.dev/blog/announcing-vite7` — current Vite major version
- `https://www.sqlite.org/` — current SQLite release line

### Tertiary (LOW confidence)
- `https://github.com/xenia-canary/xenia-canary-releases/releases` — release availability reference; exact artifact conventions should still be validated during implementation

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
