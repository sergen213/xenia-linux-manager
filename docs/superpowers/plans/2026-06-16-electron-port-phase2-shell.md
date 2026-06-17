# Electron Port — Phase 2: Electron Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Electron host that spawns the Phase-1 `xlm-core` sidecar, round-trips commands/events between a sandboxed renderer and the sidecar over a `contextBridge`, serves artwork via a path-validated `xlm-asset://` protocol, exposes native dialogs, and scaffolds `electron-updater` — verifiable headlessly.

**Architecture:** electron-vite builds three entry points (`electron/main`, `electron/preload`, and the existing repo-root renderer). The main process owns one `SidecarClient` (Node `child_process` + NDJSON framing) and bridges it to the renderer via `ipcMain.handle('xlm:invoke')` + `webContents.send('xlm:event')`. The preload exposes `window.xlm`. Deterministic verification lives in Node unit tests for `SidecarClient` and the protocol path-validator, plus a `--smoke` Electron run under `xvfb-run`.

**Tech Stack:** Electron, electron-vite, electron-builder, electron-updater, electron-log, TypeScript, vitest, Node `child_process`/`readline`. Consumes the Phase-1 `xlm-core` binary.

## Global Constraints

- Platform: Linux only.
- Renderer / `src/` is NOT modified in this phase (Phase 3 rewires it). Do not touch `@tauri-apps/*` deps.
- No packaging / AppImage / `latest-linux.yml` / binary bundling (Phase 4).
- Wire protocol with the sidecar is fixed by Phase 1: request `{"id","method","params"}` (method snake_case, params camelCase), response `{"kind":"response","id","ok",...}`, event `{"kind":"event","event","payload"}`, one `ready` event at startup. One JSON object per line.
- Renderer reaches the OS ONLY through `window.xlm`. `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`.
- `convertFileSrc(path)` MUST return `xlm-asset://local/${encodeURIComponent(path)}`.
- `xlm-asset://` MUST reject any path not inside an allowed root (canonicalize + prefix check) with HTTP 403.
- Sidecar binary path: dev → first existing of `src-tauri/target/release/xlm-core`, `src-tauri/target/debug/xlm-core`; prod → `path.join(process.resourcesPath,'xlm-core')`.
- `electron-updater` must be graceful-inert: wrapped in try/catch + `on('error')`; never blocks the window or crashes when no feed exists.
- Commit after every task. The `xlm-core` binary must be built (`cd src-tauri && cargo build --bin xlm-core`) before running Tasks 2+ tests.

## File Structure

- Create `electron/main/index.ts` — app lifecycle, window, CSP, protocol registration, sidecar ownership, ipc handlers, event piping, updater, `--smoke`.
- Create `electron/main/sidecar.ts` — `SidecarClient` (spawn, NDJSON framing, request/response, ready, events, restart).
- Create `electron/main/paths.ts` — resolve the `xlm-core` binary path + the app-data dir.
- Create `electron/main/protocol.ts` — `xlm-asset://` handler + the pure `isPathAllowed` validator.
- Create `electron/main/updater.ts` — `initUpdater()` (graceful electron-updater).
- Create `electron/main/smoke.ts` — `runSmoke()` headless self-check.
- Create `electron/preload/index.ts` — `contextBridge` → `window.xlm`.
- Create `electron/preload/xlm.d.ts` — `window.xlm` type (consumed by Phase 3 renderer).
- Create `electron/main/__tests__/sidecar.test.ts`, `electron/main/__tests__/protocol.test.ts`, `electron/main/__tests__/updater.test.ts`.
- Create `electron.vite.config.ts` — three builds.
- Create `vitest.electron.config.ts` — Node-environment vitest project for `electron/**` tests.
- Modify `package.json` — deps + scripts.

---

### Task 1: Scaffold — deps, electron-vite config, minimal bootable main

**Files:**
- Modify: `package.json`
- Create: `electron.vite.config.ts`
- Create: `electron/main/index.ts` (minimal)
- Create: `electron/preload/index.ts` (stub)
- Create: `electron/tsconfig.json`

**Interfaces:**
- Produces: `electron-vite build` output in `out/{main,preload,renderer}`; npm scripts `electron:dev`, `electron:build`, `electron:preview`.

- [ ] **Step 1: Add dependencies**

