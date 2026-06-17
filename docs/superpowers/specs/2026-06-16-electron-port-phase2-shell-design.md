# Electron Port — Phase 2: Electron Shell — Design Spec

**Date:** 2026-06-16
**Status:** Approved (design); pending implementation plan
**Depends on:** Phase 1 (Rust sidecar core) — merged. `xlm-core` binary speaks NDJSON JSON-RPC over stdio.
**Parent design:** `docs/superpowers/specs/2026-06-16-electron-port-design.md`

---

## 1. Context

Phase 1 produced a standalone `xlm-core` Rust binary: a long-lived process that reads request lines `{"id","method","params"}` on stdin and writes `{"kind":"response",...}` / `{"kind":"event",...}` lines on stdout, emitting one `{"event":"ready","payload":{"version"}}` at startup. All 77 commands and 5 job events are wired; zero Tauri.

Phase 2 builds the Electron host that drives this sidecar: a window, the main process, the preload bridge, the `xlm-asset://` artwork protocol, dialog support, and `electron-updater` scaffolding. The React renderer is **not** modified in Phase 2 (it still imports `@tauri-apps/*`); Phase 3 rewires it. Phase 2 verifies the host works via Node unit tests + a headless smoke run, independent of the unported renderer.

The repo today: React 19 + Vite 8, renderer entry `src/main.tsx` (`BrowserRouter`), no `electron/` dir, Electron not installed. A display is available (`DISPLAY=:0`, Wayland) and `xvfb-run` exists for headless runs.

## 2. Goal

A runnable Electron application that spawns `xlm-core`, round-trips commands and streams events between renderer and sidecar over a `contextBridge`, serves artwork via a path-validated custom protocol, exposes native file dialogs, and scaffolds self-update — all verifiable headlessly.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Build tooling | **electron-vite** — one tool builds main + preload + renderer, reuses the existing Vite React config, renderer HMR. |
| Updater scope | **Scaffold `electron-updater` now** (check-on-launch), graceful-inert until Phase 4 publishes a feed. |
| Verification | **Node unit tests** for the sidecar client + a **`--smoke` headless run** under `xvfb-run`. |
| Renderer | **Unchanged in Phase 2.** Phase 3 swaps `@tauri-apps/*` for the bridge. |
| Platform | Linux only. |

## 4. Non-goals

- No renderer/`src/` changes (Phase 3).
- No packaging / AppImage / `latest-linux.yml` / bundling the binary (Phase 4).
- No removal of `@tauri-apps/*` deps yet (Phase 3).
- No prod `file://` load hardening / router change (Phase 3/4) — Phase 2 dev loads the Vite dev-server URL.

## 5. Architecture

```
electron/
  main/index.ts      app lifecycle; BrowserWindow(1100x700, sandboxed); CSP;
                     registerSchemesAsPrivileged + protocol.handle(xlm-asset);
                     create SidecarClient + waitForReady; ipcMain handlers;
                     event piping to webContents; electron-updater; --smoke
  main/sidecar.ts    SidecarClient (spawn, NDJSON framing, request/response by
                     id, ready, event fan-out, restart-on-crash w/ backoff)
  main/protocol.ts   xlm-asset:// handler (path-validated artwork serving)
  preload/index.ts   contextBridge -> window.xlm { invoke, on, convertFileSrc, openDialog }
electron.vite.config.ts   main + preload + renderer (renderer reuses vite.config react setup)
```

### Process / IPC topology
- **Renderer** (sandboxed) → only `window.xlm` (preload allowlist).
- **Preload** → `ipcRenderer.invoke('xlm:invoke', method, params)`, `ipcRenderer.invoke('xlm:openDialog', opts)`, `ipcRenderer.on('xlm:event', …)`.
- **Main** → `SidecarClient` owns the one `xlm-core` child; `ipcMain.handle` routes invokes; sidecar events fan out to all windows via `webContents.send('xlm:event', { event, payload })`.

## 6. Components

### 6.1 `SidecarClient` (`electron/main/sidecar.ts`)
The crux; fully unit-testable in Node without Electron.

