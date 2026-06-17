import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { SidecarClient } from './sidecar'
import { resolveSidecarPath } from './paths'
import { runSmoke } from './smoke'

const isSmoke = process.argv.includes('--smoke')
let sidecar: SidecarClient

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

  if (isSmoke) {
    const ok = await runSmoke(sidecar)
    try { await sidecar.stop() } finally { app.exit(ok ? 0 : 1) }
    return
  }

  await sidecar.waitForReady(8000).catch(() => { /* surfaced via crash event */ })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { sidecar?.stop() })