Run (from repo root):

```bash
npm install --save-dev electron@^33 electron-vite@^2 electron-builder@^25 vitest@^3 && npm install electron-updater@^6 electron-log@^5
```

- [ ] **Step 2: Add scripts to package.json**

In `package.json` `"scripts"`, add:

```json
"electron:dev": "electron-vite dev",
"electron:build": "electron-vite build",
"electron:preview": "electron-vite preview",
"smoke": "xvfb-run -a electron-vite preview -- --smoke",
"test:electron": "vitest run --config vitest.electron.config.ts"
```

- [ ] **Step 3: Create electron/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "electron"],
    "noEmit": true
  },
  "include": ["."]
}
```

- [ ] **Step 4: Create electron.vite.config.ts**

```ts
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main/index.ts') } }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'electron/preload/index.ts') } }
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve(__dirname, 'index.html') } }
    }
  }
})
```

- [ ] **Step 5: Create the minimal preload stub**

`electron/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('xlm', {
  // filled in Task 3+
})
```

- [ ] **Step 6: Create the minimal main**

`electron/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    resizable: true,
    title: 'Xenia Manager for Linux',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
```

- [ ] **Step 7: Verify the build**

Run: `npx electron-vite build`
Expected: completes with no errors; `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` exist.

Run: `ls out/main/index.js out/preload/index.js out/renderer/index.html`
Expected: all three listed.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts electron/
git commit -m "feat(electron): scaffold electron-vite build + minimal bootable main/preload"
```

---

### Task 2: SidecarClient + Node unit tests

**Files:**
- Create: `electron/main/paths.ts`
- Create: `electron/main/sidecar.ts`
- Create: `electron/main/__tests__/sidecar.test.ts`
- Create: `vitest.electron.config.ts`

**Interfaces:**
- Produces: `resolveSidecarPath(): string`, `appDataDir(): string` (paths.ts); `class SidecarClient` with `start()`, `waitForReady(timeoutMs?)`, `request(method, params?)`, `on(event, cb)`, `onAny(cb)`, `stop()` (sidecar.ts).
- Consumes: the `xlm-core` binary from Phase 1.

- [ ] **Step 1: Create vitest.electron.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/__tests__/**/*.test.ts'],
    testTimeout: 15000
  }
})
```

- [ ] **Step 2: Create paths.ts**

```ts
import { app } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** Resolve the xlm-core sidecar binary: dev = cargo target, prod = resources. */
export function resolveSidecarPath(): string {
  // In packaged builds the binary is bundled under resources (Phase 4).
  if (process.resourcesPath) {
    const packaged = join(process.resourcesPath, 'xlm-core')
    if (existsSync(packaged)) return packaged
  }
  const repoRoot = join(__dirname, '..', '..') // out/main -> repo root
  const release = join(repoRoot, 'src-tauri', 'target', 'release', 'xlm-core')
  const debug = join(repoRoot, 'src-tauri', 'target', 'debug', 'xlm-core')
  if (existsSync(release)) return release
  if (existsSync(debug)) return debug
  throw new Error(`xlm-core not found. Run: cd src-tauri && cargo build --bin xlm-core`)
}

/** App data dir — mirrors the Rust XDG default. */
export function appDataDir(): string {
  const xdg = process.env['XDG_DATA_HOME']
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share')
  return join(base, 'xenia-linux-manager')
}
```

Note: `paths.ts` imports `app` only for symmetry; the functions above do not call it, so the file is importable from a non-Electron Node test (the `electron` import resolves to the stub provided by the test — see Step 4). If `electron` import fails under plain Node, move the `app` import out (it is unused) — keep only `fs`/`os`/`path` imports.

- [ ] **Step 3: Write the failing SidecarClient test**

`electron/main/__tests__/sidecar.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { SidecarClient } from '../sidecar'

const repoRoot = join(__dirname, '..', '..', '..')
const release = join(repoRoot, 'src-tauri', 'target', 'release', 'xlm-core')
const debug = join(repoRoot, 'src-tauri', 'target', 'debug', 'xlm-core')
const BIN = existsSync(release) ? release : existsSync(debug) ? debug : ''

