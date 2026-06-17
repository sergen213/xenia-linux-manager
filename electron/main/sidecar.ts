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
