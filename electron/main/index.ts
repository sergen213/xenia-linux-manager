import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { SidecarClient } from './sidecar'
import { resolveSidecarPath, appDataDir } from './paths'
import { runSmoke } from './smoke'
import { registerAssetScheme, handleAssetProtocol } from './protocol'
import { initUpdater } from './updater'

const isSmoke = process.argv.includes('--smoke')
let sidecar: SidecarClient

let allowedRoots: string[] = [appDataDir()]
async function refreshRoots(): Promise<void> {
  try {
    const [settings] = await sidecar.request('load_settings') as [Record<string, string>, unknown]
    allowedRoots = [appDataDir(), settings.app_data_path, settings.library_metadata_path, settings.xenia_path].filter(Boolean)
  } catch { /* keep default root */ }
}

registerAssetScheme()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    resizable: true,
    show: !isSmoke,
    title: 'Xenia Manager for Linux',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const unsubEvents = sidecar.onAny((e) => {
    if (!win.isDestroyed()) win.webContents.send('xlm:event', e)
  })
  win.on('closed', unsubEvents)
  const unsubCrash = sidecar.on('crash', () => { if (!win.isDestroyed()) win.webContents.send('xlm:event', { event: 'sidecar:crash', payload: {} }) })
  win.on('closed', unsubCrash)
  const devCsp = "default-src 'self' 'unsafe-inline' data: blob: ws: http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob: xlm-asset: http://localhost:* http://127.0.0.1:*; connect-src 'self' ws: http://localhost:* http://127.0.0.1:*"
  const prodCsp = "default-src 'self'; img-src 'self' data: xlm-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
  const csp = app.isPackaged ? prodCsp : devCsp
  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(async () => {
  sidecar = new SidecarClient({ binaryPath: resolveSidecarPath(), autoRestart: !isSmoke })
  sidecar.start()

  ipcMain.handle('xlm:invoke', (_e, method: string, params?: object) => sidecar.request(method, params))

  ipcMain.handle('xlm:openDialog', (_e, opts: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts)
  })

  handleAssetProtocol(() => allowedRoots)

  if (isSmoke) {
    const ok = await runSmoke(sidecar)
    try { await sidecar.stop() } finally { app.exit(ok ? 0 : 1) }
    return
  }

  await refreshRoots()
  await sidecar.waitForReady(8000).catch(() => { /* surfaced via crash event */ })
  createWindow()
  if (!isSmoke) initUpdater()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { sidecar?.stop() })
