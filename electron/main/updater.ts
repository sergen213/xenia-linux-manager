import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

/** Check for app updates on launch. Graceful-inert until a feed exists (Phase 4). */
export function initUpdater(): void {
  try {
    autoUpdater.logger = log
    log.transports.file.level = 'info'
    autoUpdater.on('error', (err) => log.warn?.('[updater] error (expected until a feed is published):', err?.message))
    autoUpdater.on('update-not-available', () => log.info?.('[updater] no update available'))
    autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn?.('[updater] check failed:', e?.message))
  } catch (e) {
    log.warn?.('[updater] init failed:', (e as Error)?.message)
  }
}