describe.skipIf(!BIN)('SidecarClient', () => {
  let client: SidecarClient
  afterEach(async () => { await client?.stop() })

  it('handshakes ready with a version', async () => {
    client = new SidecarClient({ binaryPath: BIN })
    client.start()
    const ready = await client.waitForReady(5000)
    expect(typeof ready.version).toBe('string')
  })

  it('answers ping and a real command', async () => {
    client = new SidecarClient({ binaryPath: BIN })
    client.start()
    await client.waitForReady(5000)
    expect(await client.request('ping')).toBe('pong')
    const settings = await client.request('get_default_settings') as Record<string, unknown>
    expect(settings).toHaveProperty('app_data_path')
  })

  it('rejects unknown method', async () => {
    client = new SidecarClient({ binaryPath: BIN })
    client.start()
    await client.waitForReady(5000)
    await expect(client.request('nope')).rejects.toThrow(/unknown method/)
  })

  it('correlates concurrent requests', async () => {
    client = new SidecarClient({ binaryPath: BIN })
    client.start()
    await client.waitForReady(5000)
    const [a, b] = await Promise.all([client.request('ping'), client.request('get_default_settings')])
    expect(a).toBe('pong')
    expect(b).toHaveProperty('app_data_path')
  })

  it('emits crash when the child dies', async () => {
    client = new SidecarClient({ binaryPath: BIN, autoRestart: false })
    client.start()
    await client.waitForReady(5000)
    const crashed = new Promise<void>((res) => client.on('crash', () => res()))
    await client.kill() // test helper: SIGKILL the child
    await crashed
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run --config vitest.electron.config.ts`
Expected: FAIL — `Cannot find module '../sidecar'` (or the suite skips if `xlm-core` is unbuilt; if skipped, run `cd src-tauri && cargo build --bin xlm-core` first, then re-run).

- [ ] **Step 5: Implement SidecarClient**

`electron/main/sidecar.ts`:

```ts
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface, Interface } from 'readline'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'

export type SidecarEvent = { event: string; payload: unknown }
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export interface SidecarOptions {
  binaryPath: string
  autoRestart?: boolean
  maxRestarts?: number
}

export class SidecarClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private rl: Interface | null = null
  private pending = new Map<string, Pending>()
  private emitter = new EventEmitter()
  private readyResolvers: Array<(v: { version: string }) => void> = []
  private ready = false
  private version = ''
  private restarts = 0
  private stopping = false

  constructor(private opts: SidecarOptions) {}

  start(): void {
    this.stopping = false
    const child = spawn(this.opts.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    this.rl = createInterface({ input: child.stdout })
    this.rl.on('line', (line) => this.onLine(line))
    child.stderr.on('data', (b) => { process.stderr.write(`[xlm-core] ${b}`) })
    child.on('exit', () => this.onExit())
    child.on('error', () => this.onExit())
  }

  private onLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: any
    try { msg = JSON.parse(trimmed) } catch { process.stderr.write(`[xlm-core] bad line: ${trimmed}\n`); return }
    if (msg.kind === 'response') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.result)
      else p.reject(new Error(typeof msg.error === 'string' ? msg.error : 'sidecar error'))
      return
    }
    if (msg.kind === 'event') {
      if (msg.event === 'ready') {
        this.ready = true
        this.version = msg.payload?.version ?? ''
        this.readyResolvers.splice(0).forEach((r) => r({ version: this.version }))
      }
      this.emitter.emit('any', { event: msg.event, payload: msg.payload })
      this.emitter.emit(msg.event, msg.payload)
    }
  }

  private onExit(): void {
    const err = new Error('sidecar process exited')
    this.pending.forEach((p) => p.reject(err))
    this.pending.clear()
    this.rl?.close()
    this.rl = null
    this.child = null
    this.ready = false
    this.emitter.emit('crash')
    if (this.stopping) return
    const max = this.opts.maxRestarts ?? 5
    if (this.opts.autoRestart && this.restarts < max) {
      const delay = Math.min(250 * 2 ** this.restarts, 5000)
      this.restarts += 1
      setTimeout(() => { if (!this.stopping) this.start() }, delay)
    }
  }

  waitForReady(timeoutMs = 5000): Promise<{ version: string }> {
    if (this.ready) return Promise.resolve({ version: this.version })
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('sidecar ready timeout')), timeoutMs)
      this.readyResolvers.push((v) => { clearTimeout(t); resolve(v) })
    })
  }

  request(method: string, params: object = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.child) return reject(new Error('sidecar not running'))
      const id = randomUUID()
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  on(event: string, cb: (payload: unknown) => void): () => void {
    this.emitter.on(event, cb)
    return () => this.emitter.off(event, cb)
  }

  onAny(cb: (e: SidecarEvent) => void): () => void {
    this.emitter.on('any', cb)
    return () => this.emitter.off('any', cb)
  }

  /** Test helper: hard-kill the child to exercise crash/restart. */
  async kill(): Promise<void> { this.child?.kill('SIGKILL') }

  async stop(): Promise<void> {
    this.stopping = true
    this.child?.kill()
    this.rl?.close()
    this.child = null
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo build --bin xlm-core && cd .. && npx vitest run --config vitest.electron.config.ts`
Expected: all `SidecarClient` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add electron/main/paths.ts electron/main/sidecar.ts electron/main/__tests__/sidecar.test.ts vitest.electron.config.ts
git commit -m "feat(electron): SidecarClient NDJSON bridge with unit tests against xlm-core"
```

---

### Task 3: IPC bridge + preload window.xlm + minimal smoke

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Create: `electron/preload/xlm.d.ts`
- Create: `electron/main/smoke.ts`

**Interfaces:**
- Consumes: `SidecarClient` (Task 2).
- Produces: `window.xlm.invoke(method, params)`, `window.xlm.on(event, cb)`; ipc channels `xlm:invoke`, `xlm:event`; `runSmoke(client)`; the `--smoke` entry path.

- [ ] **Step 1: Implement the preload bridge (invoke + on)**

`electron/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('xlm', {
  invoke: (method: string, params?: object) => ipcRenderer.invoke('xlm:invoke', method, params),
  on: (event: string, cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, msg: { event: string; payload: unknown }) => {
      if (msg.event === event) cb(msg.payload)
    }
    ipcRenderer.on('xlm:event', listener)
    return () => ipcRenderer.removeListener('xlm:event', listener)
  }
})
```

`electron/preload/xlm.d.ts`:

```ts
export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>
  on(event: string, cb: (payload: unknown) => void): () => void
  convertFileSrc(path: string): string
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>
}
declare global { interface Window { xlm: XlmBridge } }
```

- [ ] **Step 2: Create smoke.ts**

`electron/main/smoke.ts`:

```ts
import type { SidecarClient } from './sidecar'

/** Headless self-check; returns true on success. */
export async function runSmoke(client: SidecarClient): Promise<boolean> {
  try {
    const ready = await client.waitForReady(5000)
    const pong = await client.request('ping')
    const settings = await client.request('get_default_settings') as Record<string, unknown>
    const ok = pong === 'pong' && typeof settings.app_data_path === 'string' && !!ready.version
    process.stdout.write(`SMOKE ${ok ? 'PASS' : 'FAIL'}: ready=${ready.version} ping=${pong}\n`)
    return ok
  } catch (e) {
    process.stdout.write(`SMOKE FAIL: ${(e as Error).message}\n`)
    return false
  }
}
```

- [ ] **Step 3: Wire the main process to the sidecar + ipc + smoke**

Replace `electron/main/index.ts`:

```ts
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
  sidecar.onAny((e) => win.webContents.send('xlm:event', e))
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
    await sidecar.stop()
    app.exit(ok ? 0 : 1)
    return
  }

  await sidecar.waitForReady(8000).catch(() => { /* surfaced via crash event */ })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { sidecar?.stop() })
```

- [ ] **Step 4: Build, then run the smoke**

Run: `cd src-tauri && cargo build --bin xlm-core && cd .. && npm run smoke`
Expected: prints `SMOKE PASS: ready=<v> ping=pong` and exits 0. (`echo $?` → 0.)

- [ ] **Step 5: Commit**

```bash
git add electron/main/index.ts electron/preload/ electron/main/smoke.ts
git commit -m "feat(electron): ipc invoke + event piping + window.xlm bridge + --smoke ping/settings"
```

---

### Task 4: xlm-asset:// protocol + convertFileSrc + path validation

**Files:**
- Create: `electron/main/protocol.ts`
- Create: `electron/main/__tests__/protocol.test.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/smoke.ts`

**Interfaces:**
- Produces: `isPathAllowed(target, roots)` (pure), `registerAssetProtocol(getRoots)`; `window.xlm.convertFileSrc(path)`.

- [ ] **Step 1: Write the failing path-validation test**

`electron/main/__tests__/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPathAllowed } from '../protocol'

describe('isPathAllowed', () => {
  it('allows a path inside a root', () => {
    expect(isPathAllowed('/home/u/app/art/x.jpg', ['/home/u/app'])).toBe(true)
  })
  it('allows the root itself', () => {
    expect(isPathAllowed('/home/u/app', ['/home/u/app'])).toBe(true)
  })
  it('rejects a path outside all roots', () => {
    expect(isPathAllowed('/etc/shadow', ['/home/u/app'])).toBe(false)
  })
  it('rejects a traversal sibling-prefix trick', () => {
    expect(isPathAllowed('/home/u/app-evil/x', ['/home/u/app'])).toBe(false)
  })
  it('rejects when there are no roots', () => {
    expect(isPathAllowed('/anything', [])).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.electron.config.ts electron/main/__tests__/protocol.test.ts`
Expected: FAIL — `Cannot find module '../protocol'`.

- [ ] **Step 3: Implement protocol.ts**

```ts
import { protocol, net } from 'electron'
import { resolve, sep } from 'path'
import { pathToFileURL } from 'url'

/** True iff `target` is one of `roots` or strictly inside one (no sibling-prefix tricks). */
export function isPathAllowed(target: string, roots: string[]): boolean {
  const t = resolve(target)
  return roots.some((root) => {
    const r = resolve(root)
    return t === r || t.startsWith(r + sep)
  })
}

/** Register the privileged scheme. Call BEFORE app.whenReady(). */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'xlm-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Install the handler. `getRoots` returns the currently-allowed roots. Call AFTER ready. */
export function handleAssetProtocol(getRoots: () => string[]): void {
  protocol.handle('xlm-asset', async (request) => {
    const url = new URL(request.url) // xlm-asset://local/<encoded>
    const target = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!isPathAllowed(target, getRoots())) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.electron.config.ts electron/main/__tests__/protocol.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Add convertFileSrc to the preload**

In `electron/preload/index.ts`, add to the exposed object:

```ts
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
```

- [ ] **Step 6: Wire protocol into main + maintain allowed roots**

In `electron/main/index.ts`:
- Add imports: `import { registerAssetScheme, handleAssetProtocol } from './protocol'` and `import { appDataDir } from './paths'`.
- At module top level (before `app.whenReady`), call `registerAssetScheme()`.
- Add a mutable roots cache and refresh it from settings:

```ts
let allowedRoots: string[] = [appDataDir()]
async function refreshRoots(): Promise<void> {
  try {
    const [settings] = await sidecar.request('load_settings') as [Record<string, string>, unknown]
    allowedRoots = [appDataDir(), settings.app_data_path, settings.library_metadata_path, settings.xenia_path].filter(Boolean)
  } catch { /* keep default root */ }
}
```
- Inside `app.whenReady` after `sidecar.start()`: `handleAssetProtocol(() => allowedRoots)`, and `await refreshRoots()` before creating the window (non-smoke path).

- [ ] **Step 7: Extend the smoke with an asset check**

In `electron/main/smoke.ts`, after the settings check, add a deny-path assertion (deterministic, needs no real image):

```ts
import { isPathAllowed } from './protocol'
// inside runSmoke, after settings:
const denyOk = isPathAllowed('/etc/shadow', [settings.app_data_path as string]) === false
process.stdout.write(`SMOKE asset-deny ${denyOk ? 'PASS' : 'FAIL'}\n`)
// fold denyOk into the returned `ok`
```
Update the `ok` expression to `pong === 'pong' && typeof settings.app_data_path === 'string' && !!ready.version && denyOk`.

- [ ] **Step 8: Verify**

Run: `npx vitest run --config vitest.electron.config.ts && npm run smoke`
Expected: protocol tests 5/5 pass; `npm run smoke` exits 0 with `asset-deny PASS`.

- [ ] **Step 9: Commit**

```bash
git add electron/main/protocol.ts electron/main/__tests__/protocol.test.ts electron/main/index.ts electron/preload/index.ts electron/main/smoke.ts
git commit -m "feat(electron): xlm-asset:// protocol with path validation + convertFileSrc"
```

---

### Task 5: Dialog bridge

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Produces: `window.xlm.openDialog(opts)`; ipc channel `xlm:openDialog`.

- [ ] **Step 1: Add the main handler**

In `electron/main/index.ts`, add `dialog` to the electron import and register (inside `app.whenReady`, alongside the other `ipcMain.handle`):

```ts
ipcMain.handle('xlm:openDialog', (_e, opts: Electron.OpenDialogOptions) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts)
})
```

- [ ] **Step 2: Add the preload method**

In `electron/preload/index.ts`, add to the exposed object:

```ts
  openDialog: (opts: object) => ipcRenderer.invoke('xlm:openDialog', opts),
