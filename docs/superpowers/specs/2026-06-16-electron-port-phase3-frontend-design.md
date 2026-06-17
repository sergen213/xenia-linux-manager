# Phase 3 — Frontend Rewire (Tauri → Electron bridge)

**Date:** 2026-06-16
**Branch:** `backup-2026-03-26` (worktree, FF-merge on completion)
**Depends on:** Phase 1 (Rust sidecar), Phase 2 (Electron shell + `window.xlm`)

## Goal

Make the real React renderer run on the Electron host. Replace every
`@tauri-apps/*` runtime API the frontend uses with calls through the Phase 2
`window.xlm` contextBridge, behind a single seam (`src/platform/bridge.ts`).
After this phase the renderer has **zero** `@tauri-apps/*` imports and the
suite is green against the bridge.

Phase 2 verified the host *without* the renderer; this phase wires them
together.

## Surface to replace (verified by scan)

Only three `@tauri-apps` entrypoints are used in `src/`:

| Tauri API | Used by | Count |
| --- | --- | --- |
| `invoke` (`@tauri-apps/api/core`) | 5 api clients: `tasksClient`, `releaseClient`, `settingsClient`, `xeniaClient`, `libraryClient` | 5 |
| `listen` / `UnlistenFn` (`@tauri-apps/api/event`) | `tasksClient` (5 `onJobX`), `TasksProvider` (type only) | 2 |
| `convertFileSrc` (`@tauri-apps/api/core`) | `LibraryGrid` | 1 |
| `open` (`@tauri-apps/plugin-dialog`) | `useLaunchActions`, `LibrarySourcesPanel` | 2 |

No use of `plugin-fs`, `plugin-process`, `plugin-shell`, `plugin-updater`,
`api/window`, or `api/path`. (`openPath` is an in-app sidecar command via
`invoke`, not a Tauri plugin.)

## Bridge surface (`window.xlm`, from Phase 2 preload)

```ts
invoke<T>(method: string, params?: object): Promise<T>
on(event: string, cb: (payload: unknown) => void): () => void   // sync unsubscribe
convertFileSrc(path: string): string                            // xlm-asset://…
openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>
```

## Key compatibility facts (validated against source)

1. **Param convention — no renaming needed.** The sidecar's `rpc.rs`
   deserializes params by **camelCase** key (`arg(&params, "appDataPath")`).
   The clients already pass camelCase top-level keys. `invoke` forwards
   `params` verbatim through IPC → sidecar stdin. End-to-end compatible as-is.

2. **`listen` shape differs.** Tauri `listen<T>(event, handler)` returns
   `Promise<UnlistenFn>` and calls `handler({ payload })`. `window.xlm.on`
   returns a **synchronous** unsubscribe and calls `cb(payload)` directly.
   The bridge's `listen` adapts both: wraps `on` in a resolved Promise and
   re-wraps the payload as `{ payload }`. This keeps `tasksClient`'s `onJobX`
   functions and `TasksProvider`'s `Promise<UnlistenFn>[]` array unchanged.

3. **`open` shape differs.** Tauri `open` returns `string | string[] | null`
   and takes `{ directory, multiple, title }`. Electron's `openDialog` takes
   `{ properties, title }` and returns `{ canceled, filePaths }`. The bridge's
   `open` translates both directions so call sites are untouched.

## Design decision: thin compatibility shims, not call-site rewrites

`bridge.ts` exports **drop-in replacements** matching the former Tauri
signatures (`invoke`, `listen`, `convertFileSrc`, `open`, type `UnlistenFn`).
Every consumer changes only its **import line**; no logic changes in clients,
`TasksProvider`, `useLaunchActions`, `LibrarySourcesPanel`, or `LibraryGrid`.

Rationale: minimal churn, the diff is auditable as a pure import swap, and the
shape adaptations (listen/open) live in exactly one place.

## Test strategy

13 test files mock `vi.mock("@tauri-apps/api/core", …)`. Because consumers now
import from `src/platform/bridge`, those mocks no longer intercept. Each test
retargets its `vi.mock` to the bridge module (relative path) with a **complete**
factory (`invoke`, `listen`, `convertFileSrc`, `open`) so any export the
rendered tree touches is defined. Original per-test `invoke` behavior
(reject / no-op) and `LibraryGrid`'s `convertFileSrc` assertion are preserved.

`src/test-setup.ts` also installs a default global `window.xlm` stub as a
safety net for any unmocked bridge dereference in jsdom.

## Dependency cleanup

Remove `@tauri-apps/*` from `package.json` (`api`, `plugin-dialog`, and the
unused `plugin-fs/process/shell/updater`), plus the `@tauri-apps/cli` devDep
and the `tauri` script. `npm install` is **not** run in this phase (avoids the
known electron-binary-extract breakage on this machine; node_modules still
resolves types for `tsc`/`vitest`). The actual prune lands with Phase 4
packaging. `src-tauri/` (the Rust sidecar source) is untouched.

## Out of scope (Phase 4)

electron-builder packaging, `file://` prod routing, deleting
`tauri.conf.json`/icons, `build.publish` owner.

## Acceptance

- No `@tauri-apps/*` import remains in `src/`.
- `npx tsc -b` clean (renderer + electron projects).
- `npx vitest run` green.
- `src/platform/bridge.ts` is the only module referencing `window.xlm` in `src/`.
- Independent adversarial review confirms param/listen/open/test-mock fidelity.
