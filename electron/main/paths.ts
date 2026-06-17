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
