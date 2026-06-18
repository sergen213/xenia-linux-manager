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
