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
