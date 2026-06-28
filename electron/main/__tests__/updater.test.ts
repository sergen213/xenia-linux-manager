import { describe, it, expect, vi, beforeEach } from 'vitest'

const { isPackaged, checkForUpdatesAndNotify } = vi.hoisted(() => ({
  isPackaged: { value: false },
  checkForUpdatesAndNotify: vi.fn(() => Promise.reject(new Error('no feed'))),
}))

vi.mock('electron', () => ({ app: { get isPackaged() { return isPackaged.value } } }))
vi.mock('electron-updater', () => ({
  autoUpdater: { logger: null, on: vi.fn(), checkForUpdatesAndNotify },
}))
vi.mock('electron-log', () => ({ default: { transports: { file: { level: '' } } } }))

import { initUpdater } from '../updater'

describe('initUpdater', () => {
  beforeEach(() => {
    checkForUpdatesAndNotify.mockClear()
    vi.useRealTimers()
  })

  it('skips the update check in dev (unpackaged) — no boot-time network', () => {
    isPackaged.value = false
    initUpdater()
    expect(checkForUpdatesAndNotify).not.toHaveBeenCalled()
  })

  it('defers the check when packaged and never throws', () => {
    vi.useFakeTimers()
    isPackaged.value = true
    expect(() => initUpdater()).not.toThrow()
    expect(checkForUpdatesAndNotify).not.toHaveBeenCalled() // off the launch path
    vi.advanceTimersByTime(8000)
    expect(checkForUpdatesAndNotify).toHaveBeenCalledOnce()
  })
})
