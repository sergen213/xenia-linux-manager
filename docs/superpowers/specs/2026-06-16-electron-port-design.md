# Electron Port — Design Spec

**Date:** 2026-06-16
**Status:** Approved (design); pending implementation plan
**Scope:** Port Xenia Linux Manager from Tauri (Rust backend + WebView) to Electron, keeping the existing Rust as a stdio sidecar.

---

## 1. Context

The app today is a Tauri v2 application:

- **Backend:** ~17,500 LOC of Rust across 55 files (`src-tauri/src`). Modules: `xenia` (install/download/lifecycle/releases), `library` (scan/catalog/discovery/steam/titleid/artwork/launch/shortcuts), `patches`, `profiles`, `saves`, `settings`, `jobs`. This is where all the real work lives.
- **Frontend:** React 19 + Vite + react-router (`src/`). UI only. Talks to Rust via Tauri `invoke()` (96 call sites, wrapped behind 5 `api/` client files), `listen()` for job events, `convertFileSrc()` for artwork, and `@tauri-apps/plugin-dialog` for file pickers.

The Tauri coupling is remarkably contained. Only **6 Rust files** touch Tauri:

| File | Tauri usage |
|---|---|
| `lib.rs` | `tauri::Builder`, plugin registration, `generate_handler!` (77 commands), `.manage()` state |
| `jobs/events.rs` | `AppHandle.emit` for 5 job events |
| `library/scan_jobs.rs` | `AppHandle` for scan progress |
| `commands/library.rs` | 4 `AppHandle` args |
| `commands/xenia.rs` | 9 `AppHandle` args |
| (all `commands/*`) | `#[tauri::command]` + `tauri::State` arg signatures |

Crucially, **path resolution already uses the `dirs` crate (XDG)** — `~/.local/share/xenia-linux-manager`, `dirs::config_dir()` — *not* Tauri's path API. So the sidecar resolves all its own paths; **no path injection from Electron is required.**

## 2. Goal

Replace the Tauri runtime with Electron while reusing 100% of the Rust logic, by running the Rust as a long-lived **sidecar process** that Electron drives over stdio JSON-RPC.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Backend strategy | Keep Rust as a **sidecar** (compile to standalone `xlm-core` binary). No rewrite of logic. |
| Transport | **Long-lived daemon over stdio, newline-delimited JSON (NDJSON).** |
| Target platforms | **Linux only** (AppImage), matching today. |
| App self-update | **Port to `electron-updater`** against GitHub releases. |
| Migration | **Replace Tauri outright** — no side-by-side dual build. Remove Tauri once Electron verified in the cutover phase. |

## 4. Non-goals

- No change to Rust business logic, data formats, on-disk layout, or XDG paths.
- No new features. Behavior parity with the current Tauri app.
- No Windows/macOS support in this pass.
- No change to the React component tree beyond the IPC seam.

## 5. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Electron                                                 │
│  ┌────────────────┐   contextBridge    ┌───────────────┐ │
│  │ Renderer (React)│◀──window.xlm──────▶│ preload.ts    │ │
│  │  5 api clients  │                     └──────┬────────┘ │
│  │  bridge.ts      │                            │ ipc      │
│  └────────────────┘                     ┌───────▼────────┐ │
│   xlm-asset:// img  ◀────protocol────────│ main.ts        │ │
│                                          │  - window/CSP  │ │
│                                          │  - dialog      │ │
│                                          │  - electron-   │ │
│                                          │    updater     │ │
│                                          │  - sidecar.ts  │ │
│                                          └───────┬────────┘ │
└──────────────────────────────────────────────────┼─────────┘
                              stdin/stdout NDJSON    │
                                          ┌──────────▼────────┐
                                          │ xlm-core (Rust)   │
                                          │  JSON-RPC loop    │
                                          │  77-method dispatch│
                                          │  EventSink→stdout │
                                          │  JobRegistry/Scan │
                                          │  + all logic (17K)│
                                          └───────────────────┘
```

### Security posture
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer.
- Renderer reaches the OS only through `window.xlm` (preload allowlist). No `require`, no Node in renderer.
- `xlm-asset://` handler validates every requested path is inside an allowed root (app data dir + configured library/artwork dirs) — rejects traversal / arbitrary reads.
- CSP tightened: the renderer no longer needs `connect-src` to GitHub (all network is in Rust). Allow `self`, `xlm-asset:`, `data:` for images.

## 6. Sidecar protocol (the contract)

One JSON object per line. UTF-8. `serde_json` emits newline-free output, so NDJSON framing is safe. **stderr is logging only**, never protocol; Electron pipes it to its log.

**Request** (Electron → sidecar stdin):
```json
{"id": "<uuid>", "method": "<command_name>", "params": { ... }}
```

