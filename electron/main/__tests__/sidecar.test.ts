import { describe, it, expect, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { SidecarClient } from '../sidecar'

const repoRoot = join(__dirname, '..', '..', '..')
const release = join(repoRoot, 'core', 'target', 'release', 'xlm-core')
const debug = join(repoRoot, 'core', 'target', 'debug', 'xlm-core')
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