```

- [ ] **Step 3: Verify build + smoke unaffected**

Run: `npx electron-vite build && npm run smoke`
Expected: build clean; `npm run smoke` still exits 0 (dialog isn't exercised headlessly, but wiring must not break startup).

- [ ] **Step 4: Commit**

```bash
git add electron/main/index.ts electron/preload/index.ts
git commit -m "feat(electron): native file dialog bridge (window.xlm.openDialog)"
```

---

### Task 6: electron-updater scaffolding (graceful-inert)

**Files:**
- Create: `electron/main/updater.ts`
- Create: `electron/main/__tests__/updater.test.ts`
- Modify: `electron/main/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `initUpdater()` — never throws, logs, no-ops without a feed.

- [ ] **Step 1: Write the failing test**

`electron/main/__tests__/updater.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.electron.config.ts electron/main/__tests__/updater.test.ts`
Expected: FAIL — `Cannot find module '../updater'`.

- [ ] **Step 3: Implement updater.ts**

```ts
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

/** Check for app updates on launch. Graceful-inert until a feed exists (Phase 4). */
export function initUpdater(): void {
  try {
    autoUpdater.logger = log
    log.transports.file.level = 'info'
    autoUpdater.on('error', (err) => log.warn('[updater] error (expected until a feed is published):', err?.message))
    autoUpdater.on('update-not-available', () => log.info('[updater] no update available'))
    autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn('[updater] check failed:', e?.message))
  } catch (e) {
    log.warn('[updater] init failed:', (e as Error)?.message)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config vitest.electron.config.ts electron/main/__tests__/updater.test.ts`
