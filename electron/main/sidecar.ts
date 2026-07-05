import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface, Interface } from 'readline'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'

export interface SidecarMessage {
  kind: 'response' | 'event'
  id?: string
  ok?: boolean
  result?: unknown
  error?: string
  event?: string
  payload?: unknown
}

export type SidecarEvent = { event: string; payload: unknown }
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

export interface SidecarOptions {
  binaryPath: string
  autoRestart?: boolean
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
  private opts: SidecarOptions

  constructor(opts: SidecarOptions) {
    this.opts = opts
  }

  start(): void {
    this.stopping = false
    const child = spawn(this.opts.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    this.rl = createInterface({ input: child.stdout })
    this.rl.on('line', (line) => this.onLine(line))
    child.stderr.on('data', (b) => { process.stderr.write(`[xlm-core] ${b}`) })
    // A write racing the child's death emits EPIPE on stdin; without a listener
    // that's an uncaught stream error that kills the whole main process.
    child.stdin.on('error', () => { /* exit handler rejects pending requests */ })
    let exitHandled = false
    const handleExit = () => { if (exitHandled) return; exitHandled = true; this.onExit() }
    child.on('exit', handleExit)
    child.on('error', handleExit)
  }

  private onLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: SidecarMessage
    try { msg = JSON.parse(trimmed) } catch { process.stderr.write(`[xlm-core] bad line: ${trimmed}\n`); return }
    if (msg.kind === 'response') {
      const p = this.pending.get(msg.id!)
      if (!p) return
      this.pending.delete(msg.id!)
      clearTimeout(p.timer)
      if (msg.ok) p.resolve(msg.result!)
      else p.reject(new Error(typeof msg.error === 'string' ? msg.error : 'sidecar error'))
      return
    }
    if (msg.kind === 'event') {
      if (msg.event === 'ready') {
        this.ready = true
        this.restarts = 0 // successful recovery replenishes the auto-restart budget
        this.version = (msg.payload as { version?: string } | undefined)?.version ?? ''
        this.readyResolvers.splice(0).forEach((r) => r({ version: this.version }))
      }
      this.emitter.emit('any', { event: msg.event!, payload: msg.payload })
      this.emitter.emit(msg.event!, msg.payload)
    }
  }

  private onExit(): void {
    const err = new Error('sidecar process exited')
    this.pending.forEach((p) => { clearTimeout(p.timer); p.reject(err) })
    this.pending.clear()
    this.rl?.close()
    this.rl = null
    this.child = null
    this.ready = false
    if (this.stopping) return
    this.emitter.emit('crash')
    const max = 5
    if (this.opts.autoRestart && this.restarts < max) {
      const delay = Math.min(250 * 2 ** this.restarts, 5000)
      this.restarts += 1
      setTimeout(() => { if (!this.stopping) this.start() }, delay)
    }
  }

  waitForReady(timeoutMs = 5000): Promise<{ version: string }> {
    if (this.ready) return Promise.resolve({ version: this.version })
    return new Promise((resolve, reject) => {
      const resolver = (v: { version: string }) => { clearTimeout(t); resolve(v) }
      const t = setTimeout(() => {
        this.readyResolvers = this.readyResolvers.filter((r) => r !== resolver)
        reject(new Error('sidecar ready timeout'))
      }, timeoutMs)
      this.readyResolvers.push(resolver)
    })
  }

  request(method: string, params: object = {}, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = this.child
      if (!child || child.stdin.destroyed) return reject(new Error('sidecar not running'))
      const id = randomUUID()
      // A dropped response line (stray stdout, `id: null` malformed-request
      // replies) must not hang the caller forever.
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`sidecar request timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
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
