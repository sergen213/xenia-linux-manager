// Minimal import-safe `electron` stub for the node-env vitest project.
//
// The real `electron` module only exists inside the Electron runtime. The
// electron/** unit tests exercise pure logic (e.g. protocol path validation)
// and import main-process modules that do a top-level `import … from 'electron'`.
// Aliasing `electron` to this stub keeps those imports from throwing under
// plain Node so the tests can run. Only import-safety is required here — no
// behavior; tests that need behavior use `vi.mock`/`vi.fn` explicitly.
const noop = (): void => {}

export const protocol = {
  registerSchemesAsPrivileged: noop,
  handle: noop,
}

export const net = {
  fetch: async (): Promise<unknown> => ({ ok: true }),
}

export const app = {
  whenReady: (): Promise<void> => Promise.resolve(),
  on: noop,
  quit: noop,
  exit: noop,
  isPackaged: false,
}

export class BrowserWindow {}

export const dialog = {
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
    canceled: true,
    filePaths: [],
  }),
}

export const ipcMain = { handle: noop }

export default { protocol, net, app, BrowserWindow, dialog, ipcMain }