Expected: PASS.

- [ ] **Step 5: Add build.publish to package.json and call initUpdater**

In `package.json`, add a top-level `"build"` block (electron-builder config; only `publish` is needed now — full packaging is Phase 4):

```json
"build": {
  "appId": "com.xenia-linux-manager.app",
  "publish": [{ "provider": "github", "owner": "REPLACE_OWNER", "repo": "xenia-linux-manager" }]
}
```
Confirm the actual GitHub `owner`/`repo` with the user before committing; if unknown, leave `REPLACE_OWNER` and note it.

In `electron/main/index.ts`, import `initUpdater` and call it inside `app.whenReady` (non-smoke path only, after the window is created):

```ts
if (!isSmoke) initUpdater()
```

- [ ] **Step 6: Verify smoke still green (updater inert)**

Run: `npm run smoke`
Expected: exits 0; no crash from the (absent) update feed. (Updater only runs in non-smoke path, so smoke is unaffected — this confirms startup ordering is correct.)

- [ ] **Step 7: Commit**

```bash
git add electron/main/updater.ts electron/main/__tests__/updater.test.ts electron/main/index.ts package.json
git commit -m "feat(electron): electron-updater scaffolding (graceful-inert) + build.publish"
```

---

### Task 7: Smoke harness hardening + crash→renderer + dev docs

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `electron/main/smoke.ts`
- Create: `electron/README.md`

