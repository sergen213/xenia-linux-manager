# External Integrations

**Analysis Date:** 2026-03-27

## APIs & External Services

**GitHub Releases API:**
- Used to discover latest Xenia Canary emulator builds
- Endpoint: `https://api.github.com/repos/xenia-canary/xenia-canary/releases`
- SDK/Client: `reqwest` (Rust HTTP client)
- Auth: Unauthenticated (public API, user-agent: `xenia-linux-manager/0.1`)
- Implementation: `src-tauri/src/xenia/releases.rs` — fetches releases, selects Linux-compatible archive assets

**GitHub Releases (self-hosted):**
- Release notes URL template: `https://github.com/xenialinuxmanager/releases/tag/v{version}`
- Updater manifest download base: `https://github.com/xenialinuxmanager/releases/latest/download`
- CSP allows connections to `https://api.github.com` and `https://github.com`

**Tauri Updater Endpoint:**
- In-app auto-update via `tauri-plugin-updater`
- Checks for updates against hosted `latest.json` manifest
- Requires packaged AppImage build + signing key configuration
- Implementation: `src-tauri/src/release/mod.rs` — `check_updater_readiness()`

## Data Storage

**Databases:**
- None — Application uses filesystem-based configuration

**File Storage:**
- Local filesystem only
- App settings stored as TOML files in platform config directories
- Game library metadata, patches, profiles, saves stored in user-specified directories
- File access via `tauri-plugin-fs` and Rust `std::fs`
- Path discovery via `dirs` crate (XDG Base Directory spec on Linux)

**Caching:**
- None detected — game artwork fetched on demand

## Authentication & Identity

**Auth Provider:**
- None — No user authentication system. The app is a local desktop tool.

## Monitoring & Observability

**Error Tracking:**
- None — No external error tracking service integrated

**Logs:**
- Standard Rust/Node.js console logging
- Tauri's built-in logging infrastructure

## CI/CD & Deployment

**Hosting:**
- GitHub Releases — AppImage distribution
- GitHub Actions — CI/CD pipeline

**CI Pipeline:**
- Workflow: `.github/workflows/release-appimage.yml`
- Trigger: Git tags matching `v*.*.*` or manual `workflow_dispatch`
- Steps: Checkout → Install Linux deps → Setup Node.js 22 + Rust stable → `npm ci` → `npm run test -- --run` → `cargo test` → `npm run tauri build -- --bundles appimage` → Generate updater manifest → Upload artifacts → Create GitHub Release via `softprops/action-gh-release@v2`
- Signing: Tauri signing keys via GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)

## Environment Configuration

**Required env vars:**
- `TAURI_DEV_HOST` — Optional, sets dev server host for remote HMR
- `TAURI_SIGNING_PRIVATE_KEY` — Tauri updater signing key (CI only)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — Signing key passphrase (CI only)
- `APPIMAGE` — Set automatically by AppImage runtime at launch

**Secrets location:**
- GitHub Actions secrets for CI signing keys
- No local `.env` files detected in the repository

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- GitHub API calls to `api.github.com` for release discovery (unauthenticated)

## Tauri Plugin Permissions

Configured in `src-tauri/capabilities/default.json`:
- `core:default` — Core Tauri IPC
- `shell:allow-open` — Open URLs in system browser
- `updater:default` — In-app update checks
- `process:allow-restart` — Application restart
- `dialog:default` — Native file/folder dialogs
- `fs:default` / `fs:allow-*-read-recursive` / `fs:read-dirs` — Filesystem access scoped to appdata, localdata, home

---

*Integration audit: 2026-03-27*
