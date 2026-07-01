import { app, ipcMain, type BrowserWindow } from 'electron'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

/** Live update state pushed to the renderer over `xlm:update:status`. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

// Last status so a component mounting after an event fired (e.g. the Settings
// card opened after the 8s auto-check) can sync via `xlm:update:getStatus`.
let lastStatus: UpdateStatus = { state: 'idle' }

function emit(win: BrowserWindow, status: UpdateStatus): void {
  lastStatus = status
  if (!win.isDestroyed()) win.webContents.send('xlm:update:status', status)
}

/**
 * Wire the in-app auto-updater. Packaged builds only — in dev there is no feed,
 * so an update check just fires a useless GitHub request at boot that competes
 * with the renderer's network init (a frequent network-service crash trigger).
 *
 * Updates auto-download and install on next quit; the renderer surfaces a
 * "Restart & update" banner as soon as one is downloaded, plus a manual
 * "Check for updates" control in Settings.
 */
export function initUpdater(win: BrowserWindow): void {
  ipcMain.handle('xlm:update:getStatus', () => lastStatus)
  ipcMain.handle('xlm:update:install', () => autoUpdater.quitAndInstall())

  if (!app.isPackaged) {
    // Answer the manual check so the UI never hangs waiting on a handler.
    ipcMain.handle('xlm:update:check', () =>
      emit(win, { state: 'error', message: 'Updates are only available in packaged builds' }),
    )
    return
  }

  try {
    autoUpdater.logger = log
    log.transports.file.level = 'info'

    autoUpdater.on('checking-for-update', () => emit(win, { state: 'checking' }))
    autoUpdater.on('update-available', (i: UpdateInfo) => emit(win, { state: 'available', version: i.version }))
    autoUpdater.on('update-not-available', () => emit(win, { state: 'not-available' }))
    autoUpdater.on('download-progress', (p: ProgressInfo) => emit(win, { state: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i: UpdateInfo) => emit(win, { state: 'downloaded', version: i.version }))
    autoUpdater.on('error', (err: Error) => {
      log.warn?.('[updater] error:', err?.message)
      emit(win, { state: 'error', message: err?.message ?? 'update failed' })
    })

    // Manual "Check for updates" — autoDownload (on by default) grabs it, then
    // update-downloaded drives the banner.
    ipcMain.handle('xlm:update:check', () =>
      autoUpdater.checkForUpdates().catch((e) => log.warn?.('[updater] manual check failed:', e?.message)),
    )

    // Defer the automatic check off the launch critical path so it never races
    // first paint.
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => log.warn?.('[updater] check failed:', e?.message))
    }, 8000)
  } catch (e) {
    log.warn?.('[updater] init failed:', (e as Error)?.message)
  }
}
