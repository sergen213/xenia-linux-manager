import { describe, it, expect, vi, beforeEach } from 'vitest'

const { isPackaged, checkForUpdates } = vi.hoisted(() => ({
  isPackaged: { value: false },
  checkForUpdates: vi.fn(() => Promise.reject(new Error('no feed'))),
}))

vi.mock('electron', () => ({
  app: { get isPackaged() { return isPackaged.value } },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('electron-updater', () => ({
  autoUpdater: { logger: null, on: vi.fn(), checkForUpdates, quitAndInstall: vi.fn() },
}))
vi.mock('electron-log', () => ({ default: { transports: { file: { level: '' } } } }))

import { initUpdater } from '../updater'

const fakeWin = () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }) as never

describe('initUpdater', () => {
  beforeEach(() => {
    checkForUpdates.mockClear()
    vi.useRealTimers()
  })

  it('skips the update check in dev (unpackaged) — no boot-time network', () => {
    isPackaged.value = false
    initUpdater(fakeWin())
    expect(checkForUpdates).not.toHaveBeenCalled()
  })

  it('defers the check when packaged and never throws', () => {
    vi.useFakeTimers()
    isPackaged.value = true
    expect(() => initUpdater(fakeWin())).not.toThrow()
    expect(checkForUpdates).not.toHaveBeenCalled() // off the launch path
    vi.advanceTimersByTime(8000)
    expect(checkForUpdates).toHaveBeenCalledOnce()
  })
})
