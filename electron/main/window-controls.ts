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
  isFullScreen(): boolean
  setFullScreen(flag: boolean): void
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
    // The window launches in true fullscreen (not maximized), where
    // isMaximized() is false. Without this branch the first click would call
    // maximize() (a no-op from fullscreen) and the user had to click twice to
    // shrink. Exiting fullscreen restores the window's pre-fullscreen bounds.
    if (win.isFullScreen()) win.setFullScreen(false)
    else if (win.isMaximized()) win.unmaximize()
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
