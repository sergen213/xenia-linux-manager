# Native integrated title bar (frameless, KDE-first)

**Date:** 2026-06-17
**Status:** Approved (design)
**Topic:** Replace the default OS window frame with an app-themed custom title bar so the Electron window reads as one cohesive, native-feeling Linux app.

## Problem

The window currently uses the default OS frame (`BrowserWindow` with no `titleBarStyle`/`frame` options). The window-manager title bar sits above the dark graphite UI as a disjoint strip, and no `backgroundColor` is set, so the window flashes white on load. The result does not feel native.

## Goal

A frameless window with a custom, themed title bar integrated into the app chrome:

- Drag region to move the window.
- Window controls (minimize, maximize/restore, close) on the right (KDE convention).
- Themed to match the dark graphite palette; reads as one piece with the sidebar.
- No white flash on launch.
- Degrades gracefully when the window bridge is absent (browser / themed preview / tests).

Target environment: KDE Plasma (KWin). Should not break on other DEs.

## Non-goals

- No custom application menu / menu bar.
- No per-DE control-layout detection (KDE right-side layout is fine everywhere).
- No window-snapping logic in app code (rely on the WM via native move).
- No title-bar context menu.

## Architecture

Frameless `BrowserWindow` + a React `TitleBar` component. Window operations flow:

```
TitleBar button → window.xlm.win.X() → ipcRenderer.invoke('xlm:win:X')
  → main process acts on the focused BrowserWindow
```

Maximized state flows back so the max/restore icon stays correct:

```
BrowserWindow 'maximize'/'unmaximize' → webContents.send → preload onMaximizeChange(cb) → TitleBar swaps icon
```

## Components and changes

### 1. `electron/main/index.ts`

- `BrowserWindow` options: add `frame: false`, `backgroundColor: '#18181b'` (canvas color — kills white flash), `minWidth: 880`, `minHeight: 600`. Keep `resizable: true`.
- Register IPC handlers (act on `BrowserWindow.getFocusedWindow() ?? getAllWindows()[0]`, guarding destroyed/null):
  - `xlm:win:minimize` → `win.minimize()`
  - `xlm:win:toggleMaximize` → `win.isMaximized() ? win.unmaximize() : win.maximize()`
  - `xlm:win:close` → `win.close()`
  - `xlm:win:isMaximized` → returns `win.isMaximized()`
- In `createWindow`, wire `win.on('maximize')` / `win.on('unmaximize')` to `win.webContents.send('xlm:win:maximize-changed', isMaximized)`; unsubscribe on `closed` (follow the existing `unsubEvents`/`unsubCrash` pattern).

### 2. `electron/preload/index.ts` + `electron/preload/xlm.d.ts`

Expose a `win` namespace on the `xlm` bridge:

```ts
win: {
  minimize: () => ipcRenderer.invoke('xlm:win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('xlm:win:toggleMaximize'),
  close: () => ipcRenderer.invoke('xlm:win:close'),
  isMaximized: () => ipcRenderer.invoke('xlm:win:isMaximized'),
  onMaximizeChange: (cb: (maximized: boolean) => void) => {
    const listener = (_e, maximized: boolean) => cb(maximized)
    ipcRenderer.on('xlm:win:maximize-changed', listener)
    return () => ipcRenderer.removeListener('xlm:win:maximize-changed', listener)
  },
}
```

Add the matching `WinControls` interface to `xlm.d.ts` and extend `XlmBridge` with `win?: WinControls` (optional, so renderer code can feature-detect).

### 3. `src/components/app-shell/TitleBar.tsx` + `TitleBar.css`

- Slim full-width bar, height 38px.
- Background `--color-bg-sidebar` (`#121214`) so the bar + sidebar read as one continuous chrome; 1px bottom border `--color-border`.
- Whole bar `-webkit-app-region: drag`; buttons `-webkit-app-region: no-drag`.
- Left: muted window title text ("Xenia Manager for Linux"), `--color-text-secondary`. No large brand (the sidebar keeps the brand — avoid duplication).
- Right: three control buttons, KDE order minimize · maximize/restore · close. Lucide icons: `Minus`, `Square` (maximize) / `Copy` (restore), `X` (close). Hover backgrounds use `--color-bg-hover`; close button hover background red.
- Double-click on the drag area (not on buttons) → `toggleMaximize`.
- State: `const [maximized, setMaximized]`. On mount, call `isMaximized()` to seed and subscribe via `onMaximizeChange`; unsubscribe on unmount.
- Feature detection: read `window.xlm?.win`. If absent, render the bar (for consistent layout) but hide the control buttons and skip subscriptions — keeps browser preview and unit tests working.

### 4. `src/components/app-shell/AppShell.tsx` + `AppShell.css`

- Restructure to a column: `TitleBar` on top, then a body row containing `Sidebar` + `main.app-shell__content`.
- `.app-shell` becomes `flex-direction: column`. Introduce `.app-shell__body` (the old flex-row: `display:flex; flex:1; min-height:0; overflow:hidden`). Sidebar + content move inside it. Content keeps its scroll/padding.

### 5. Flash fix

`backgroundColor` on the window plus ensuring `html, body` background is the canvas color (verify `src/styles/app.css`; add if missing).

## Data flow summary

1. User clicks a control → `xlm.win.<op>()` → IPC invoke → main mutates focused window.
2. Window maximize/unmaximize (from button OR WM, e.g. KDE tiling/double-click on bar) → main emits `xlm:win:maximize-changed` → TitleBar updates the icon. This keeps the icon correct even when the user maximizes via the WM rather than the button.

## Error handling / edge cases

- IPC handlers guard against null/destroyed windows.
- Renderer feature-detects `xlm.win`; absent bridge → no crash, controls hidden.
- Maximized window: optionally drop rounded corners (cosmetic; only if corners are rounded — minor, can defer).

## Testing

- **TitleBar unit (vitest + React Testing Library):** with a stubbed `window.xlm.win`, assert each button invokes the right bridge method; assert the icon swaps when `onMaximizeChange(true)` fires; assert that with no `window.xlm.win` the controls are not rendered and nothing throws.
- **Electron main (`electron/main/__tests__`):** assert `createWindow` passes `frame:false` + `backgroundColor`; assert the four `xlm:win:*` IPC handlers are registered. Follow the existing electron-stub harness.
- **Manual on KDE/KWin (real Electron, `npm run dev`):** move via drag; KDE edge-snap / quarter-tiling; resize from window edges; minimize; maximize/restore via button and via double-click; close. Confirm no white flash on launch.

## Risks

- **Frameless edge-resize on Linux/KWin:** relies on Electron's built-in edge hit-testing with `resizable:true`. If KWin provides no resize grip for the frameless window, add thin CSS resize-handle divs (`-webkit-app-region: no-drag`) around the window edges as a fallback. Verify during manual test.
- **Drag-snap:** `-webkit-app-region: drag` triggers a native WM move on Linux, so KDE snapping should work. Verify during manual test.

## Out of scope / future

- Remembering window size/position across launches.
- Window menu / keyboard accelerators.
- Per-DE control placement.
