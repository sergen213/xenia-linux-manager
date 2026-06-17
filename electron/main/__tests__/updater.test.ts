import { describe, it, expect, vi } from 'vitest'

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    on: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(() => { throw new Error('no feed') })
  }
}))
vi.mock('electron-log', () => ({ default: { transports: { file: { level: '' } } } }))

import { initUpdater } from '../updater'

describe('initUpdater', () => {
  it('never throws even when the updater errors', () => {
    expect(() => initUpdater()).not.toThrow()
  })
})
