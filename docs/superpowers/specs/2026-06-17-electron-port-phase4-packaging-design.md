# Phase 4 — Packaging + Cutover (Tauri → Electron)

**Date:** 2026-06-17
**Branch:** `backup-2026-03-26`
**Depends on:** Phase 1 (Rust sidecar `xlm-core`), Phase 2 (Electron shell + `window.xlm`), Phase 3 (frontend rewired to `src/platform/bridge.ts`)

## Goal

Make the Electron app a distributable Linux **AppImage** that bundles the
`xlm-core` Rust sidecar, promote the Electron toolchain to the primary
dev/build entrypoint (cutover *off* Tauri), and delete the dead Tauri
scaffolding. After this phase the repo builds and ships as an Electron app with
no Tauri config, scripts, or tooling left.

## What is already done (verified in source, not Phase 4 work)

Phase 2 already shipped the runtime pieces that a naive Phase-4 reading assumes
are pending:

- **Prod `file://` routing** — `electron/main/index.ts` already does
  `win.loadFile(join(__dirname, '../renderer/index.html'))` when
  `app.isPackaged` (dev uses `ELECTRON_RENDERER_URL`).
- **Prod vs dev CSP** — already branched on `app.isPackaged`.
- **Packaged sidecar resolution** — `electron/main/paths.ts`
  `resolveSidecarPath()` already returns `join(process.resourcesPath, 'xlm-core')`
  when it exists, falling back to the cargo target in dev.

So Phase 4 is **packaging config + cutover + cleanup**, not new runtime code.
The one job the config must do is *place* `xlm-core` at
`<resources>/xlm-core` so the existing resolver finds it.

## Environment constraints (decided with the user)

- **Publish: inert.** No git remote exists. `build.publish` stays as a
  GitHub-provider scaffold with `owner: REPLACE_OWNER`; the updater is already
  graceful-inert (`electron/main/updater.ts` swallows feed errors). Wiring a
  real owner is deferred until the GitHub repo exists. Packaging does not
  depend on it.
- **Verification depth: config + `electron-vite build` + dry validate.** The
  known electron-binary-extract breakage on `/mnt/1st4TB` (see
  `electron-binary-extract-workaround`) plus a sandboxed network make a full
  AppImage build unreliable here. Acceptance is: config parses, `electron-vite
  build` produces `out/{main,preload,renderer}`, `electron-builder --dir`
  validates the bundle layout (best-effort), and all suites stay green. The
  actual AppImage build is the maintainer step, documented in the README.
- The electron toolchain (`electron-vite`, `electron-builder`, the `electron`
  binary) is **not currently installed** — only renderer deps are. Any
  toolchain verification requires `npm install` + the unzip recovery for the
  electron binary. This is attempted in execution and falls back to
  config-correctness validation if the sandbox blocks it.

## Work items

### 1. electron-builder config (`build` block in `package.json`)

Expand the existing minimal block:

- `productName: "Xenia Manager for Linux"` (matches the window title).
- `directories.output: "release"` (gitignored), `directories.buildResources: "build"`.
- `files: ["out/**/*", "package.json"]` — electron-vite output only.
- `extraResources: [{ from: "src-tauri/target/release/xlm-core", to: "xlm-core" }]`
  → lands at `<resources>/xlm-core`, matching `resolveSidecarPath()`.
  electron-builder preserves the file's exec bit.
- `linux: { target: ["AppImage"], category: "Game", icon: "build/icon.png" }`.
- `asar: true` (default). The sidecar is an extraResource **outside** asar, so
  it remains a real spawnable file.
- `publish`: keep the github/`REPLACE_OWNER` scaffold (inert).

### 2. Icon

electron-builder's Linux target requires an icon ≥512×512. Existing
`src-tauri/icons/` tops out at 256 (`128x128@2x.png`). Upscale it to
`build/icon.png` at 512×512 with `magick`. `build/` becomes `buildResources`.

### 3. npm scripts cutover

- `build:sidecar`: `cd src-tauri && cargo build --release --bin xlm-core`.
- `dist`: `npm run build:sidecar && electron-vite build && electron-builder --linux AppImage`.
- `pack`: `electron-vite build && electron-builder --dir` (unpacked dry validate).
- Repoint primaries to the Electron toolchain so Electron is *the* app:
  `dev` → `electron-vite dev`, `build` → `electron-vite build`,
  `preview` → `electron-vite preview`. Drop the now-redundant `electron:*`
  duplicates (or keep `electron:dev` as an alias; redundant ones removed).