**Response** (sidecar → stdout):
```json
{"kind": "response", "id": "<uuid>", "ok": true,  "result": <value>}
{"kind": "response", "id": "<uuid>", "ok": false, "error": "<message>"}
```

**Event** (sidecar → stdout, unsolicited):
```json
{"kind": "event", "event": "job:progress", "payload": { ... }}
```

**Handshake:** on startup, after state is initialized, the sidecar emits exactly one
`{"kind":"event","event":"ready","payload":{"version":"<crate version>"}}`.
Electron waits for `ready` before showing the window / enabling IPC.

### Wire compatibility (minimize frontend churn)
- `params` uses the **same camelCase keys the frontend already sends** to Tauri. The bridge forwards the existing `invoke(cmd, args)` `args` object verbatim as `params`. Per-command param structs in Rust use `#[serde(rename_all = "camelCase")]` to match.
- `result` is the command's return value serialized exactly as Tauri did.
- On `ok:false`, the bridge's `invoke` **rejects with `new Error(error)`** — identical to Tauri's reject-on-`Result::Err` behavior. Frontend error handling is unchanged.
- Job event payloads keep their **exact current serde serialization** (e.g. `job_id`, `progress`, `label`). Frontend `listen` handlers are unchanged.

### Command inventory (77)
All 77 `#[tauri::command]` functions registered in `lib.rs` become dispatch methods, keyed by their existing snake_case names (`load_settings`, `start_install`, `launch_library_game`, …). The full list is the `generate_handler!` block in `lib.rs`.

### Event inventory (5 + handshake)
`job:created`, `job:progress`, `job:log`, `job:completed`, `job:failed` (from `jobs/events.rs`), plus the `ready` handshake event.

## 7. Bridge mapping (Tauri API → Electron)

| Tauri today | Electron replacement |
|---|---|
| `invoke(cmd, args)` ×96 (in 5 clients) | `window.xlm.invoke(cmd, args)` → `ipcRenderer.invoke('xlm:invoke', …)` → main → sidecar RPC |
| `listen("job:*", cb)` | sidecar event line → main → `webContents.send` → `window.xlm.on(event, cb)` |
| `convertFileSrc(path)` | `xlm-asset://local/<encodeURIComponent(path)>` via registered custom protocol |
| `@tauri-apps/plugin-dialog` `open()` | `window.xlm.openDialog(opts)` → ipc → main `dialog.showOpenDialog` |
| `open_path` command (shell plugin) | **stays in Rust** via `xdg-open` (no Tauri dep) |
| `@tauri-apps/plugin-fs` | **dropped** (frontend never used it; Rust uses `std::fs`) |
| `@tauri-apps/plugin-process` (relaunch/exit) | `app.relaunch()` / `app.quit()` in main |
| Tauri updater | `electron-updater` against GitHub releases |

## 8. Rust refactor (logic untouched)

Introduce an app context that carries state and an event sink, replacing `AppHandle`/`State`:

```rust
struct AppCtx {
    jobs: Arc<JobRegistry>,
    scans: Arc<ScanCoordinator>,
    events: EventSink,
}

// EventSink owns a locked handle to stdout; writes {"kind":"event",...} lines.
enum EventSink { Stdout(Arc<Mutex<...>>), /* Null for tests */ }
```

Changes:
1. `jobs/events.rs` — emit helpers take `&EventSink` instead of `&AppHandle`; serialize identical payloads to NDJSON event lines.
2. `library/scan_jobs.rs` + the 4 `commands/library.rs` + 9 `commands/xenia.rs` `AppHandle` sites — take `&AppCtx` / `&EventSink`.
3. All `commands/*` — drop `#[tauri::command]`; convert signatures to `(ctx: &AppCtx, params: Params) -> Result<T, String>`. Bodies unchanged (they already call pure logic).
4. New `main.rs` = the JSON-RPC server: read stdin lines, parse requests, `dispatch(&ctx, method, params).await`, write tagged responses; spawn long-running work that emits events.
5. `dispatch(method, params)` = a `match` over the 77 method names, each deserializing `params` and calling its command fn.
6. `Cargo.toml` — remove `tauri` + `tauri-plugin-*`; add `tokio` (if not present) for the async loop and `serde_json` framing. Add `[[bin]] name = "xlm-core"`.
7. Keep all existing `#[cfg(test)]` unit tests; they exercise the logic modules and must stay green.

## 9. Electron structure (new `electron/`)

- `electron/main.ts` — app lifecycle, `BrowserWindow` (1100×700, matching tauri.conf), CSP, register `xlm-asset://`, `ipcMain.handle('xlm:invoke')`, dialog handlers, `electron-updater` wiring, owns the sidecar.
- `electron/preload.ts` — `contextBridge.exposeInMainWorld('xlm', { invoke, on, convertFileSrc, openDialog })`.
- `electron/sidecar.ts` — spawn `xlm-core`, NDJSON line framing, request/response correlation by `id`, route `event` lines to all windows, wait-for-`ready`, restart-on-crash with backoff, drain stderr to log.
- Binary resolution: dev → `src-tauri/target/debug/xlm-core`; prod → `process.resourcesPath/xlm-core`.

