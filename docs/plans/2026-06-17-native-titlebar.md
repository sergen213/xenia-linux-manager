# Native Integrated Title Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default OS window frame with a frameless window and a custom, themed title bar so the Electron app reads as one cohesive, native-feeling Linux app.

**Architecture:** Frameless `BrowserWindow` (`frame: false`). Window operations flow renderer → preload bridge → main IPC; a dependency-injected `window-controls` module in the main process owns the IPC logic so it is unit-testable. Maximized-state changes flow main → renderer via a `webContents.send` event so the maximize/restore icon stays correct even when the user maximizes via the window manager.

**Tech Stack:** Electron (main + preload), React + TypeScript (renderer), lucide-react icons, Vitest (jsdom project for renderer, node project for `electron/**`), React Testing Library.

## Global Constraints

- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the window — do not weaken.
- No new npm dependencies — `lucide-react` is already a dependency; use it.
- Window background color (anti-flash): `#18181b` (the `--color-bg-primary` canvas value).
- Title bar background: `var(--color-bg-sidebar)` (`#121214`) so the bar unifies with the sidebar.
- Window control order (right side, KDE convention): minimize · maximize/restore · close.
- IPC channel names exactly: `xlm:win:minimize`, `xlm:win:toggleMaximize`, `xlm:win:close`, `xlm:win:isMaximized`, and the renderer-bound event `xlm:win:maximize-changed`.
- The brand "Xenia Manager" stays in the sidebar; the title bar shows only a muted window title — no duplicate brand.
- Renderer code reaches window controls through `src/platform/bridge.ts` only (the single host seam), never `window.xlm` directly.
- Renderer test command: `npm test -- run <path>`. Electron test command: `npm run test:electron`. Type gate: `npx tsc -b`.

---

### Task 1: Window-control IPC module (main process, dependency-injected)

Pure, injectable logic for the four window-control IPC handlers plus the maximize-event forwarder. No `electron` import needed at runtime — deps are passed in, mirroring the testable-pure-function pattern in `electron/main/protocol.ts`.

**Files:**
- Create: `electron/main/window-controls.ts`
- Test: `electron/main/__tests__/window-controls.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `registerWindowControls(deps: WindowControlDeps): void`
  - `wireMaximizeEvents(win: MaximizableWindow): () => void` (returns an unsubscribe)
  - `interface ControllableWindow { minimize(): void; maximize(): void; unmaximize(): void; close(): void; isMaximized(): boolean; isDestroyed(): boolean }`
  - `interface WindowControlDeps { handle: (channel: string, fn: (...args: unknown[]) => unknown) => void; getWindow: () => ControllableWindow | null }`
  - `interface MaximizableWindow { on(event: 'maximize' | 'unmaximize', listener: () => void): void; off(event: 'maximize' | 'unmaximize', listener: () => void): void; isMaximized(): boolean; isDestroyed(): boolean; webContents: { send(channel: string, ...args: unknown[]): void } }`

- [ ] **Step 1: Write the failing test**

Create `electron/main/__tests__/window-controls.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { registerWindowControls, wireMaximizeEvents } from '../window-controls'

function fakeWin() {
  return {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
  }
}

function collectHandlers() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  return { handlers, handle: (c: string, fn: (...a: unknown[]) => unknown) => handlers.set(c, fn) }
}