Interface:
```ts
type SidecarEvent = { event: string; payload: unknown };
class SidecarClient {
  constructor(opts: { binaryPath: string; autoRestart?: boolean; maxRestarts?: number });
  start(): void;                                   // spawn child, begin framing
  waitForReady(timeoutMs?: number): Promise<{ version: string }>;
  request(method: string, params?: object): Promise<unknown>; // rejects Error(error) on ok:false
  on(event: string, cb: (payload: unknown) => void): () => void; // job:* + 'ready' + lifecycle
  onAny(cb: (e: SidecarEvent) => void): () => void;             // for piping to renderer
  on('crash', cb): ...                              // lifecycle: child exited unexpectedly
  stop(): Promise<void>;                            // graceful kill
}
```
Behavior:
- **Spawn**: `child_process.spawn(binaryPath, [], { stdio: ['pipe','pipe','pipe'] })`. stdout → `readline.createInterface`, one JSON object per line.
- **Framing/route**: parse each line; `kind:"response"` → look up pending promise by `id`, resolve `result` or reject `new Error(error)` when `ok:false`; `kind:"event"` → if `event==="ready"` resolve the ready promise and emit `ready`, else fan out via `onAny`/`on`. Malformed line → log to electron log, skip.
- **request**: generate a unique id (`crypto.randomUUID()`), store `{resolve,reject}` in a pending map, write `JSON.stringify({id,method,params: params ?? {}}) + "\n"` to stdin, return the promise. Optional per-request timeout rejects + evicts.
- **stderr** → forwarded to the main-process log (never parsed as protocol).
- **Supervision**: on child `exit`/`error`, reject all pending with a crash error, emit `crash`. If `autoRestart` and under `maxRestarts`, respawn with exponential backoff (e.g. 250ms, 500ms, 1s, cap 5s) and re-emit `ready` when the new child handshakes; the renderer is notified via a `sidecar:crash` event so the UI can show a banner. In `--smoke` mode `autoRestart=false`.

### 6.2 `main/index.ts`
- `protocol.registerSchemesAsPrivileged([{ scheme: 'xlm-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])` **before** `app.whenReady()`.
- On ready: `protocol.handle('xlm-asset', handler)` (from `protocol.ts`); create `SidecarClient` (binary path resolved per §6.4); `start()`; `await waitForReady()`; create the `BrowserWindow`.
- `BrowserWindow`: 1100×700, resizable, `webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }`. Title "Xenia Manager for Linux".
- `ipcMain.handle('xlm:invoke', (_e, method, params) => sidecar.request(method, params))` — a rejected promise propagates to the renderer as a rejected `ipcRenderer.invoke`.
- `ipcMain.handle('xlm:openDialog', (_e, opts) => dialog.showOpenDialog(win, opts))`.
- `sidecar.onAny(e => win.webContents.send('xlm:event', e))`; also forward `crash` as `{event:'sidecar:crash'}`.
- Renderer load: dev → electron-vite's dev server URL; prod → `loadFile(rendererIndexHtml)` (prod path used only when packaged; Phase 4).
- CSP: set via `session.defaultSession.webRequest.onHeadersReceived` (or a response header on the renderer) — `default-src 'self'; img-src 'self' data: xlm-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'`. No external connect-src (network lives in Rust).
- `electron-updater` (§6.5).
- `--smoke` (§7).
- Standard lifecycle: quit on all-windows-closed (Linux), `stop()` the sidecar on quit.

### 6.3 `preload/index.ts`
```ts
contextBridge.exposeInMainWorld('xlm', {
  invoke: (method, params) => ipcRenderer.invoke('xlm:invoke', method, params),
  openDialog: (opts) => ipcRenderer.invoke('xlm:openDialog', opts),
  convertFileSrc: (path) => `xlm-asset://local/${encodeURIComponent(path)}`,
  on: (event, cb) => {
    const listener = (_e, payload) => { if (payload.event === event) cb(payload.payload); };
    ipcRenderer.on('xlm:event', listener);
    return () => ipcRenderer.removeListener('xlm:event', listener);
  },
});
```
A matching `electron/preload/xlm.d.ts` declares `window.xlm` for the renderer (consumed in Phase 3).

### 6.4 `main/protocol.ts` (`xlm-asset://`)
- Request URL `xlm-asset://local/<encodeURIComponent(absPath)>` → decode to `absPath`.
- **Allowed roots**: the app-data dir (`~/.local/share/xenia-linux-manager`) plus the `library_metadata_path`/`xenia_path` from a cached `load_settings` (fetched via the sidecar at startup and on change). Canonicalize the requested path (`fs.realpath`) and require it to be a prefix-match of a canonicalized allowed root; otherwise return a 403 `Response`. Serve via streaming `Response` with a guessed content-type.
- Binary path resolution helper lives here or in a small `paths.ts`: dev → first existing of `src-tauri/target/release/xlm-core`, `src-tauri/target/debug/xlm-core`; prod → `path.join(process.resourcesPath, 'xlm-core')`.

