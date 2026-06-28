import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { join } from 'path'
import { SidecarClient } from './sidecar'
import { resolveSidecarPath, appDataDir } from './paths'
import { runSmoke } from './smoke'
import { registerAssetScheme, handleAssetProtocol } from './protocol'
import { registerWindowControls, wireMaximizeEvents } from './window-controls'
import { zoomForWidth, wireDisplayZoom } from './zoom'

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
    minWidth: 880,
    minHeight: 600,
    resizable: true,
    fullscreen: !isSmoke,
    frame: false,
    backgroundColor: '#06122b',
    show: !isSmoke,
    title: 'Xenia Manager for Linux',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Seed the HiDPI zoom before first paint (fullscreen opens on primary);
      // wireDisplayZoom corrects it per actual display + on monitor moves.
      zoomFactor: zoomForWidth(screen.getPrimaryDisplay().workAreaSize.width)
    }
  })
  const unsubscribers = [
    sidecar.onAny((e) => { if (!win.isDestroyed()) win.webContents.send('xlm:event', e) }),
    sidecar.on('crash', () => { if (!win.isDestroyed()) win.webContents.send('xlm:event', { event: 'sidecar:crash', payload: {} }) }),
    wireMaximizeEvents(win),
    wireDisplayZoom(win),
  ]
  win.on('closed', () => { for (const unsub of unsubscribers) unsub() })
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

  registerWindowControls({
    handle: (channel, fn) => ipcMain.handle(channel, fn),
    getWindow: () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
  })

  handleAssetProtocol(() => allowedRoots)

  if (isSmoke) {
    const ok = await runSmoke(sidecar)
    try { await sidecar.stop() } finally { app.exit(ok ? 0 : 1) }
    return
  }

  // Don't gate the window on the sidecar handshake — the renderer shows its own
  // loading state until settings load, and pre-ready RPC writes buffer on the
  // child's stdin pipe. Creating the window now overlaps the sidecar spawn with
  // the renderer's (much longer) boot instead of serializing before it.
  createWindow()
  // Lazy-load the updater so its electron-updater subtree (semver/js-yaml/
  // fs-extra/lodash) is code-split out of the main chunk and only eval'd after
  // the window exists, not during pre-window bundle load.
  void import('./updater').then((m) => m.initUpdater())
  // Expand allowed roots from settings in the background; roots already default
  // to appDataDir(), so this must not gate (or hang) window creation.
  void refreshRoots()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { sidecar?.stop() })
