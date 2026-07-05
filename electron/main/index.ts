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

// Every match arm in core/src/rpc.rs dispatch(). Rejecting unknown methods in
// the main process keeps a compromised renderer from probing the sidecar.
const RPC_METHODS = new Set([
  'ping', 'get_default_settings', 'load_settings', 'save_settings', 'validate_paths',
  'list_game_profiles', 'create_game_profile', 'rename_game_profile', 'delete_game_profile',
  'select_active_game_profile', 'get_profile_effective_config', 'save_profile_overrides',
  'apply_recommended_profile', 'load_task_history', 'clear_task_history',
  'get_release_metadata', 'get_updater_readiness', 'get_environment_diagnostics',
  'check_patches_status', 'deploy_game_patches', 'get_game_xenia_patches',
  'toggle_xenia_patch_entry', 'import_xenia_patch_file', 'get_export_preflight',
  'export_save_archive', 'inspect_save_archive', 'get_import_conflict_plan',
  'apply_save_import', 'cleanup_save_import_staging', 'list_save_backups',
  'fetch_latest_release', 'fetch_recent_releases', 'get_install_status',
  'check_for_update_auto', 'clear_install_failure', 'cleanup_install_artifacts',
  'switch_active_xenia_build', 'remove_xenia_install', 'add_library_source',
  'remove_library_source', 'get_all_catalogs', 'browse_library', 'get_library_game_details',
  'create_manual_game', 'update_library_game_identity', 'update_preferred_xenia_build',
  'update_game_launch_environment', 'update_game_launch_wrapper', 'get_launch_preflight',
  'launch_library_game', 'export_game_desktop_shortcut', 'get_shortcut_locations',
  'inspect_game_content', 'import_game_content', 'remove_game_content',
  'fetch_game_artwork', 'fetch_all_artwork', 'refetch_all_artwork', 'fetch_game_synopsis',
  'fetch_game_screenshots', 'detect_steam_install', 'export_game_to_steam',
  'clear_shader_cache', 'export_log_bundle', 'list_directory', 'open_path',
  'start_install', 'start_update', 'retry_last_operation', 'start_source_scan',
  'scan_all_sources', 'get_library_status',
])

// Bulk network/IO methods that legitimately run past the 30s default RPC timeout.
const LONG_RPC = new Set([
  'fetch_all_artwork', 'refetch_all_artwork', 'fetch_game_artwork', 'fetch_game_synopsis',
  'fetch_game_screenshots', 'import_game_content', 'inspect_game_content',
  'scan_all_sources', 'start_source_scan', 'start_install', 'start_update',
  'retry_last_operation', 'export_save_archive', 'apply_save_import',
  'export_game_to_steam', 'export_log_bundle', 'fetch_latest_release',
  'fetch_recent_releases', 'deploy_game_patches', 'import_xenia_patch_file',
  'launch_library_game',
])
const LONG_RPC_TIMEOUT_MS = 10 * 60_000

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

  ipcMain.handle('xlm:invoke', async (_e, method: string, params?: object) => {
    if (!RPC_METHODS.has(method)) throw new Error(`unknown method: ${method}`)
    const result = await sidecar.request(method, params, LONG_RPC.has(method) ? LONG_RPC_TIMEOUT_MS : undefined)
    // Path settings feed the xlm-asset allowlist; pick up changes immediately.
    if (method === 'save_settings') void refreshRoots()
    return result
  })

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
  const win = createWindow()
  // Lazy-load the updater so its electron-updater subtree (semver/js-yaml/
  // fs-extra/lodash) is code-split out of the main chunk and only eval'd after
  // the window exists, not during pre-window bundle load.
  void import('./updater').then((m) => m.initUpdater(win))
  // Expand allowed roots from settings in the background; roots already default
  // to appDataDir(), so this must not gate (or hang) window creation. Re-run on
  // every 'ready' so a boot-time failure or sidecar restart still lands roots.
  void refreshRoots()
  sidecar.on('ready', () => { void refreshRoots() })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { sidecar?.stop() })