## 10. Frontend rewire

- New `src/platform/bridge.ts` — exports `invoke`, `on`, `convertFileSrc`, `openDialog` backed by `window.xlm`. Single import surface.
- The 5 `api/*Client.ts` files import `invoke` from `bridge` instead of `@tauri-apps/api/core`.
- `TasksProvider.tsx` uses `bridge.on` instead of `@tauri-apps/api/event` `listen`.
- `LibraryGrid.tsx` uses `bridge.convertFileSrc`.
- The 2 `plugin-dialog` call sites use `bridge.openDialog`.
- Remove all `@tauri-apps/*` dependencies from `package.json`.
- Update vitest: replace Tauri mocks with a `window.xlm` mock in test setup.

## 11. Build & packaging

- **Tooling:** `electron-vite` (handles main/preload/renderer via the existing Vite config + HMR; clean contextBridge support). Fallback: manual vite + esbuild + `concurrently`.
- **Dev:** `npm run dev` → cargo build `xlm-core` (debug) → electron-vite dev (renderer HMR + main/preload watch) → launch Electron pointing at the sidecar.
- **Build:** cargo build `--release` `xlm-core` → electron-vite build → `electron-builder` AppImage target, bundling `xlm-core` as `extraResources`.
- **Self-update:** `electron-builder` publishes `latest-linux.yml`; replace `scripts/generate-updater-manifest.mjs` (Tauri manifest) accordingly. `electron-updater` consumes it.
- **Cutover:** delete Tauri builder/plugins, `tauri.conf.json`, `@tauri-apps/*` deps, and Tauri CLI scripts. Keep the Rust crate (now a sidecar, not a Tauri app). Port icons.

## 12. Phasing

Each phase is its own spec → plan → execute → verify cycle.

### Phase 1 — Rust sidecar core
Introduce `AppCtx`/`EventSink`; NDJSON stdio JSON-RPC server in `main.rs`; 77-method `dispatch`; port the 5 event emitters + scan progress; drop Tauri from `Cargo.toml`; add `xlm-core` bin.
**Verify:** a pipe-in/assert-out test harness round-trips representative commands and asserts response + event lines; the `ready` handshake fires; all existing `cargo test` stay green; `cargo build` produces `xlm-core` with no Tauri deps.

### Phase 2 — Electron shell
`main.ts` + `preload.ts` + `sidecar.ts`; `xlm-asset://` protocol with path validation; dialog bridge; window/CSP; `electron-updater` scaffolding.
**Verify:** Electron boots, spawns the sidecar, waits for `ready`, round-trips a ping + one real command (`load_settings`), and renders one artwork image via `xlm-asset://`.

### Phase 3 — Frontend rewire
`bridge.ts`; swap the 5 clients + `listen` + `convertFileSrc` + dialog; remove `@tauri-apps/*`; fix vitest mocks.
**Verify:** full UI runs in Electron dev; every screen's IPC works; all vitest green; no `@tauri-apps` import remains.

### Phase 4 — Packaging + cutover
`electron-builder` AppImage bundling `xlm-core`; dev/build scripts; `electron-updater` + manifest; delete the Tauri layer; icons.
**Verify:** built AppImage launches and exercises install/scan/launch/patch/profile/save flows end-to-end; `grep -r tauri` shows only the (now non-Tauri) Rust crate name, no runtime deps.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Async command concurrency (multiple in-flight RPCs + events interleaved on stdout) | Single writer mutex around stdout; tokio tasks per request; correlation by `id`. |
| Long-running jobs blocking the read loop | Spawn job work on tokio tasks; the read loop only parses + dispatches. |
| `electron-updater` + AppImage quirks | Validate update flow early in Phase 4; document the AppImage relaunch path. |
| `xlm-asset://` path traversal | Strict allowlist of roots + canonicalize + prefix check before serving. |
| Param shape mismatch (camelCase vs snake_case) | Per-command params struct with `rename_all = "camelCase"`; covered by Phase 1 harness against real frontend payloads. |
| Sidecar crash mid-session | Supervisor restarts with backoff; surface a UI error event; in-flight RPCs reject. |

## 14. Open items (resolve during planning)

- Confirm whether the Rust crate currently pulls `tokio`; if not, add it (or use a thread + blocking stdin loop).
- Confirm exact frontend payload shapes for the handful of commands with non-trivial nested args, to lock the `params` structs.
- Decide the sidecar log destination in prod (Electron `app.getPath('logs')`).
