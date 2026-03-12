# Stack Research

**Domain:** Linux-native desktop manager for the Xenia Xbox 360 emulator
**Researched:** 2026-03-12
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Rust | stable 1.85+ | Core desktop backend, filesystem operations, process launching, archive extraction | Best fit for low-resource Linux desktop tooling that does heavy local I/O and process orchestration. Strong safety properties matter for patch/config/save manipulation. |
| Tauri | 2.x | Desktop shell, native packaging, updater integration, Rust-to-UI bridge | Tauri 2 officially supports Linux bundles including AppImage and has a supported updater plugin path. It keeps runtime weight far below Electron while still allowing a polished UI. |
| React | 19.2 | Desktop UI layer | Mature ecosystem for searchable libraries, settings editors, and patch/profile management UIs. Works cleanly with Tauri and Vite. |
| Vite | 7.x | Frontend build/dev tooling | Current mainstream toolchain for React desktop frontends; fast local iteration and straightforward Tauri integration. |
| SQLite | 3.52.x | Local metadata store for library entries, profiles, scan indexes, patch/source state | Cross-platform, embedded, reliable, and a better long-term fit than ad hoc JSON files once scans, saves, and per-game metadata grow. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/plugin-updater` | 2.x | Self-update checks and installs for the manager AppImage | Use for manager updates, not for updating the Xenia emulator payload itself. |
| `serde` / `serde_json` | 1.x | Typed config/profile serialization | Use for app settings, cached metadata, and import/export manifests. |
| `tokio` | 1.x | Async task runtime | Use for downloads, extraction, scans, and background refresh without blocking UI. |
| `reqwest` | 0.12.x | HTTP client | Use for downloading Xenia builds, patch indexes, optimized settings, and release metadata. |
| `rusqlite` | 0.37.x | SQLite access from Rust | Use for a simple embedded database without adding async ORM overhead. |
| `tar` + `xz2` | 0.4.x / 0.1.x | Extract Linux Xenia `.tar.xz` releases | Use for the one-click Xenia installation flow. |
| `walkdir` | 2.x | Recursive filesystem scanning | Use for game-library discovery across user-selected folders. |
| `notify` | 8.x | Filesystem watching | Use when adding background refresh for library folders after MVP scanning works. |
| `zod` | 4.x | Frontend-side validation for forms and imported metadata | Use for settings forms, profile editor input, and import UX guards. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `cargo` | Rust build/test workflow | Keep backend logic in normal crates so it is testable outside the Tauri shell. |
| `pnpm` | Frontend/package management | Faster, deterministic installs for the React/Tauri frontend workspace. |
| `vitest` | Frontend unit tests | Good fit for validation, state logic, and parser helpers. |
| `cargo nextest` | Rust test execution | Faster feedback once backend logic grows beyond a few modules. |
| `linuxdeploy` + `linuxdeploy-plugin-appimage` | AppImage packaging | Recommended AppImage toolchain; supports embedding update information and generating `.zsync` output. |

## Installation

```bash
# Frontend
pnpm add react react-dom @tanstack/react-query zustand zod

# Tauri JavaScript side
pnpm add @tauri-apps/api @tauri-apps/plugin-updater

# Frontend dev dependencies
pnpm add -D vite @vitejs/plugin-react typescript vitest

# Rust backend (representative)
cargo add tauri tauri-plugin-updater tokio reqwest serde serde_json rusqlite tar xz2 walkdir notify
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Tauri 2.x | GTK4 + libadwaita (Rust) | Use if strict GNOME-native look/feel matters more than cross-distro packaging convenience and frontend velocity. |
| SQLite | JSON files only | Acceptable only for a throwaway prototype with a tiny library and no indexing/search expectations. |
| React + Vite | Svelte + Vite | Reasonable if you want a smaller UI layer and the team prefers Svelte ergonomics. |
| `rusqlite` | `sqlx` with SQLite | Use if you specifically want compile-time query checking and can tolerate more setup/compile complexity. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Electron | Higher baseline memory/runtime overhead than this app needs; conflicts with the low-resource goal | Tauri 2.x |
| A remote/cloud database for core library state | Adds operational complexity to a local desktop manager with no cloud requirement | SQLite |
| Parsing only filenames for game identification | Too fragile for Xbox 360 assets and misses `.xex`/ISO structure details | Use recursive scanning plus lightweight metadata extraction and manual correction paths |
| Coupling manager updates with Xenia emulator updates | The manager and emulator have different release cadences and failure modes | Maintain separate update channels and recovery paths |

## Stack Patterns by Variant

**If v1 stays single-user and offline-first:**
- Use SQLite plus local filesystem caches
- Because the app mainly orchestrates local assets and does not need backend infrastructure

**If future releases add optional online sync/community publishing:**
- Keep the core app local-first and add a thin optional sync service later
- Because save/profile/library management should remain usable when network services are unavailable

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `tauri@2.x` | `@tauri-apps/plugin-updater@2.x` | Plugin major version needs to match Tauri major version. |
| `react@19.2` | `vite@7.x` | Standard pairing for current client-side React applications. |
| `linuxdeploy` | `linuxdeploy-plugin-appimage` | Needed together for AppImage output and update metadata generation. |

## Sources

- `/websites/v2_tauri_app` — Linux bundle config and updater plugin support
- `https://react.dev/versions` — verified current React major/minor docs target
- `https://vite.dev/blog/announcing-vite7` — verified current Vite major version
- `https://www.sqlite.org/` — verified current SQLite release line
- `https://docs.appimage.org/packaging-guide/from-source/native-binaries.html` — AppImage build/update metadata guidance
- `https://docs.appimage.org/packaging-guide/distribution.html` — AppImage distribution/update server requirements
- `https://github.com/xenia-manager/xenia-manager` — reference product feature set and responsibilities

---
*Stack research for: Linux-native desktop manager for the Xenia Xbox 360 emulator*
*Researched: 2026-03-12*