**Interfaces:**
- Produces: `sidecar:crash` renderer event; finalized `npm run smoke`.

- [ ] **Step 1: Forward sidecar crash to the renderer**

In `electron/main/index.ts` `createWindow`, after wiring `onAny`, add:

```ts
sidecar.on('crash', () => win.webContents.send('xlm:event', { event: 'sidecar:crash', payload: {} }))
```

- [ ] **Step 2: Make the smoke exercise the full path deterministically**

Confirm `runSmoke` covers: `ready` handshake, `ping`, `load_settings` (a real stateful-free command), and the `isPathAllowed` deny case. (No GUI interaction.) Ensure `runSmoke` always resolves (never hangs): wrap each `request` in `waitForReady` first (already done) and rely on `SidecarClient` request having no built-in hang (add an optional per-call timeout if desired). Leave as-is if Tasks 3–4 already pass.

- [ ] **Step 3: Write electron/README.md (dev workflow)**

```markdown
# Electron shell (Phase 2)

## Prereqs
Build the Rust sidecar first: `cd src-tauri && cargo build --bin xlm-core`

## Dev
`npm run electron:dev` — launches the window against the Vite renderer dev server.

## Headless smoke (CI/agent)
`npm run smoke` — boots Electron under xvfb, round-trips ping + load_settings + asset-deny, exits 0/1.

## Tests
`npm run test:electron` — Node unit tests for SidecarClient, protocol path validation, updater.

## Notes
- Renderer still uses @tauri-apps/* (Phase 3 rewires it to window.xlm).
- Packaging / AppImage / binary bundling is Phase 4.
```

