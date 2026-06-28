import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

/** Check for app updates on launch. Packaged builds only. */
export function initUpdater(): void {
  // In dev there is no update feed, so checkForUpdatesAndNotify() just fires a
  // useless GitHub HTTPS request at boot — wasted work that competes with the
  // renderer's network init (a frequent trigger of the network-service crash).
  if (!app.isPackaged) return
  try {
    autoUpdater.logger = log
    log.transports.file.level = 'info'
    autoUpdater.on('error', (err) => log.warn?.('[updater] error (expected until a feed is published):', err?.message))
    autoUpdater.on('update-not-available', () => log.info?.('[updater] no update available'))
    // Defer off the launch critical path so the check never races first paint.
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn?.('[updater] check failed:', e?.message))
    }, 8000)
  } catch (e) {
    log.warn?.('[updater] init failed:', (e as Error)?.message)
  }
}
