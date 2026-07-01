export interface WinControls {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizeChange(cb: (maximized: boolean) => void): () => void
}

export interface UpdateApi {
  check(): Promise<void>
  install(): Promise<void>
  getStatus(): Promise<unknown>
  onStatus(cb: (status: unknown) => void): () => void
}

export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>
  on(event: string, cb: (payload: unknown) => void): () => void
  convertFileSrc(path: string): string
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>
  win: WinControls
  updates: UpdateApi
}
declare global { interface Window { xlm: XlmBridge } }