- [ ] **Step 4: Full verification**

Run:
```bash
cd src-tauri && cargo build --bin xlm-core && cd ..
npm run test:electron
npm run smoke; echo "smoke exit: $?"
npx electron-vite build
```
Expected: all electron unit tests pass; `smoke exit: 0`; build clean.

- [ ] **Step 5: Commit**

```bash
git add electron/main/index.ts electron/main/smoke.ts electron/README.md
git commit -m "feat(electron): forward sidecar crash to renderer + smoke harness + dev docs"
```

---

## Self-Review

**1. Spec coverage** (against `2026-06-16-electron-port-phase2-shell-design.md`):
- electron-vite 3-build config → Task 1. ✔
- `SidecarClient` (spawn, framing, request/response, ready, events, restart) → Task 2 + tests. ✔
- ipcMain invoke + event piping + preload `window.xlm.{invoke,on}` → Task 3. ✔
- `xlm-asset://` + allowed-root validation + `convertFileSrc` → Task 4 (+ unit test). ✔
- dialog bridge → Task 5. ✔
- electron-updater graceful-inert + `build.publish` → Task 6 (+ test). ✔
- `--smoke` under xvfb + crash→renderer → Tasks 3/7. ✔
- Security (sandbox, contextIsolation, CSP) → Task 1/3 webPreferences; **CSP header**: see gap below. 
- Node unit tests + headless smoke verification → Tasks 2,4,6 (unit) + 3,7 (smoke). ✔

**Gap found & fixed:** the spec mandates a tightened CSP; no task set it. Add to **Task 3 Step 3** `createWindow`, after creating `win`:
```ts
win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
  cb({ responseHeaders: { ...details.responseHeaders,
    'Content-Security-Policy': ["default-src 'self'; img-src 'self' data: xlm-asset:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"] } })
})
```
(In dev, electron-vite's HMR may need `connect-src 'self' ws:`; relax only in `!app.isPackaged`.)

**2. Placeholder scan:** `REPLACE_OWNER` in Task 6 is an explicit "confirm with user" value, not a silent placeholder. The `paths.ts` note about the unused `app` import is a concrete instruction. No `TODO`/"handle errors" placeholders.

**3. Type consistency:** `SidecarClient` methods (`start`/`waitForReady`/`request`/`on`/`onAny`/`stop`/`kill`) consistent between Task 2 (def) and Tasks 3,4,7 (use). `isPathAllowed(target, roots)` consistent Task 4 def + Task 4 Step 7 use. `window.xlm` shape in `xlm.d.ts` (Task 3) matches the preload object built across Tasks 3–5 (`invoke`, `on`, `convertFileSrc`, `openDialog`). ✔

## Out of scope (later phases)
- Renderer `bridge.ts`, swapping the 5 api clients + `listen`/`convertFileSrc`/dialog, removing `@tauri-apps/*` → **Phase 3**.
- electron-builder full config, AppImage target, bundling `xlm-core` as `extraResources`, `latest-linux.yml` publish, prod `file://` routing → **Phase 4**.