- Keep `test`, `test:electron`, `smoke`, `lint`.
- Remove `release:manifest` (see item 5).

`main` already points at `out/main/index.js` — unchanged.

### 4. Delete Tauri scaffolding

Tracked files to `git rm`:
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/` (`default.json`)
- `src-tauri/gen/` (952K of Tauri ACL/schema codegen)
- `src-tauri/icons/` (superseded by `build/icon.png`)
- `patch_tauri_conf_scope.py` (root Tauri-config patch helper)
- `vite.config.ts` (Tauri renderer-only Vite config; `electron.vite.config.ts`
  is the real one. Verified independent: neither `vitest.config.ts` nor
  `vitest.electron.config.ts` imports it.)

`src-tauri/` itself stays — it is the Rust **sidecar source** (Cargo bin
`xlm-core`, already Tauri-dependency-free). Dir name kept because
`paths.ts`/scripts reference it. Stale `dist/` (gitignored, untracked) is
removed from disk.

### 5. Release tooling retarget

- `scripts/generate-updater-manifest.mjs` + the `release:manifest` script:
  **remove**. It emits a *Tauri v2* `latest.json` and reads the deleted
  `tauri.conf.json`. electron-builder generates its own `latest-linux.yml`
  feed for electron-updater, so this script is now actively wrong.
- `scripts/verify-appimage-release.sh`: retarget the default artifact dir from
  `src-tauri/target/release/bundle/appimage` → `release/`, and the "build one
  first" hint from `npm run tauri build` → `npm run dist`. Generic AppImage
  checks (magic bytes, desktop file, icon, app-name grep "Xenia Manager")
  stay — productName still contains "Xenia Manager".
- `docs/release/appimage-verification-checklist.md`: replace the two
  `npm run tauri build` / `src-tauri/.../bundle/appimage` references with the
  electron-builder equivalents (`npm run dist`, `release/`).

### 6. Fix `electron/main/__tests__/protocol.test.ts` (pre-existing, in scope)

The whole file fails under `test:electron` because `../protocol` does a
top-level `import { protocol, net } from 'electron'`, and the node-env vitest
config has no `electron` module — the import throws before any test runs (even
the pure `isPathAllowed` cases). Fix: add a minimal `electron` stub fixture and
alias it in `vitest.electron.config.ts` (`resolve.alias` / `test.alias`). The
stub exports the surface the imported main modules touch (`protocol`, `net`,
and enough of `app`/`BrowserWindow`/`dialog`/`ipcMain` to be import-safe).
`sidecar.test` (no electron import) and `updater.test` (mocks
`electron-updater`/`electron-log`) are unaffected.

### 7. Worktree + vitest hygiene

- `git worktree remove` the two stale agent worktrees under
  `.claude/worktrees/` (both verified 0 commits ahead of `backup-2026-03-26`),
  then prune their `worktree-agent-*` branches.
- Add `**/.claude/**` to the renderer vitest `exclude` so a bare `npx vitest
  run` never globs worktree copies of the suite.

## Out of scope

- Real signed AppImage production + GitHub release upload (maintainer step;
  needs a remote + the toolchain on a clean filesystem).
- Wiring a real `publish.owner` / updater feed (deferred — no remote yet).
- Renaming `src-tauri/` (kept; only its Tauri-specific files are removed).
- macOS/Windows targets (Linux AppImage only, per product scope).

## Acceptance

- `package.json` `build` block is a valid electron-builder config; `npm run
  pack` (or, if the toolchain can't install, an offline config-shape check)
  confirms `out/**` + `extraResources` layout.
- `npx tsc -b` clean.
- `npx vitest run` green (renderer suite), and the bare run no longer picks up
  `.claude/worktrees/**`.
- `npm run test:electron` green — **including** all of `protocol.test.ts`.
- No `@tauri-apps` anywhere; `tauri.conf.json`, `capabilities/`, `gen/`,
  `src-tauri/icons/`, `patch_tauri_conf_scope.py`, `vite.config.ts`, and
  `generate-updater-manifest.mjs` are gone.
- `build/icon.png` is ≥512×512.
- README documents the Electron build/dist flow; release docs/scripts no longer
  reference Tauri.
- Independent adversarial multi-lens review confirms: extraResource path ↔
  `resolveSidecarPath()` fidelity, asar/sidecar interaction, no dangling Tauri
  reference, scripts internally consistent, test-fix correctness.