describe('registerWindowControls', () => {
  it('registers the four win channels', () => {
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => fakeWin() })
    expect([...handlers.keys()].sort()).toEqual([
      'xlm:win:close',
      'xlm:win:isMaximized',
      'xlm:win:minimize',
      'xlm:win:toggleMaximize',
    ])
  })

  it('minimize handler minimizes the target window', () => {
    const win = fakeWin()
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => win })
    handlers.get('xlm:win:minimize')!()
    expect(win.minimize).toHaveBeenCalledOnce()
  })

  it('toggleMaximize maximizes when not maximized', () => {
    const win = fakeWin()
    win.isMaximized.mockReturnValue(false)
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => win })
    handlers.get('xlm:win:toggleMaximize')!()
    expect(win.maximize).toHaveBeenCalledOnce()
    expect(win.unmaximize).not.toHaveBeenCalled()
  })

  it('toggleMaximize unmaximizes when maximized', () => {
    const win = fakeWin()
    win.isMaximized.mockReturnValue(true)
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => win })
    handlers.get('xlm:win:toggleMaximize')!()
    expect(win.unmaximize).toHaveBeenCalledOnce()
    expect(win.maximize).not.toHaveBeenCalled()
  })

  it('isMaximized handler returns the window state', () => {
    const win = fakeWin()
    win.isMaximized.mockReturnValue(true)
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => win })
    expect(handlers.get('xlm:win:isMaximized')!()).toBe(true)
  })

  it('is a no-op when there is no window', () => {
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => null })
    expect(() => handlers.get('xlm:win:minimize')!()).not.toThrow()
    expect(handlers.get('xlm:win:isMaximized')!()).toBe(false)
  })

  it('treats a destroyed window as no window', () => {
    const win = fakeWin()
    win.isDestroyed.mockReturnValue(true)
    const { handlers, handle } = collectHandlers()
    registerWindowControls({ handle, getWindow: () => win })
    handlers.get('xlm:win:minimize')!()
    expect(win.minimize).not.toHaveBeenCalled()
  })
})