### 6.5 `electron-updater` scaffolding
- On launch (non-smoke), `autoUpdater.checkForUpdatesAndNotify()` wrapped in try/catch; `autoUpdater.on('error', …)` logs and swallows. With no published feed yet (Phase 4), this no-ops/logs "update feed unavailable" and never crashes or blocks the window.
- Feed comes from `package.json` `build.publish` (GitHub provider, repo coordinates) — added now, consumed when Phase 4 publishes.

## 7. Verification

### 7.1 Node unit tests (vitest, run under Node not jsdom)
`electron/main/__tests__/sidecar.test.ts` drives a real `xlm-core` (built by Phase 1; tests `skip` with a clear message if the binary is absent):
- `waitForReady` resolves with a version string.
- `request('ping')` → `'pong'`; `request('get_default_settings')` → object with `app_data_path`.
- unknown method → promise rejects with an `Error` containing "unknown method".
- two concurrent requests resolve to the right results (id correlation).
- job event delivery: `request('start_install', …)` against a temp dir → an `onAny`/`on('job:created')` listener fires.
- restart-on-crash: kill the child, assert `crash` fires and (with autoRestart) a new `ready` follows.

### 7.2 Headless smoke (`--smoke`)
`main/index.ts`, when `process.argv` includes `--smoke`: after `waitForReady`, run `ping` + `load_settings` + fetch one artwork URL through the `xlm-asset://` handler (using a known file under app-data, or assert the 403 path for a disallowed path), print a one-line PASS/FAIL summary, and `app.exit(0|1)` without requiring user interaction. Wired as `npm run smoke` → `xvfb-run -a electron-vite preview --smoke` (or an equivalent that launches the built main with the flag). CI/agent-runnable.

### 7.3 Lint/build
`electron-vite build` produces `out/main`, `out/preload`, `out/renderer` with no type errors.

## 8. Phasing (7 tasks; each its own test cycle)

1. **Scaffold** — add `electron`, `electron-vite`, `electron-builder`, `electron-updater` deps; `electron.vite.config.ts`; minimal `main/index.ts` that opens a sandboxed window loading the dev-server URL; `preload/index.ts` stub. Verify: `electron-vite build` clean; window opens (manual/xvfb).
2. **SidecarClient** — `main/sidecar.ts` + `main/paths.ts`; Node unit tests (§7.1) against the real `xlm-core`. Verify: unit tests green.
3. **IPC bridge** — `ipcMain.handle('xlm:invoke')` + event piping; preload `window.xlm.{invoke,on}` + `xlm.d.ts`. Verify: a small ipc unit test (mock ipcRenderer) + smoke `ping`/`load_settings` round-trip.
4. **Asset protocol** — `main/protocol.ts` `xlm-asset://` with allowed-root validation; preload `convertFileSrc`. Verify: unit test for path validation (allow/deny) + smoke artwork fetch.
5. **Dialog bridge** — `ipcMain.handle('xlm:openDialog')` + preload `openDialog`. Verify: ipc wiring test.
6. **Updater scaffolding** — `electron-updater` check-on-launch, graceful-inert, `build.publish` in package.json. Verify: launch logs "no feed" path without crashing (smoke stays green).
7. **Smoke harness** — `--smoke` mode + `npm run smoke` (`xvfb-run`) exercising ping + load_settings + artwork; wire crash→renderer event. Verify: `npm run smoke` exits 0.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Electron GUI flakiness in headless CI | All logic in `SidecarClient` is Node-unit-tested without Electron; `--smoke` is the only GUI path and runs under `xvfb-run`. |
| Sidecar binary missing in dev | `paths.ts` checks release then debug; unit tests skip-with-message if absent; doc note to run `cargo build` first. |
| `xlm-asset://` path traversal / arbitrary read | Canonicalize + allowed-root prefix check; 403 otherwise; roots limited to app-data + configured library paths. |
| electron-updater throws with no feed | Wrapped in try/catch + `on('error')`; never blocks window; inert until Phase 4. |
| Sandbox + preload reaching ipcRenderer | `sandbox:true` still allows `contextBridge`/`ipcRenderer` in preload; verified by smoke. |
| Renderer still imports `@tauri-apps/*` | Phase 2 doesn't load the real renderer for logic; smoke uses the bridge directly. Phase 3 rewires. |

## 10. Open items (resolve during planning)
- Exact electron-vite dev-server URL env var name for `loadURL` in dev (electron-vite injects `process.env['ELECTRON_RENDERER_URL']`).
- GitHub repo coordinates for `build.publish` (owner/repo) — confirm during Task 6.
- Whether the smoke artwork check uses a real fetched image or asserts the 403 deny-path (pick one deterministic case in Task 7).
