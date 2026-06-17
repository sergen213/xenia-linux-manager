import type { SidecarClient } from './sidecar'
import { isPathAllowed } from './protocol'

/** Headless self-check; returns true on success. */
export async function runSmoke(client: SidecarClient): Promise<boolean> {
  try {
    const ready = await client.waitForReady(5000)
    const pong = await client.request('ping')
    const settings = await client.request('get_default_settings') as Record<string, unknown>
    const denyOk = isPathAllowed('/etc/shadow', [settings.app_data_path as string]) === false
    process.stdout.write(`SMOKE asset-deny ${denyOk ? 'PASS' : 'FAIL'}\n`)
    const ok = pong === 'pong' && typeof settings.app_data_path === 'string' && !!ready.version && denyOk
    process.stdout.write(`SMOKE ${ok ? 'PASS' : 'FAIL'}: ready=${ready.version} ping=${pong}\n`)
    return ok
  } catch (e) {
    process.stdout.write(`SMOKE FAIL: ${(e as Error).message}\n`)
    return false
  }
}