describe('wireMaximizeEvents', () => {
  it('forwards maximize/unmaximize as maximize-changed with current state', () => {
    const listeners: Record<string, () => void> = {}
    const send = vi.fn()
    const win = {
      on: (e: 'maximize' | 'unmaximize', cb: () => void) => { listeners[e] = cb },
      off: vi.fn(),
      isMaximized: vi.fn(() => true),
      isDestroyed: () => false,
      webContents: { send },
    }
    wireMaximizeEvents(win)
    listeners['maximize']()
    expect(send).toHaveBeenCalledWith('xlm:win:maximize-changed', true)
    win.isMaximized.mockReturnValue(false)
    listeners['unmaximize']()
    expect(send).toHaveBeenCalledWith('xlm:win:maximize-changed', false)
  })

  it('returns an unsubscribe that removes both listeners', () => {
    const off = vi.fn()
    const win = {
      on: vi.fn(),
      off,
      isMaximized: () => false,
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }
    const unsub = wireMaximizeEvents(win)
    unsub()
    expect(off).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:electron`
Expected: FAIL — `Cannot find module '../window-controls'` (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `electron/main/window-controls.ts`:

```ts
/**
 * Window-control IPC logic for the frameless title bar.
 *
 * Dependency-injected (no top-level `electron` use) so it unit-tests without
 * the Electron runtime — same pattern as `protocol.ts`. `electron/main/index.ts`
 * wires the real `ipcMain` / `BrowserWindow` in.
 */

/** Window subset the control handlers act on. */
export interface ControllableWindow {
  minimize(): void
  maximize(): void
  unmaximize(): void
  close(): void
  isMaximized(): boolean
  isDestroyed(): boolean
}

export interface WindowControlDeps {
  /** Register an IPC handler (wraps `ipcMain.handle`). */
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void
  /** Resolve the window controls should act on, or null when none. */
  getWindow: () => ControllableWindow | null
}

export function registerWindowControls(deps: WindowControlDeps): void {
  const target = (): ControllableWindow | null => {
    const win = deps.getWindow()
    return win && !win.isDestroyed() ? win : null
  }
  deps.handle('xlm:win:minimize', () => { target()?.minimize() })
  deps.handle('xlm:win:toggleMaximize', () => {
    const win = target()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  deps.handle('xlm:win:close', () => { target()?.close() })
  deps.handle('xlm:win:isMaximized', () => target()?.isMaximized() ?? false)
}

/** Window subset needed to forward maximize-state changes to the renderer. */
export interface MaximizableWindow {
  on(event: 'maximize' | 'unmaximize', listener: () => void): void
  off(event: 'maximize' | 'unmaximize', listener: () => void): void
  isMaximized(): boolean
  isDestroyed(): boolean
  webContents: { send(channel: string, ...args: unknown[]): void }
}

/**
 * Forward native maximize/unmaximize to the renderer as `xlm:win:maximize-changed`.
 * Returns an unsubscribe to call on window close.
 */
export function wireMaximizeEvents(win: MaximizableWindow): () => void {
  const send = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send('xlm:win:maximize-changed', win.isMaximized())
    }
  }
  win.on('maximize', send)
  win.on('unmaximize', send)
  return () => {
    win.off('maximize', send)
    win.off('unmaximize', send)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:electron`
Expected: PASS — all `window-controls` tests green; existing electron tests still green.

- [ ] **Step 5: Commit**

```bash
git add electron/main/window-controls.ts electron/main/__tests__/window-controls.test.ts
git commit -m "feat(window): dependency-injected window-control IPC module"
```

---

### Task 2: Frameless window + wire controls into the main process

Make the window frameless, kill the white flash, and wire the Task 1 module into `createWindow` / `whenReady`.

**Files:**
- Modify: `electron/main/index.ts` (window options `22-35`; `whenReady` IPC registration near `56-67`; `createWindow` event wiring near `36-41`)

**Interfaces:**
- Consumes: `registerWindowControls`, `wireMaximizeEvents` from Task 1.
- Produces: a frameless window whose controls respond to the `xlm:win:*` IPC channels and which emits `xlm:win:maximize-changed`.

- [ ] **Step 1: Add the import**

In `electron/main/index.ts`, add near the other local imports (after the existing `import` block at the top):

```ts
import { registerWindowControls, wireMaximizeEvents } from './window-controls'
```

- [ ] **Step 2: Make the window frameless and flash-free**

Replace the `new BrowserWindow({ ... })` options block (currently lines 23-35) with:

```ts
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 880,
    minHeight: 600,
    resizable: true,
    frame: false,
    backgroundColor: '#18181b',
    show: !isSmoke,
    title: 'Xenia Manager for Linux',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
```

- [ ] **Step 3: Forward maximize events from createWindow**

In `createWindow`, immediately after the existing `win.on('closed', unsubCrash)` line (currently line 41), add:

```ts
  const unsubMax = wireMaximizeEvents(win)
  win.on('closed', unsubMax)
```

- [ ] **Step 4: Register the window-control IPC handlers**

In the `app.whenReady().then(async () => { ... })` body, after the existing `ipcMain.handle('xlm:openDialog', ...)` block (ends line 65), add:

```ts
  registerWindowControls({
    handle: (channel, fn) => ipcMain.handle(channel, fn),
    getWindow: () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
  })
```

- [ ] **Step 5: Type-check and run the electron suite**

Run: `npx tsc -b`
Expected: PASS — no type errors. (`BrowserWindow` structurally satisfies `ControllableWindow`/`MaximizableWindow`; if `tsc` rejects the `on`/`off` overloads, change the two call sites to `wireMaximizeEvents(win as unknown as MaximizableWindow)` and import the `MaximizableWindow` type — but try without the cast first.)

Run: `npm run test:electron`
Expected: PASS — existing electron tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat(window): frameless window, flash-free bg, wire window controls"
```

---

### Task 3: Expose the window-control surface from preload

Add a `win` namespace to the `window.xlm` contextBridge surface and its preload-side type.

**Files:**
- Modify: `electron/preload/index.ts`
- Modify: `electron/preload/xlm.d.ts`

**Interfaces:**
- Consumes: the `xlm:win:*` channels and `xlm:win:maximize-changed` event from Task 2.
- Produces: `window.xlm.win` with `minimize()/toggleMaximize()/close()/isMaximized()/onMaximizeChange(cb)`.

- [ ] **Step 1: Add the `win` namespace to the bridge**

In `electron/preload/index.ts`, add a `win` property inside the `contextBridge.exposeInMainWorld('xlm', { ... })` object (after the `convertFileSrc` line, keeping the trailing comma valid):

```ts
  win: {
    minimize: () => ipcRenderer.invoke('xlm:win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('xlm:win:toggleMaximize'),
    close: () => ipcRenderer.invoke('xlm:win:close'),
    isMaximized: () => ipcRenderer.invoke('xlm:win:isMaximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const listener = (_e: unknown, maximized: boolean) => cb(maximized)
      ipcRenderer.on('xlm:win:maximize-changed', listener)
      return () => ipcRenderer.removeListener('xlm:win:maximize-changed', listener)
    },
  },
```

- [ ] **Step 2: Extend the preload type**

Replace the contents of `electron/preload/xlm.d.ts` with:

```ts
export interface WinControls {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizeChange(cb: (maximized: boolean) => void): () => void
}

export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>
  on(event: string, cb: (payload: unknown) => void): () => void
  convertFileSrc(path: string): string
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>
  win: WinControls
}
declare global { interface Window { xlm: XlmBridge } }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add electron/preload/index.ts electron/preload/xlm.d.ts
git commit -m "feat(window): expose window controls on the preload bridge"
```

---

### Task 4: Window-control functions on the renderer bridge

Add the renderer-side seam: feature-detect + thin wrappers over `window.xlm.win`, with safe no-ops when controls are absent (browser/themed preview).

**Files:**
- Modify: `src/platform/bridge.ts`
- Test: `src/platform/bridge.test.ts`

**Interfaces:**
- Consumes: `window.xlm.win` from Task 3.
- Produces (named exports from `src/platform/bridge.ts`):
  - `hasWindowControls(): boolean`
  - `windowMinimize(): Promise<void>`
  - `windowToggleMaximize(): Promise<void>`
  - `windowClose(): Promise<void>`
  - `windowIsMaximized(): Promise<boolean>`
  - `onWindowMaximizeChange(cb: (maximized: boolean) => void): () => void`

- [ ] **Step 1: Write the failing test**

Create `src/platform/bridge.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hasWindowControls,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
  onWindowMaximizeChange,
} from "./bridge";

const realXlm = window.xlm;
afterEach(() => {
  (window as unknown as { xlm: unknown }).xlm = realXlm;
});

function withWin(win: unknown) {
  (window as unknown as { xlm: unknown }).xlm = { ...window.xlm, win };
}

describe("window control bridge", () => {
  it("hasWindowControls reflects presence of the win surface", () => {
    withWin(undefined);
    expect(hasWindowControls()).toBe(false);
    withWin({ minimize: vi.fn() });
    expect(hasWindowControls()).toBe(true);
  });

  it("delegates actions to the host", async () => {
    const win = {
      minimize: vi.fn(() => Promise.resolve()),
      toggleMaximize: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      isMaximized: vi.fn(() => Promise.resolve(true)),
      onMaximizeChange: vi.fn(() => () => {}),
    };
    withWin(win);
    await windowMinimize();
    expect(win.minimize).toHaveBeenCalledOnce();
    await windowToggleMaximize();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    await windowClose();
    expect(win.close).toHaveBeenCalledOnce();
    expect(await windowIsMaximized()).toBe(true);
  });

  it("subscribes via onMaximizeChange and returns its unsubscribe", () => {
    const unsub = vi.fn();
    const win = { onMaximizeChange: vi.fn(() => unsub) };
    withWin(win);
    const cb = vi.fn();
    const ret = onWindowMaximizeChange(cb);
    expect(win.onMaximizeChange).toHaveBeenCalledWith(cb);
    ret();
    expect(unsub).toHaveBeenCalledOnce();
  });

  it("no-ops safely when controls are unavailable", async () => {
    withWin(undefined);
    await expect(windowMinimize()).resolves.toBeUndefined();
    expect(await windowIsMaximized()).toBe(false);
    expect(() => onWindowMaximizeChange(vi.fn())()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- run src/platform/bridge.test.ts`
Expected: FAIL — exports `hasWindowControls` etc. do not exist.

- [ ] **Step 3: Write the implementation**

In `src/platform/bridge.ts`, add `WinControls` to the type surface and the functions.

First, add the interface and extend `XlmBridge`. Replace the existing `XlmBridge` interface block with:

```ts
/**
 * Window-control surface (frameless custom title bar). Optional: absent in the
 * browser / themed-preview where no Electron host is attached.
 */
export interface WinControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Subscribe to host-driven maximize-state changes; returns an unsubscribe. */
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
}

export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>;
  /** Subscribe to a host event; returns a synchronous unsubscribe. */
  on(event: string, cb: (payload: unknown) => void): () => void;
  convertFileSrc(path: string): string;
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>;
  win?: WinControls;
}
```

Then add these functions at the end of the file:

```ts
/** True when the Electron host exposes window controls (frameless title bar). */
export function hasWindowControls(): boolean {
  return typeof window.xlm?.win !== "undefined";
}

/** Minimize the host window. No-op when window controls are unavailable. */
export function windowMinimize(): Promise<void> {
  return window.xlm.win?.minimize() ?? Promise.resolve();
}

/** Toggle maximize/restore on the host window. No-op when unavailable. */
export function windowToggleMaximize(): Promise<void> {
  return window.xlm.win?.toggleMaximize() ?? Promise.resolve();
}

/** Close the host window. No-op when unavailable. */
export function windowClose(): Promise<void> {
  return window.xlm.win?.close() ?? Promise.resolve();
}

/** Current maximized state; false when controls are unavailable. */
export function windowIsMaximized(): Promise<boolean> {
  return window.xlm.win?.isMaximized() ?? Promise.resolve(false);
}

/**
 * Subscribe to maximize-state changes; returns a synchronous unsubscribe.
 * Returns a no-op unsubscribe when controls are unavailable.
 */
export function onWindowMaximizeChange(
  cb: (maximized: boolean) => void,
): () => void {
  return window.xlm.win?.onMaximizeChange(cb) ?? (() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- run src/platform/bridge.test.ts`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add src/platform/bridge.ts src/platform/bridge.test.ts
git commit -m "feat(window): renderer bridge window-control functions with feature-detect"
```

---

### Task 5: TitleBar component + styles

The themed, draggable title bar with min/max/close controls.

**Files:**
- Create: `src/components/app-shell/TitleBar.tsx`
- Create: `src/components/app-shell/TitleBar.css`
- Test: `src/components/app-shell/TitleBar.test.tsx`

**Interfaces:**
- Consumes: `hasWindowControls`, `windowMinimize`, `windowToggleMaximize`, `windowClose`, `windowIsMaximized`, `onWindowMaximizeChange` from Task 4.
- Produces: `<TitleBar />` (default-less named export `TitleBar`), rendering a `<header aria-label="Window title bar">`.

- [ ] **Step 1: Write the failing test**

Create `src/components/app-shell/TitleBar.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  maxCb: null as ((m: boolean) => void) | null,
}));

vi.mock("../../platform/bridge", () => ({
  hasWindowControls: vi.fn(() => true),
  windowMinimize: vi.fn(() => Promise.resolve()),
  windowToggleMaximize: vi.fn(() => Promise.resolve()),
  windowClose: vi.fn(() => Promise.resolve()),
  windowIsMaximized: vi.fn(() => Promise.resolve(false)),
  onWindowMaximizeChange: vi.fn((cb: (m: boolean) => void) => {
    h.maxCb = cb;
    return () => {};
  }),
}));

import * as bridge from "../../platform/bridge";
import { TitleBar } from "./TitleBar";

beforeEach(() => {
  vi.clearAllMocks();
  h.maxCb = null;
  (bridge.hasWindowControls as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (bridge.windowIsMaximized as ReturnType<typeof vi.fn>).mockResolvedValue(false);
});

describe("TitleBar", () => {
  it("renders the window title", () => {
    render(<TitleBar />);
    expect(screen.getByText("Xenia Manager for Linux")).toBeInTheDocument();
  });

  it("wires minimize, maximize, and close buttons to the bridge", () => {
    render(<TitleBar />);
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(bridge.windowMinimize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /maximize/i }));
    expect(bridge.windowToggleMaximize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(bridge.windowClose).toHaveBeenCalledOnce();
  });

  it("swaps to a restore control when the window becomes maximized", async () => {
    render(<TitleBar />);
    expect(screen.getByRole("button", { name: /maximize/i })).toBeInTheDocument();
    await act(async () => {
      h.maxCb?.(true);
    });
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
  });

  it("double-clicking the drag region toggles maximize", () => {
    render(<TitleBar />);
    fireEvent.doubleClick(screen.getByTestId("titlebar-drag"));
    expect(bridge.windowToggleMaximize).toHaveBeenCalledOnce();
  });

  it("hides the controls when the host has no window controls", () => {
    (bridge.hasWindowControls as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<TitleBar />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.getByText("Xenia Manager for Linux")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- run src/components/app-shell/TitleBar.test.tsx`
Expected: FAIL — `Cannot find module './TitleBar'`.

- [ ] **Step 3: Write the component**

Create `src/components/app-shell/TitleBar.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import {
  hasWindowControls,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
  onWindowMaximizeChange,
} from "../../platform/bridge";
import "./TitleBar.css";

export function TitleBar() {
  const controls = hasWindowControls();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return;
    let active = true;
    void windowIsMaximized().then((m) => {
      if (active) setMaximized(m);
    });
    const unsub = onWindowMaximizeChange((m) => setMaximized(m));
    return () => {
      active = false;
      unsub();
    };
  }, [controls]);

  return (
    <header className="titlebar" aria-label="Window title bar">
      <div
        className="titlebar__drag"
        data-testid="titlebar-drag"
        onDoubleClick={() => {
          if (controls) void windowToggleMaximize();
        }}
      >
        <span className="titlebar__title">Xenia Manager for Linux</span>
      </div>
      {controls && (
        <div className="titlebar__controls">
          <button
            type="button"
            className="titlebar__btn"
            aria-label="Minimize"
            onClick={() => void windowMinimize()}
          >
            <Minus size={16} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="titlebar__btn"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => void windowToggleMaximize()}
          >
            {maximized ? (
              <Copy size={14} strokeWidth={2} aria-hidden />
            ) : (
              <Square size={14} strokeWidth={2} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="titlebar__btn titlebar__btn--close"
            aria-label="Close"
            onClick={() => void windowClose()}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </header>
  );
}
```

Create `src/components/app-shell/TitleBar.css`:

```css
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  flex-shrink: 0;
  background: var(--color-bg-sidebar);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  user-select: none;
}

.titlebar__drag {
  display: flex;
  align-items: center;
  height: 100%;
  flex: 1;
  min-width: 0;
  padding-left: 14px;
}

.titlebar__title {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar__controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.titlebar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--transition-fast) var(--ease-out),
    color var(--transition-fast) var(--ease-out);
}

.titlebar__btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.titlebar__btn--close:hover {
  background: #c0392b;
  color: #fff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- run src/components/app-shell/TitleBar.test.tsx`
Expected: PASS — all five cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-shell/TitleBar.tsx src/components/app-shell/TitleBar.css src/components/app-shell/TitleBar.test.tsx
git commit -m "feat(window): themed TitleBar with drag region and window controls"
```

---

### Task 6: Integrate TitleBar into AppShell (column layout)

Place the title bar above the sidebar+content row and update the shell's layout + existing test.

**Files:**
- Modify: `src/components/app-shell/AppShell.tsx`
- Modify: `src/components/app-shell/AppShell.css`
- Modify: `src/components/app-shell/AppShell.test.tsx`

**Interfaces:**
- Consumes: `<TitleBar />` from Task 5.
- Produces: AppShell renders `TitleBar` above `.app-shell__body` (Sidebar + content).

- [ ] **Step 1: Update the existing test (extend bridge mock + add assertion)**

In `src/components/app-shell/AppShell.test.tsx`, replace the `vi.mock("../../platform/bridge", ...)` block with one that also exports the window-control functions (TitleBar imports them; without these the mocked module returns `undefined` for each and the call throws):

```tsx
vi.mock("../../platform/bridge", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("sidecar unavailable")),
  listen: vi.fn(async () => () => {}),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  open: vi.fn(async () => null),
  hasWindowControls: () => false,
  windowMinimize: vi.fn(() => Promise.resolve()),
  windowToggleMaximize: vi.fn(() => Promise.resolve()),
  windowClose: vi.fn(() => Promise.resolve()),
  windowIsMaximized: vi.fn(() => Promise.resolve(false)),
  onWindowMaximizeChange: vi.fn(() => () => {}),
}));
```

Then add a new test inside the `describe("AppShell", ...)` block:

```tsx
  it("renders the window title bar", () => {
    renderWithRouter(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(
      screen.getByLabelText(/window title bar/i),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- run src/components/app-shell/AppShell.test.tsx`
Expected: FAIL — the new "renders the window title bar" case fails (AppShell does not render TitleBar yet). Other cases still pass.

- [ ] **Step 3: Update AppShell to render TitleBar**

Replace the contents of `src/components/app-shell/AppShell.tsx` with:

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import "./AppShell.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-shell__body">
        <Sidebar />
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update AppShell layout CSS**

Replace the contents of `src/components/app-shell/AppShell.css` with:

```css
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.app-shell__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.app-shell__content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
  background-color: var(--color-bg-primary);
}

.app-shell__content > * {
  width: 100%;
  min-width: 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- run src/components/app-shell/AppShell.test.tsx`
Expected: PASS — all cases including "renders the window title bar".

- [ ] **Step 6: Commit**

```bash
git add src/components/app-shell/AppShell.tsx src/components/app-shell/AppShell.css src/components/app-shell/AppShell.test.tsx
git commit -m "feat(window): mount TitleBar in AppShell with column layout"
```

---

### Task 7: Full verification + manual KDE check

Confirm the whole suite and build are green, then verify behavior in the real window on KDE/KWin. This task has no code unless the edge-resize fallback is needed.

**Files:**
- (Conditional) Modify: `src/components/app-shell/TitleBar.tsx` + `TitleBar.css` — only if Step 3 finds frameless edge-resize broken.

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Run the full automated gate**

Run: `npm test -- run`
Expected: PASS — full renderer suite green.

Run: `npm run test:electron`
Expected: PASS — electron suite green.

Run: `npm run build`
Expected: PASS — `tsc -b` + `electron-vite build` succeed with no type errors.

- [ ] **Step 2: Launch the real app (user / graphical session)**

This requires a display and the Rust sidecar. From a KDE session terminal:

Run: `npm run build:sidecar` (only if `core/target/release/xlm-core` is missing)
Run: `npm run dev`
Expected: the window opens with NO white flash; a dark 38px title bar spans the top with the muted title "Xenia Manager for Linux" on the left and minimize/maximize/close on the right.

- [ ] **Step 3: Verify behaviors (manual checklist)**

Confirm each:
- Drag the title bar → window moves.
- Drag the window to a screen edge → KDE snap/tiling triggers.
- Double-click the title bar → toggles maximize/restore; the maximize icon swaps to the restore icon when maximized.
- Click minimize → window minimizes.
- Click maximize, then restore → works; icon swaps both ways.
- Maximize via KDE shortcut (e.g. Meta+Up) → the title bar icon still updates to restore (event-driven).
- Drag a window edge/corner → window resizes.
- Click close → window closes, app exits cleanly.

- [ ] **Step 4: (Conditional) Add CSS resize handles if edge-resize fails**

Only if Step 3 found that dragging window edges does NOT resize under KWin. Add thin `no-drag` resize zones. In `TitleBar` is the wrong place (it only covers the top); instead add the handles in `AppShell`. Append to `src/components/app-shell/AppShell.css`:

```css
.app-shell__resize {
  position: fixed;
  z-index: var(--z-tooltip);
  -webkit-app-region: no-drag;
}
.app-shell__resize--n { top: 0; left: 0; right: 0; height: 4px; cursor: ns-resize; }
.app-shell__resize--s { bottom: 0; left: 0; right: 0; height: 4px; cursor: ns-resize; }
.app-shell__resize--e { top: 0; right: 0; bottom: 0; width: 4px; cursor: ew-resize; }
.app-shell__resize--w { top: 0; left: 0; bottom: 0; width: 4px; cursor: ew-resize; }
```

And the handles in `src/components/app-shell/AppShell.tsx`, just inside the `.app-shell` div before `<TitleBar />`:

```tsx
      <div className="app-shell__resize app-shell__resize--n" />
      <div className="app-shell__resize app-shell__resize--s" />
      <div className="app-shell__resize app-shell__resize--e" />
      <div className="app-shell__resize app-shell__resize--w" />
```

Note: these zones rely on the platform's frameless edge-resize hit-testing; if KWin needs an explicit resize call instead, escalate — that needs a `win.setResizable`/native-move IPC addition out of this plan's scope. Then re-run Step 1 and commit:

```bash
git add src/components/app-shell/AppShell.tsx src/components/app-shell/AppShell.css
git commit -m "fix(window): CSS edge-resize handles for frameless window on KWin"
```

- [ ] **Step 5: Final commit (if no code changes in this task)**

If Step 4 was skipped, there is nothing to commit — the feature is complete. Otherwise the commit from Step 4 closes it out.

---

## Self-Review

**Spec coverage:**
- Frameless + `backgroundColor` flash fix → Task 2. ✓
- Window-control IPC (minimize/toggleMaximize/close/isMaximized) → Task 1 (logic) + Task 2 (wiring). ✓
- Maximize-state forwarding to renderer → Task 1 (`wireMaximizeEvents`) + Task 2 (wiring) + Task 3 (`onMaximizeChange`) + Task 5 (icon swap). ✓
- Preload `win` namespace + types → Task 3. ✓
- Renderer bridge functions + feature-detect → Task 4. ✓
- TitleBar component (drag, controls right, KDE order, lucide icons, close-red, double-click, muted title, no brand dup) → Task 5. ✓
- Graceful degrade when bridge absent → Task 4 (no-ops) + Task 5 (controls hidden) + verified in tests. ✓
- AppShell column layout integration → Task 6. ✓
- Testing (TitleBar unit, electron IPC, manual KDE) → Tasks 1, 4, 5, 6, 7. ✓
- Risk: frameless edge-resize fallback → Task 7 Step 4. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content; commands have expected output. ✓

**Type consistency:** Channel names (`xlm:win:minimize/toggleMaximize/close/isMaximized`, `xlm:win:maximize-changed`) identical across Tasks 1-3. `WinControls`/`win` shape identical in preload `xlm.d.ts` (Task 3) and renderer `bridge.ts` (Task 4). Bridge export names (`hasWindowControls`, `windowMinimize`, `windowToggleMaximize`, `windowClose`, `windowIsMaximized`, `onWindowMaximizeChange`) consumed identically by TitleBar (Task 5) and mocked identically in AppShell.test (Task 6). ✓
