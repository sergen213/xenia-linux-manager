# Phase 3 Plan — Frontend Rewire

Spec: `docs/superpowers/specs/2026-06-16-electron-port-phase3-frontend-design.md`

## Task 1 — Create the bridge

`src/platform/bridge.ts`: ambient `Window.xlm` decl + drop-in shims.

- `invoke<T>(method, params?)` → `window.xlm.invoke<T>` (passthrough).
- `type UnlistenFn = () => void`.
- `listen<T>(event, handler)` → wraps `window.xlm.on`; resolves a Promise to
  the unsubscribe; calls `handler({ payload })`.
- `convertFileSrc(path)` → passthrough.
- `open(opts)` → `properties = [directory ? 'openDirectory' : 'openFile']`,
  push `'multiSelections'` if `multiple`; call `openDialog({ properties, title })`;
  map `{canceled,filePaths}` → `null` (cancel/empty) | `filePaths` (multiple) |
  `filePaths[0]`.

## Task 2 — Swap consumer imports (logic unchanged)

Each file: change only the import source to the relative bridge path
(`../../../platform/bridge` for `src/features/<x>/<sub>/`).

| File | Old import | New |
| --- | --- | --- |
| `features/tasks/api/tasksClient.ts` | `invoke` from `api/core`; `listen, UnlistenFn` from `api/event` | both from bridge |
| `features/tasks/state/TasksProvider.tsx` | `type UnlistenFn` from `api/event` | from bridge |
| `features/settings/api/releaseClient.ts` | `invoke` from `api/core` | bridge |
| `features/settings/api/settingsClient.ts` | `invoke` from `api/core` | bridge |
| `features/xenia/api/xeniaClient.ts` | `invoke` from `api/core` | bridge |
| `features/library/api/libraryClient.ts` | `invoke` from `api/core` | bridge |
| `features/library/state/useLaunchActions.ts` | `open as openDialog` from `plugin-dialog` | `open as openDialog` from bridge |
| `features/library/components/LibrarySourcesPanel.tsx` | `open as openDialog` from `plugin-dialog` | bridge |
| `features/library/components/LibraryGrid.tsx` | `convertFileSrc` from `api/core` | bridge |

## Task 3 — Test migration (13 files)

Retarget `vi.mock("@tauri-apps/api/core", …)` → `vi.mock("<rel>/platform/bridge", …)`
with a complete factory. Relative path by location:
- `src/features/<x>/__tests__/*` → `../../../platform/bridge`
- `src/components/app-shell/*` → `../../platform/bridge`
- `src/app/router.test.tsx` → `../platform/bridge`

Factory (preserve original `invoke` behavior; add safe defaults):
```ts
vi.mock("<rel>/platform/bridge", () => ({
  invoke: vi.fn()/* original behavior */,
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
  open: vi.fn(async () => null),
}));
```
`LibraryGrid.test`: keep its `convertFileSrc` mock + assertion.

Files: router, DashboardHome, Sidebar, AppShell, SettingsPage, StatusBar,
LibrarySourcesPanel, XeniaRecoveryActions, FirstRunSetup, TasksPage,
XeniaLifecycleDialog, LibraryGrid, XeniaLifecycleCard.

## Task 4 — Global stub + dep cleanup

- `src/test-setup.ts`: install default `window.xlm` mock.
- `package.json`: remove `@tauri-apps/*` deps + `@tauri-apps/cli` + `tauri`
  script. Do **not** run `npm install`.

## Task 5 — Verify

- `npx tsc -b`
- `npx vitest run`
- `grep -rn @tauri-apps src/` → empty
- Adversarial multi-angle review of the diff.
