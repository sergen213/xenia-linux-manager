# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- TypeScript ~5.9.3 — Frontend (React UI in `src/`)
- Rust (Edition 2021) — Backend native layer (`src-tauri/src/`)

**Secondary:**
- JavaScript (ESM) — Build scripts (`scripts/*.mjs`), ESLint config (`eslint.config.js`)
- Python — One-off patch/migration scripts (root-level `*.py` files, not part of the app)

## Runtime

**Environment:**
- Tauri v2 — Desktop shell bridging Rust backend with web frontend
- Node.js 22 (used in CI; `.nvmrc` not present)
- Rust stable toolchain

**Package Manager:**
- npm — Frontend dependencies (lockfile: `package-lock.json` present)
- Cargo — Rust dependencies (lockfile: `src-tauri/Cargo.lock` present)

## Frameworks

**Core:**
- React 19.2.4 — UI framework (`src/main.tsx`, `src/App.tsx`)
- React Router DOM 7.6.4 — Client-side routing (`src/app/router.tsx`)
- Tauri 2.x — Desktop application framework (`src-tauri/`)

**Testing:**
- Vitest 3.2.4 — Frontend test runner (`vitest.config.ts`)
- @testing-library/react 16.3.0 — React component testing
- @testing-library/jest-dom 6.6.3 — DOM matchers (`src/test-setup.ts`)
- jsdom 26.1.0 — Browser environment simulation
- Rust built-in `#[cfg(test)]` — Backend unit tests

**Build/Dev:**
- Vite 8.0.0 — Frontend bundler (`vite.config.ts`)
- @vitejs/plugin-react 6.0.0 — React fast-refresh for Vite
- esbuild — Minification (configured in `vite.config.ts`)
- TypeScript compiler (`tsc -b`) — Type checking before build
- ESLint 9.39.4 — Linting (`eslint.config.js`)

## Key Dependencies

**Critical (Frontend):**
- `@tauri-apps/api` ^2.5.0 — Tauri IPC bridge (invoke commands from React to Rust)
- `@tauri-apps/plugin-dialog` ^2.6.0 — Native file/folder picker dialogs
- `@tauri-apps/plugin-fs` ^2.4.5 — Filesystem access from frontend
- `@tauri-apps/plugin-process` ^2.3.1 — Process management (restart)
- `@tauri-apps/plugin-shell` ^2.3.5 — Open URLs in system browser
- `@tauri-apps/plugin-updater` ^2.10.0 — In-app auto-update mechanism

**Critical (Backend/Rust):**
- `tauri` 2.x — Core framework with `protocol-asset` feature
- `reqwest` 0.12 — HTTP client with `json` and `stream` features (GitHub API calls, downloads)
- `tokio` 1.x — Async runtime (`fs`, `sync`, `process`, `macros`, `rt` features)
- `serde` / `serde_json` — Serialization for IPC and config
- `toml` 0.8 — TOML config parsing
- `dirs` 6 — Platform-specific directory discovery (XDG, home)
- `zip` 2.x — Archive extraction (save imports)
- `futures-util` 0.3 — Async stream utilities
- `thiserror` 2 — Error type derivation

**Infrastructure:**
- `tauri-plugin-shell` / `tauri-plugin-updater` / `tauri-plugin-process` / `tauri-plugin-fs` / `tauri-plugin-dialog` — Tauri plugin suite (Rust side)

## Configuration

**Environment:**
- `TAURI_DEV_HOST` env var — Optional dev server host for remote HMR
- Tauri signing keys via `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (CI secrets)
- App data stored in platform-specific directories via `dirs` crate (XDG on Linux)

**Build:**
- `vite.config.ts` — Vite config with manual chunk splitting (vendor-react, vendor-tauri), esbuild minification, port 1420
- `tsconfig.json` — Project references to `tsconfig.app.json` and `tsconfig.node.json`
- `tsconfig.app.json` — Target ES2023, strict mode, react-jsx, bundler module resolution
- `eslint.config.js` — Flat config with typescript-eslint, react-hooks, react-refresh plugins
- `tauri.conf.json` — App window config (1100x700), CSP policy, AppImage bundling
- `Cargo.toml` — Rust crate config with cdylib/staticlib targets

## Platform Requirements

**Development:**
- Linux (primary target platform — AppImage distribution)
- Node.js 22+
- Rust stable toolchain
- WebKit2GTK 4.1 dev libraries, libappindicator3, librsvg2, patchelf, libfuse2

**Production:**
- Linux x86_64 (AppImage)
- Wayland or X11 display server
- XDG_DATA_HOME or ~/.local/share for desktop integration

---

*Stack analysis: 2026-03-27*
